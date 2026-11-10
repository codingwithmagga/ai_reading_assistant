import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.extraction_jobs import process_extraction_job
from app.extraction_schemas import (
    AliasExtraction,
    ChapterExtraction,
    ChapterParagraph,
    EntityExtraction,
    EntityType,
    FactExtraction,
    FactKind,
    KnownEntity,
)
from app.models import Book
from app.openai_extractor import ExtractionResponse
from tests.api_helpers import build_test_epub


class FakeExtractor:
    def extract_with_usage(
        self,
        *,
        chapter_title: str | None,
        paragraphs: list[ChapterParagraph],
        known_entities: list[KnownEntity],
    ) -> ExtractionResponse:
        assert chapter_title == "Kapitel Eins"
        assert [paragraph.reference for paragraph in paragraphs] == ["p0", "p1", "p2"]
        assert known_entities == []
        extraction = ChapterExtraction(
            entities=[
                EntityExtraction(
                    canonical_name="Marta",
                    entity_type=EntityType.PERSON,
                    first_mention_ref="p1",
                )
            ],
            aliases=[
                AliasExtraction(
                    entity_name="Marta",
                    alias="die Wirtin",
                    paragraph_ref="p2",
                )
            ],
            facts=[
                FactExtraction(
                    entity_name="Marta",
                    text="Marta betritt den Raum.",
                    paragraph_ref="p1",
                    source_excerpt="Erster Absatz.",
                    kind=FactKind.DESCRIPTION,
                ),
                FactExtraction(
                    entity_name="Marta",
                    text="Marta spricht den Gast an.",
                    paragraph_ref="p2",
                    source_excerpt="Zweiter Absatz.",
                    kind=FactKind.EVENT,
                ),
            ],
            relationships=[],
        )
        return ExtractionResponse(extraction, input_tokens=12, output_tokens=6)


def test_upload_extract_and_query_flow_uses_database_positions_and_spoiler_filters(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    upload = client.post(
        "/books",
        files={"file": ("sample.epub", build_test_epub(), "application/epub+zip")},
    )
    assert upload.status_code == 201
    book_id = upload.json()["id"]

    def run_job(job_id: str) -> None:
        with Session(client.app.state.test_engine) as session:
            process_extraction_job(session, job_id, extractor=FakeExtractor())

    monkeypatch.setattr("app.books.run_extraction_job_background", run_job)
    started = client.post(f"/books/{book_id}/extraction-jobs")

    assert started.status_code == 202
    job_id = started.json()["id"]
    jobs = client.get(f"/books/{book_id}/jobs")
    assert jobs.status_code == 200
    extraction_job = next(job for job in jobs.json() if job["id"] == job_id)
    assert extraction_job["status"] == "completed"
    assert extraction_job["input_tokens"] == 12
    assert extraction_job["output_tokens"] == 6

    with Session(client.app.state.test_engine) as session:
        book = session.get(Book, book_id)
        assert book is not None
        assert book.status == "ready"

    before_introduction = client.get(
        f"/books/{book_id}/entities",
        params={"position": 0},
    )
    at_introduction = client.get(
        f"/books/{book_id}/entities",
        params={"position": 1},
    )
    assert before_introduction.status_code == at_introduction.status_code == 200
    assert before_introduction.json() == []
    assert [entity["canonical_name"] for entity in at_introduction.json()] == ["Marta"]
    assert at_introduction.json()[0]["aliases"] == []

    before_alias = client.get(
        f"/books/{book_id}/lookup",
        params={"q": "die Wirtin", "position": 1},
    )
    at_alias = client.get(
        f"/books/{book_id}/lookup",
        params={"q": "die Wirtin", "position": 2},
    )
    assert before_alias.status_code == at_alias.status_code == 200
    assert before_alias.json()["matches"] == []
    assert len(at_alias.json()["matches"]) == 1
    assert [
        fact["position"] for fact in at_alias.json()["matches"][0]["facts"]
    ] == [1, 2]

    before_event = client.get(
        f"/books/{book_id}/recap",
        params={"position": 1},
    )
    at_event = client.get(
        f"/books/{book_id}/recap",
        params={"position": 2},
    )
    assert before_event.status_code == at_event.status_code == 200
    assert before_event.json()["events"] == []
    assert [event["text"] for event in at_event.json()["events"]] == [
        "Marta spricht den Gast an."
    ]
