from datetime import UTC, datetime, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models import Book, Job
from tests.api_helpers import build_test_epub


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


def test_extraction_job_api_recovers_expired_worker_lease(
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
    job_id = start_response.json()["id"]

    with Session(client.app.state.test_engine) as session:
        job = session.get(Job, job_id)
        book = session.get(Book, book_id)
        assert job is not None
        assert book is not None
        job.status = "running"
        job.progress = 50
        job.last_completed_chapter_index = 0
        job.last_completed_block_index = 0
        job.lease_expires_at = datetime.now(UTC) - timedelta(minutes=5)
        book.status = "extracting"
        session.commit()

    response = client.post(f"/books/{book_id}/extraction-jobs")

    assert response.status_code == 202
    assert response.json()["id"] == job_id
    assert response.json()["status"] == "pending"
    assert response.json()["progress"] == 50
    assert response.json()["last_completed_chapter_index"] == 0
    assert response.json()["last_completed_block_index"] == 0
    assert queued_job_ids == [job_id, job_id]
    with Session(client.app.state.test_engine) as session:
        job = session.get(Job, job_id)
        book = session.get(Book, book_id)
        assert job is not None
        assert book is not None
        assert job.lease_expires_at is None
        assert book.status == "parsed"
