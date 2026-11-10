from collections.abc import Generator
from datetime import UTC, datetime, timedelta
from io import BytesIO
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile

import pytest
from alembic.config import Config
from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.orm import Session, sessionmaker

from alembic import command
from app.config import Settings, get_settings
from app.database import create_database_engine, get_session
from app.main import app
from app.models import (
    Book,
    Chapter,
    Entity,
    EntityAlias,
    Fact,
    Job,
    Paragraph,
    Relationship,
)

BACKEND_DIR = Path(__file__).resolve().parents[1]


def build_test_epub(identifier: str = "api-test") -> bytes:
    files = {
        "mimetype": b"application/epub+zip",
        "META-INF/container.xml": b"""<?xml version="1.0"?>
          <container version="1.0"
            xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
            <rootfiles><rootfile
              full-path="OEBPS/content.opf"
              media-type="application/oebps-package+xml"/></rootfiles>
          </container>""",
        "OEBPS/content.opf": b"""<?xml version="1.0"?>
          <package xmlns="http://www.idpf.org/2007/opf" version="2.0"
            unique-identifier="bookid">
            <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
              <dc:identifier id="bookid">api-test</dc:identifier>
              <dc:title>API Testbuch</dc:title>
              <dc:creator>Test Autor</dc:creator>
              <dc:language>de</dc:language>
            </metadata>
            <manifest><item id="chapter" href="chapter.xhtml"
              media-type="application/xhtml+xml"/>
              <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
            </manifest>
            <spine toc="ncx"><itemref idref="chapter"/></spine>
          </package>""",
        "OEBPS/toc.ncx": b"""<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/">
          <head/><docTitle><text>API Testbuch</text></docTitle><navMap/>
          </ncx>""",
        "OEBPS/chapter.xhtml": b"""<html xmlns="http://www.w3.org/1999/xhtml">
          <body><h1>Kapitel Eins</h1><p>Erster Absatz.</p><p>Zweiter Absatz.</p></body>
          </html>""",
    }
    output = BytesIO()
    with ZipFile(output, "w") as archive:
        archive.writestr("mimetype", files.pop("mimetype"), compress_type=0)
        for name, content in files.items():
            content = content.replace(b"api-test", identifier.encode())
            archive.writestr(name, content, compress_type=ZIP_DEFLATED)
    return output.getvalue()


@pytest.fixture
def client(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Generator[TestClient, None, None]:
    database_path = (tmp_path / "books.db").as_posix()
    database_url = f"sqlite:///{database_path}"
    monkeypatch.setenv("DATABASE_URL", database_url)
    get_settings.cache_clear()
    config = Config(str(BACKEND_DIR / "alembic.ini"))
    config.set_main_option("script_location", str(BACKEND_DIR / "alembic"))
    command.upgrade(config, "head")

    engine = create_database_engine(database_url)
    app.state.test_engine = engine
    test_session = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)

    def override_get_session() -> Generator[Session, None, None]:
        with test_session() as session:
            yield session

    app.dependency_overrides[get_session] = override_get_session
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()
    del app.state.test_engine
    engine.dispose()
    get_settings.cache_clear()


def test_upload_persists_book_chapters_and_ordered_paragraphs(client: TestClient) -> None:
    response = client.post(
        "/books",
        files={"file": ("sample.epub", build_test_epub(), "application/epub+zip")},
    )

    assert response.status_code == 201
    book_response = response.json()
    assert book_response["title"] == "API Testbuch"
    assert book_response["author"] == "Test Autor"
    assert book_response["language"] == "de"
    assert book_response["status"] == "parsed"
    assert book_response["reused"] is False
    assert len(book_response["source_hash"]) == 64

    with Session(client.app.state.test_engine) as session:
        book = session.get(Book, book_response["id"])
        assert book is not None
        assert len(book.chapters) == 1
        assert book.chapters[0].index == 0
        assert book.chapters[0].start_position == 0
        assert book.chapters[0].end_position == 2
        assert [paragraph.position for paragraph in book.paragraphs] == [0, 1, 2]
        assert [paragraph.text for paragraph in book.paragraphs] == [
            "Kapitel Eins",
            "Erster Absatz.",
            "Zweiter Absatz.",
        ]
        job = session.scalar(select(Job).where(Job.book_id == book.id))
        assert job is not None
        assert job.status == "completed"
        assert job.progress == 100


