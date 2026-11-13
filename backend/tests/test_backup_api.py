import json
from hashlib import sha256
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.extraction_jobs import create_extraction_job, process_extraction_job
from app.extraction_schemas import ChapterExtraction
from app.models import (
    Book,
    Chapter,
    Entity,
    EntityAlias,
    ExtractionCheckpoint,
    Job,
    Paragraph,
    Relationship,
)
from app.openai_extractor import ExtractionResponse
from tests.api_helpers import build_test_epub
from tests.test_workflow_integration import FakeExtractor


def upload(client: TestClient, content: bytes | None = None) -> str:
    response = client.post(
        "/books",
        files={"file": ("sample.epub", content or build_test_epub(), "application/epub+zip")},
    )
    assert response.status_code == 201
    return response.json()["id"]


def restore(client: TestClient, backup: object):
    return client.post(
        "/backup", files={"file": ("backup.json", json.dumps(backup), "application/json")}
    )


def test_backup_roundtrip_preserves_resume_and_spoiler_boundary(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    book_id = upload(client)

    def run_job(job_id: str) -> None:
        with Session(client.app.state.test_engine) as session:
            process_extraction_job(session, job_id, extractor=FakeExtractor())

    monkeypatch.setattr("app.books.run_extraction_job_background", run_job)
    assert client.post(f"/books/{book_id}/extraction-jobs").status_code == 202
    assert client.put(f"/books/{book_id}/progress", json={"position": 2}).status_code == 200
    response = client.get("/backup")
    assert response.status_code == 200
    assert "attachment" in response.headers["content-disposition"]
    backup = response.json()
    assert backup["version"] == 1
    assert '"paragraphs"' not in json.dumps(backup)
    assert '"text": "Kapitel Eins"' not in json.dumps(backup)

    with Session(client.app.state.test_engine) as session:
        session.execute(delete(Entity).where(Entity.book_id == book_id))
        session.execute(delete(Job).where(Job.book_id == book_id))
        book = session.get(Book, book_id)
        book.current_position = None
        book.status = "parsed"
        session.commit()

    result = restore(client, backup)
    assert result.status_code == 200, result.text
    assert result.json() == {"restored": 1}
    assert client.get(f"/books/{book_id}/progress").json()["current_position"] == 2
    assert client.get(f"/books/{book_id}/entities", params={"position": 0}).json() == []
    assert client.get(
        f"/books/{book_id}/lookup", params={"q": "die Wirtin", "position": 1}
    ).json()["matches"] == []
    match = client.get(
        f"/books/{book_id}/lookup", params={"q": "die Wirtin", "position": 2}
    ).json()["matches"][0]
    assert [fact["position"] for fact in match["facts"]] == [1, 2]
    with Session(client.app.state.test_engine) as session:
        job = session.scalar(select(Job).where(Job.book_id == book_id, Job.type == "extraction"))
        assert job.status == "completed"
        assert (job.input_tokens, job.output_tokens) == (12, 6)
        assert len(list(session.scalars(select(ExtractionCheckpoint)))) == 1


@pytest.mark.parametrize("mutation", ["version", "missing", "layout", "position", "reference"])
def test_invalid_backup_is_atomic(client: TestClient, mutation: str) -> None:
    book_id = upload(client)
    assert client.put(f"/books/{book_id}/progress", json={"position": 1}).status_code == 200
    backup = client.get("/backup").json()
    item = backup["books"][0]
    if mutation == "version":
        backup["version"] = 2
    elif mutation == "missing":
        item["source_hash"] = "a" * 64
    elif mutation == "layout":
        item["chapters"][0]["positions"].pop()
    elif mutation == "position":
        item["current_position"] = 999
    else:
        item["facts"].append(
            {"entity_id": "missing", "chapter_index": 0, "position": 0,
             "text": "x", "source_excerpt": "x", "kind": "event"}
        )
    result = restore(client, backup)
    assert result.status_code in (409, 422)
    assert client.get(f"/books/{book_id}/progress").json()["current_position"] == 1


def test_rejects_malformed_and_active_jobs(client: TestClient) -> None:
    book_id = upload(client)
    backup = client.get("/backup").json()
    assert (
        client.post("/backup", files={"file": ("bad.json", "{", "application/json")}).status_code
        == 422
    )
    with Session(client.app.state.test_engine) as session:
        session.add(Job(book_id=book_id, type="extraction", status="pending", progress=0))
        session.commit()
    assert client.get("/backup").status_code == 409
    assert restore(client, backup).status_code == 409


def test_backup_download_and_upload_share_size_limit(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    upload(client)
    original = client.get("/backup")
    assert original.status_code == 200
    size = len(original.content)
    monkeypatch.setattr(
        "app.backup.get_settings",
        lambda: SimpleNamespace(epub_max_upload_bytes=size + 64 * 1024),
    )
    assert client.get("/backup").status_code == 200
    response = client.post(
        "/backup", files={"file": ("backup.json", original.content, "application/json")}
    )
    assert response.status_code == 200
    monkeypatch.setattr(
        "app.backup.get_settings",
        lambda: SimpleNamespace(epub_max_upload_bytes=size - 1 + 64 * 1024),
    )
    assert client.get("/backup").json()["detail"]["code"] == "backup_too_large"
    response = client.post(
        "/backup", files={"file": ("backup.json", original.content, "application/json")}
    )
    assert response.status_code == 413
    assert response.json()["detail"]["code"] == "backup_too_large"


def test_restore_to_reuploaded_epub_remaps_references_and_relationships(client: TestClient) -> None:
    content = build_test_epub()
    old_id = upload(client, content)
    with Session(client.app.state.test_engine) as session:
        first = Entity(book_id=old_id, type="person", canonical_name="Marta", first_position=0)
        second = Entity(book_id=old_id, type="person", canonical_name="Lea", first_position=2)
        session.add_all([first, second])
        session.flush()
        session.add(Relationship(
            book_id=old_id, entity_a_id=first.id, entity_b_id=second.id,
            label="knows", position=2,
        ))
        session.commit()
    backup = client.get("/backup").json()
    with Session(client.app.state.test_engine) as session:
        session.delete(session.get(Book, old_id))
        session.commit()
    new_id = upload(client, content)
    assert new_id != old_id
    assert restore(client, backup).json() == {"restored": 1}
    early = client.get(f"/books/{new_id}/lookup", params={"q": "Marta", "position": 1}).json()
    late = client.get(f"/books/{new_id}/lookup", params={"q": "Marta", "position": 2}).json()
    assert early["matches"][0]["relationships"] == []
    assert len(late["matches"][0]["relationships"]) == 1


def test_missing_second_book_does_not_change_first_and_extra_books_are_untouched(
    client: TestClient,
) -> None:
    content = build_test_epub("first")
    first = upload(client, content)
    second = upload(client, build_test_epub("second"))
    assert client.put(f"/books/{first}/progress", json={"position": 1}).status_code == 200
    backup = client.get("/backup").json()
    assert client.put(f"/books/{first}/progress", json={"position": 2}).status_code == 200
    with Session(client.app.state.test_engine) as session:
        session.delete(session.get(Book, second))
        session.commit()
    assert restore(client, backup).status_code == 409
    assert client.get(f"/books/{first}/progress").json()["current_position"] == 2
    extra = upload(client, build_test_epub("extra"))
    backup["books"] = [
        item for item in backup["books"]
        if item["source_hash"] == sha256(content).hexdigest()
    ]
    assert restore(client, backup).json() == {"restored": 1}
    assert client.get(f"/books/{first}/progress").json()["current_position"] == 1
    assert client.get(f"/books/{extra}").status_code == 200


def test_restore_failed_job_resumes_from_checkpoint(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    book_id = upload(client)
    settings = get_settings().model_copy(update={"extraction_max_paragraphs_per_block": 1})
    calls = []

    class Extractor:
        def extract_with_usage(self, *, chapter_title, paragraphs, known_entities):
            calls.append(paragraphs[0].text)
            if len(calls) == 2:
                raise ValueError("interrupted")
            return ExtractionResponse(
                ChapterExtraction(entities=[], aliases=[], facts=[], relationships=[]), 1, 1
            )

    with Session(client.app.state.test_engine) as session:
        job = create_extraction_job(session, book_id)
        with pytest.raises(ValueError, match="interrupted"):
            process_extraction_job(session, job.id, extractor=Extractor(), settings=settings)
    monkeypatch.setattr("app.backup.get_settings", lambda: settings)
    backup = client.get("/backup").json()
    assert restore(client, backup).status_code == 200
    assert client.get(f"/books/{book_id}").json()["status"] == "error"
    chapter_id = client.get(f"/books/{book_id}/chapters").json()[0]["id"]
    assert client.get(f"/books/{book_id}/content/{chapter_id}").status_code == 200
    with Session(client.app.state.test_engine) as session:
        resumed = create_extraction_job(session, book_id)
        process_extraction_job(session, resumed.id, extractor=Extractor(), settings=settings)
        assert resumed.status == "completed"
        assert resumed.input_tokens == 3
    assert calls == ["Kapitel Eins", "Erster Absatz.", "Erster Absatz.", "Zweiter Absatz."]


def test_empty_parsing_error_is_excluded_and_existing_record_is_untouched(
    client: TestClient,
) -> None:
    book_id = upload(client)
    backup = client.get("/backup").json()
    assert client.put(f"/books/{book_id}/progress", json={"position": 1}).status_code == 200
    content = b"invalid epub"
    response = client.post("/books", files={"file": ("bad.epub", content, "application/epub+zip")})
    assert response.status_code == 422
    bad_id = response.json()["detail"]["book_id"]
    response = client.get("/backup")
    assert response.status_code == 200
    assert len(response.json()["books"]) == 1
    assert restore(client, response.json()).json() == {"restored": 1}
    assert client.get(f"/books/{bad_id}").json()["status"] == "error"
    assert client.put(f"/books/{book_id}/progress", json={"position": 1}).status_code == 200
    bad_book = backup["books"][0].copy()
    bad_book.update(
        source_hash=sha256(content).hexdigest(),
        status="error",
        chapters=[],
        jobs=[],
    )
    backup["books"].append(bad_book)
    response = restore(client, backup)
    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "backup_unrestorable_book"
    assert client.get(f"/books/{book_id}/progress").json()["current_position"] == 1


@pytest.mark.parametrize("data", ["entity", "progress", "job", "paragraph"])
def test_unparsed_record_with_data_is_not_silently_excluded(client: TestClient, data: str) -> None:
    book_id = upload(client)
    response = client.post(
        "/books", files={"file": ("bad.epub", b"invalid epub", "application/epub+zip")}
    )
    bad_id = response.json()["detail"]["book_id"]
    with Session(client.app.state.test_engine) as session:
        if data == "entity":
            session.add(Entity(book_id=bad_id, type="person", canonical_name="Marta",
                               first_position=0))
        elif data == "progress":
            session.get(Book, bad_id).current_position = 0
        elif data == "job":
            session.add(Job(book_id=bad_id, type="extraction", status="error", progress=0))
        else:
            chapter = session.scalar(select(Chapter).where(Chapter.book_id == book_id))
            session.add(Paragraph(book_id=bad_id, chapter_id=chapter.id, position=0, text="x"))
        session.commit()
    response = client.get("/backup")
    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "backup_unrestorable_book"


def test_library_with_only_failed_upload_has_empty_backup(client: TestClient) -> None:
    response = client.post(
        "/books", files={"file": ("bad.epub", b"invalid epub", "application/epub+zip")}
    )
    assert response.status_code == 422
    response = client.get("/backup")
    assert response.status_code == 200
    assert response.json() == {"version": 1, "books": []}


def test_resume_settings_mismatch_is_rejected(client: TestClient, monkeypatch: pytest.MonkeyPatch):
    book_id = upload(client)
    original_settings = get_settings().model_copy(update={"extraction_max_paragraphs_per_block": 1})

    class InterruptedExtractor:
        calls = 0

        def extract_with_usage(self, *, chapter_title, paragraphs, known_entities):
            self.calls += 1
            if self.calls == 2:
                raise ValueError("interrupted")
            return ExtractionResponse(
                ChapterExtraction(entities=[], aliases=[], facts=[], relationships=[]), 1, 1
            )

    with Session(client.app.state.test_engine) as session:
        job = create_extraction_job(session, book_id)
        with pytest.raises(ValueError):
            process_extraction_job(
                session, job.id, extractor=InterruptedExtractor(), settings=original_settings
            )
    monkeypatch.setattr("app.backup.get_settings", lambda: original_settings)
    response = client.get("/backup")
    assert response.status_code == 200
    backup = response.json()
    changed_settings = original_settings.model_copy(
        update={"extraction_max_paragraphs_per_block": 2}
    )
    monkeypatch.setattr("app.backup.get_settings", lambda: changed_settings)
    response = client.get("/backup")
    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "backup_checkpoint_incompatible"
    response = restore(client, backup)
    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "backup_checkpoint_incompatible"
    monkeypatch.setattr("app.backup.get_settings", lambda: original_settings)
    assert restore(client, backup).status_code == 200


def test_export_rejects_unrestorable_persisted_data(client: TestClient) -> None:
    book_id = upload(client)
    with Session(client.app.state.test_engine) as session:
        entity = Entity(book_id=book_id, type="person", canonical_name="Marta", first_position=2)
        entity.aliases.append(EntityAlias(alias="M", first_position=1))
        session.add(entity)
        session.commit()
    response = client.get("/backup")
    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "backup_inconsistent_data"


def test_extraction_whitespace_evidence_and_completed_job_survive_settings_change(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    book_id = upload(client)

    class WhitespaceExtractor(FakeExtractor):
        def extract_with_usage(self, **kwargs):
            result = super().extract_with_usage(**kwargs)
            result.extraction.facts[0].source_excerpt = "ERSTER   ABSATZ."
            return result

    with Session(client.app.state.test_engine) as session:
        job = create_extraction_job(session, book_id)
        process_extraction_job(session, job.id, extractor=WhitespaceExtractor())
    changed_settings = get_settings().model_copy(update={"extraction_max_paragraphs_per_block": 1})
    monkeypatch.setattr("app.backup.get_settings", lambda: changed_settings)
    backup = client.get("/backup")
    assert backup.status_code == 200
    assert restore(client, backup.json()).status_code == 200
    match = client.get(
        f"/books/{book_id}/lookup", params={"q": "die Wirtin", "position": 2}
    ).json()["matches"][0]
    assert match["facts"][0]["source_excerpt"] == "ERSTER   ABSATZ."


@pytest.mark.parametrize("mutation", ["excerpt", "checkpoint", "duplicate_fact", "boolean_version"])
def test_rejects_tampered_backup_without_replacement(
    client: TestClient, monkeypatch: pytest.MonkeyPatch, mutation: str
) -> None:
    book_id = upload(client)

    def run_job(job_id: str) -> None:
        with Session(client.app.state.test_engine) as session:
            process_extraction_job(session, job_id, extractor=FakeExtractor())

    monkeypatch.setattr("app.books.run_extraction_job_background", run_job)
    assert client.post(f"/books/{book_id}/extraction-jobs").status_code == 202
    backup = client.get("/backup").json()
    book = backup["books"][0]
    if mutation == "excerpt":
        book["facts"][0]["source_excerpt"] = "not in book"
    elif mutation == "checkpoint":
        job = next(item for item in book["jobs"] if item["type"] == "extraction")
        job["extraction_checkpoints"][0]["first_paragraph_position"] = 1
    elif mutation == "duplicate_fact":
        book["facts"].append(book["facts"][0].copy())
    else:
        backup["version"] = True
    book["current_position"] = 2
    assert restore(client, backup).status_code == 422
    assert client.get(f"/books/{book_id}/progress").json()["current_position"] is None
    assert len(client.get(
        f"/books/{book_id}/lookup", params={"q": "Marta", "position": 2}
    ).json()["matches"][0]["facts"]) == 2
