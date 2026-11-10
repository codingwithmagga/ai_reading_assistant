from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models import Book
from tests.api_helpers import build_test_epub


def test_reading_progress_defaults_to_null_and_persists_updates(client: TestClient) -> None:
    upload = client.post(
        "/books",
        files={"file": ("sample.epub", build_test_epub(), "application/epub+zip")},
    )
    book_id = upload.json()["id"]

    response = client.get(f"/books/{book_id}/progress")
    assert response.status_code == 200
    assert response.json() == {"book_id": book_id, "current_position": None}

    response = client.put(f"/books/{book_id}/progress", json={"position": 2})
    assert response.status_code == 200
    assert response.json() == {"book_id": book_id, "current_position": 2}
    assert client.get(f"/books/{book_id}/progress").json()["current_position"] == 2

    with Session(client.app.state.test_engine) as session:
        book = session.get(Book, book_id)
        assert book is not None
        assert book.current_position == 2


def test_reading_progress_rejects_positions_outside_book(client: TestClient) -> None:
    upload = client.post(
        "/books",
        files={"file": ("sample.epub", build_test_epub(), "application/epub+zip")},
    )
    book_id = upload.json()["id"]

    for position in (-1, 3):
        response = client.put(f"/books/{book_id}/progress", json={"position": position})
        assert response.status_code == 422
        assert response.json()["detail"]["code"] == "invalid_reading_position"

    assert client.put(f"/books/{book_id}/progress", json={"position": "invalid"}).status_code == 422


def test_reading_progress_returns_404_for_unknown_book(client: TestClient) -> None:
    get_response = client.get("/books/missing/progress")
    assert get_response.status_code == 404
    assert get_response.json()["detail"]["code"] == "book_not_found"

    put_response = client.put("/books/missing/progress", json={"position": 0})
    assert put_response.status_code == 404
    assert put_response.json()["detail"]["code"] == "book_not_found"
