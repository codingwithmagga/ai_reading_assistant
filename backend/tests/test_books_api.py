import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.config import Settings
from app.models import Book, Chapter, Job, Paragraph
from tests.api_helpers import build_test_epub


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