def test_duplicate_upload_returns_existing_book(client: TestClient) -> None:
    content = build_test_epub()
    first = client.post("/books", files={"file": ("first.epub", content)})
    second = client.post("/books", files={"file": ("renamed.epub", content)})

    assert first.status_code == 201
    assert second.status_code == 200
    assert second.json()["id"] == first.json()["id"]
    assert second.json()["reused"] is True


def test_invalid_epub_is_recorded_as_error_without_partial_content(client: TestClient) -> None:
    content = b"not an epub"
    response = client.post("/books", files={"file": ("broken.epub", content)})

    assert response.status_code == 422
    detail = response.json()["detail"]
    assert detail["code"] == "invalid_epub"
    assert "message" in detail
    book_id = detail["book_id"]

    with Session(client.app.state.test_engine) as session:
        book = session.get(Book, book_id)
        assert book is not None
        assert book.title == "broken"
        assert book.status == "error"
        assert (
            session.scalar(
                select(func.count()).select_from(Chapter).where(Chapter.book_id == book_id)
            )
            == 0
        )
        assert (
            session.scalar(
                select(func.count()).select_from(Paragraph).where(Paragraph.book_id == book_id)
            )
            == 0
        )
        job = session.scalar(select(Job).where(Job.book_id == book_id))
        assert job is not None
        assert job.status == "error"
        assert job.error == detail["message"]

    duplicate = client.post("/books", files={"file": ("broken-again.epub", content)})
    assert duplicate.status_code == 200
    assert duplicate.json()["id"] == book_id
    assert duplicate.json()["status"] == "error"
    assert duplicate.json()["error"] == detail["message"]


def test_upload_limit_returns_413(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr("app.books.get_settings", lambda: Settings(epub_max_upload_mb=1))

    response = client.post(
        "/books",
        files={"file": ("large.epub", b"x" * (1024 * 1024 + 1))},
    )

    assert response.status_code == 413
    assert response.json()["detail"]["code"] == "upload_too_large"


def test_book_library_chapters_and_content_endpoints(client: TestClient) -> None:
    upload_response = client.post(
        "/books",
        files={"file": ("sample.epub", build_test_epub(), "application/epub+zip")},
    )
    book = upload_response.json()
    book_id = book["id"]

    books_response = client.get("/books")
    assert books_response.status_code == 200
    assert len(books_response.json()) == 1
    assert books_response.json()[0]["id"] == book_id
    assert "source_hash" not in books_response.json()[0]

    book_response = client.get(f"/books/{book_id}")
    assert book_response.status_code == 200
    assert book_response.json()["title"] == "API Testbuch"
    assert book_response.json()["status"] == "parsed"

    chapters_response = client.get(f"/books/{book_id}/chapters")
    assert chapters_response.status_code == 200
    chapters = chapters_response.json()
    assert len(chapters) == 1
    chapter = chapters[0]
    assert chapter["index"] == 0
    assert chapter["title"] == "Kapitel Eins"
    assert chapter["start_position"] == 0
    assert chapter["end_position"] == 2

    content_response = client.get(f"/books/{book_id}/content/{chapter['id']}")
    assert content_response.status_code == 200
    content = content_response.json()
    assert content["book_id"] == book_id
    assert [paragraph["position"] for paragraph in content["paragraphs"]] == [0, 1, 2]
    assert [paragraph["text"] for paragraph in content["paragraphs"]] == [
        "Kapitel Eins",
        "Erster Absatz.",
        "Zweiter Absatz.",
    ]


def test_book_read_endpoints_return_404_for_missing_or_unrelated_ids(
    client: TestClient,
) -> None:
    response = client.get("/books/missing")
    assert response.status_code == 404
    assert response.json() == {
        "detail": {"code": "book_not_found", "message": "Buch nicht gefunden."}
    }
    assert client.get("/books/missing/chapters").status_code == 404
    assert client.get("/books/missing/content/missing").status_code == 404

    upload_response = client.post(
        "/books",
        files={"file": ("sample.epub", build_test_epub(), "application/epub+zip")},
    )
    book_id = upload_response.json()["id"]
    response = client.get(f"/books/{book_id}/content/not-a-chapter")
    assert response.status_code == 404
    assert response.json() == {
        "detail": {"code": "chapter_not_found", "message": "Kapitel nicht gefunden."}
    }

    second_book_upload = client.post(
        "/books",
        files={"file": ("second.epub", build_test_epub("api-test-2"))},
    )
    assert second_book_upload.status_code == 201
    second_book_id = second_book_upload.json()["id"]
    second_chapter_id = client.get(f"/books/{second_book_id}/chapters").json()[0]["id"]
    response = client.get(f"/books/{book_id}/content/{second_chapter_id}")
    assert response.status_code == 404
    assert response.json() == {
        "detail": {"code": "chapter_not_found", "message": "Kapitel nicht gefunden."}
    }


def test_extraction_job_api_starts_once_and_reports_job_status(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    queued_job_ids: list[str] = []
    monkeypatch.setattr(
        "app.books.run_extraction_job_background",
        lambda job_id: queued_job_ids.append(job_id),
    )
    upload_response = client.post(
        "/books",
        files={"file": ("sample.epub", build_test_epub(), "application/epub+zip")},
    )
    book_id = upload_response.json()["id"]

    start_response = client.post(f"/books/{book_id}/extraction-jobs")

    assert start_response.status_code == 202
    job = start_response.json()
    assert job["book_id"] == book_id
    assert job["type"] == "extraction"
    assert job["status"] == "pending"
    assert job["progress"] == 0
    assert job["error"] is None
    assert job["input_tokens"] == 0
    assert job["output_tokens"] == 0
    assert queued_job_ids == [job["id"]]

    duplicate_start = client.post(f"/books/{book_id}/extraction-jobs")
    assert duplicate_start.status_code == 202
    assert duplicate_start.json()["id"] == job["id"]
    assert queued_job_ids == [job["id"], job["id"]]

    with Session(client.app.state.test_engine) as session:
        extraction_job = session.get(Job, job["id"])
        assert extraction_job is not None
        extraction_job.status = "running"
        extraction_job.lease_expires_at = datetime.now(UTC) + timedelta(minutes=5)
        session.commit()

    active_start = client.post(f"/books/{book_id}/extraction-jobs")
    assert active_start.status_code == 409
    assert active_start.json()["detail"]["code"] == "extraction_job_active"

    with Session(client.app.state.test_engine) as session:
        extraction_job = session.get(Job, job["id"])
        assert extraction_job is not None
        extraction_job.status = "error"
        extraction_job.lease_expires_at = None
        extraction_job.progress = 50
        extraction_job.error_code = "OpenAIError"
        extraction_job.error = "Extraktionsjob fehlgeschlagen (OpenAIError)."
        extraction_job.last_completed_chapter_index = 0
        extraction_job.last_completed_block_index = 1
        extraction_job.input_tokens = 123
        extraction_job.output_tokens = 45
        session.commit()

    jobs_response = client.get(f"/books/{book_id}/jobs")
    assert jobs_response.status_code == 200
    jobs = jobs_response.json()
    assert jobs[0]["id"] == job["id"]
    assert jobs[0]["status"] == "error"
    assert jobs[0]["progress"] == 50
    assert jobs[0]["last_completed_chapter_index"] == 0
    assert jobs[0]["last_completed_block_index"] == 1
    assert jobs[0]["error_code"] == "OpenAIError"
    assert jobs[0]["error"] == "Extraktionsjob fehlgeschlagen (OpenAIError)."
    assert jobs[0]["input_tokens"] == 123
    assert jobs[0]["output_tokens"] == 45
    assert jobs[1]["type"] == "parsing"

    with Session(client.app.state.test_engine) as session:
        book_record = session.get(Book, book_id)
        assert book_record is not None
        book_record.status = "error"
        session.commit()

    resumed_response = client.post(f"/books/{book_id}/extraction-jobs")
    assert resumed_response.status_code == 202
    assert resumed_response.json()["id"] == job["id"]
    assert resumed_response.json()["status"] == "pending"
    assert resumed_response.json()["progress"] == 50
    assert resumed_response.json()["input_tokens"] == 123
    assert queued_job_ids == [job["id"], job["id"], job["id"]]
    with Session(client.app.state.test_engine) as session:
        book_record = session.get(Book, book_id)
        assert book_record is not None
        assert book_record.status == "parsed"


def test_extraction_job_api_reports_missing_and_unready_books(client: TestClient) -> None:
    assert client.post("/books/missing/extraction-jobs").status_code == 404
    assert client.get("/books/missing/jobs").status_code == 404

    response = client.post(
        "/books",
        files={"file": ("sample.epub", build_test_epub(), "application/epub+zip")},
    )
    book_id = response.json()["id"]
    with Session(client.app.state.test_engine) as session:
        book = session.get(Book, book_id)
        assert book is not None
        book.status = "extracting"
        session.commit()

    start_response = client.post(f"/books/{book_id}/extraction-jobs")
    assert start_response.status_code == 409
    assert start_response.json()["detail"]["code"] == "book_not_ready_for_extraction"


def _create_lookup_book(client: TestClient, *, with_extraction: bool = True) -> str:
    with Session(client.app.state.test_engine) as session:
        book = Book(
            title="Synthetischer Roman",
            source_hash="c" * 64 if with_extraction else "d" * 64,
            status="ready",
        )
        chapters = [
            Chapter(
                book=book,
                index=0,
                title="Anfang",
                start_position=0,
                end_position=2,
            ),
            Chapter(
                book=book,
                index=1,
                title="Später",
                start_position=3,
                end_position=5,
            ),
        ]
        for position in range(6):
            chapter = chapters[0] if position <= 2 else chapters[1]
            book.paragraphs.append(
                Paragraph(
                    chapter=chapter,
                    position=position,
                    text=f"Absatz {position}",
                )
            )

        if with_extraction:
            marta = Entity(
                book=book,
                type="person",
                canonical_name="Marta",
                first_position=0,
            )
            village = Entity(
                book=book,
                type="place",
                canonical_name="Dorf",
                first_position=1,
            )
            lea = Entity(
                book=book,
                type="person",
                canonical_name="Lea",
                first_position=2,
            )
            secret = Entity(
                book=book,
                type="concept",
                canonical_name="Geheimnis",
                first_position=4,
            )
            marta.aliases.extend(
                [
                    EntityAlias(alias="die Wirtin", first_position=1),
                    EntityAlias(alias="Frau Keller", first_position=4),
                    EntityAlias(alias="die Fremde", first_position=3),
                ]
            )
            lea.aliases.append(EntityAlias(alias="die Fremde", first_position=3))

            book.facts.extend(
                [
                    Fact(
                        entity=marta,
                        chapter=chapters[0],
                        text="Marta erscheint.",
                        position=0,
                        source_excerpt="Marta trat ein.",
                        kind="event",
                    ),
                    Fact(
                        entity=village,
                        chapter=chapters[0],
                        text="Das Dorf liegt am Fluss.",
                        position=1,
                        source_excerpt="Das Dorf lag am Fluss.",
                        kind="description",
                    ),
                    Fact(
                        entity=marta,
                        chapter=chapters[0],
                        text="Marta führt den Laden.",
                        position=2,
                        source_excerpt="Sie führte den Laden.",
                        kind="description",
                    ),
                    Fact(
                        entity=marta,
                        chapter=chapters[1],
                        text="Marta kennt den geheimen Plan.",
                        position=5,
                        source_excerpt="Sie kannte den geheimen Plan.",
                        kind="event",
                    ),
                ]
            )
            book.relationships.extend(
                [
                    Relationship(
                        entity_a=marta,
                        entity_b=village,
                        label="lebt in",
                        position=2,
                    ),
                    Relationship(
                        entity_a=marta,
                        entity_b=secret,
                        label="kennt",
                        position=3,
                    ),
                ]
            )

        session.add(book)
        session.commit()
        return book.id


def test_entity_list_hides_entities_and_aliases_until_introduced(client: TestClient) -> None:
    book_id = _create_lookup_book(client)
    expected_names = [
        {"Marta"},
        {"Marta", "Dorf"},
        {"Marta", "Dorf", "Lea"},
        {"Marta", "Dorf", "Lea"},
        {"Marta", "Dorf", "Lea", "Geheimnis"},
        {"Marta", "Dorf", "Lea", "Geheimnis"},
    ]

    for position, names in enumerate(expected_names):
        response = client.get(
            f"/books/{book_id}/entities",
            params={"position": position},
        )

        assert response.status_code == 200
        entities = response.json()
        assert {entity["canonical_name"] for entity in entities} == names
        assert all(entity["first_position"] <= position for entity in entities)
        for entity in entities:
            assert all(alias["first_position"] <= position for alias in entity["aliases"])

    at_position_0 = client.get(
        f"/books/{book_id}/entities",
        params={"position": 0},
    ).json()
    assert at_position_0[0]["aliases"] == []
    at_position_1 = client.get(
        f"/books/{book_id}/entities",
        params={"position": 1},
    ).json()
    marta = next(entity for entity in at_position_1 if entity["canonical_name"] == "Marta")
    assert {alias["alias"] for alias in marta["aliases"]} == {"die Wirtin"}


def test_lookup_filters_every_fact_and_relationship_by_reading_position(
    client: TestClient,
) -> None:
    book_id = _create_lookup_book(client)

    for position in range(6):
        response = client.get(
            f"/books/{book_id}/lookup",
            params={"q": "Marta", "position": position},
        )

        assert response.status_code == 200
        payload = response.json()
        serialized = response.text
        assert "Marta führt den Laden." not in serialized or position >= 2
        assert "Marta kennt den geheimen Plan." not in serialized or position == 5
        assert "Geheimnis" not in serialized or position >= 4
        assert "lebt in" not in serialized or position >= 2
        assert "kennt" not in serialized or position >= 4
        matches = payload["matches"]
        if position == 0:
            assert matches[0]["facts"][0]["text"] == "Marta erscheint."
        for match in matches:
            assert all(fact["position"] <= position for fact in match["facts"])
            assert all(
                relationship["position"] <= position
                for relationship in match["relationships"]
            )


def test_lookup_alias_is_position_gated_and_ambiguous_alias_is_not_collapsed(
    client: TestClient,
) -> None:
    book_id = _create_lookup_book(client)
    hidden_alias = client.get(
        f"/books/{book_id}/lookup",
        params={"q": "die Fremde", "position": 2},
    )
    assert hidden_alias.status_code == 200
    assert hidden_alias.json()["matches"] == []

    introduced_alias = client.get(
        f"/books/{book_id}/lookup",
        params={"q": "die Fremde", "position": 3},
    )
    assert introduced_alias.status_code == 200
    assert {
        match["entity"]["canonical_name"] for match in introduced_alias.json()["matches"]
    } == {"Marta", "Lea"}

    hidden_later_alias = client.get(
        f"/books/{book_id}/lookup",
        params={"q": "Frau Keller", "position": 3},
    )
    assert hidden_later_alias.status_code == 200
    assert hidden_later_alias.json()["matches"] == []


def test_lookup_rejects_invalid_positions_and_empty_queries(client: TestClient) -> None:
    book_id = _create_lookup_book(client)

    for position in (-1, 6):
        response = client.get(
            f"/books/{book_id}/lookup",
            params={"q": "Marta", "position": position},
        )
        assert response.status_code == 422

    empty_query = client.get(
        f"/books/{book_id}/lookup",
        params={"q": "  ", "position": 0},
    )
    assert empty_query.status_code == 422


def test_lookup_reports_unknown_books_and_empty_extraction_as_empty_results(
    client: TestClient,
) -> None:
    missing = client.get(
        "/books/missing/lookup",
        params={"q": "Marta", "position": 0},
    )
    assert missing.status_code == 404
    missing_entities = client.get(
        "/books/missing/entities",
        params={"position": 0},
    )
    assert missing_entities.status_code == 404

    empty_book_id = _create_lookup_book(client, with_extraction=False)
    entities = client.get(
        f"/books/{empty_book_id}/entities",
        params={"position": 0},
    )
    lookup = client.get(
        f"/books/{empty_book_id}/lookup",
        params={"q": "Marta", "position": 0},
    )
    assert entities.status_code == 200
    assert entities.json() == []
    assert lookup.status_code == 200
    assert lookup.json()["matches"] == []
