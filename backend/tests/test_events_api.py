"""Tests for the events API endpoints."""

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.database import get_session
from app.models import Book, Chapter, Event, Paragraph


@pytest.fixture
def test_book(client: TestClient) -> tuple[Book, str]:
    """Create a test book with chapters and paragraphs."""
    # We'll add the book directly through the database to avoid API dependencies
    app = client.app
    with app.state.test_engine.begin() as conn:
        from sqlalchemy.orm import sessionmaker
        SessionLocal = sessionmaker(bind=app.state.test_engine)
        session = SessionLocal()

        book = Book(
            id="test-book-1",
            title="Test Book",
            author="Test Author",
            language="en",
            status="ready",
            source_hash="hash123",
        )
        session.add(book)
        session.flush()

        chapter = Chapter(
            id="ch-1",
            book_id=book.id,
            index=0,
            title="Chapter 1",
            start_position=0,
            end_position=99,
        )
        session.add(chapter)
        session.flush()

        para1 = Paragraph(
            id="para-1",
            book_id=book.id,
            chapter_id=chapter.id,
            position=0,
            text="Paragraph 1",
        )
        para2 = Paragraph(
            id="para-50",
            book_id=book.id,
            chapter_id=chapter.id,
            position=50,
            text="Paragraph 50",
        )
        session.add_all([para1, para2])
        session.commit()

        return book, book.id


@pytest.fixture
def test_events(client: TestClient, test_book: tuple[Book, str]) -> list[Event]:
    """Create test events for a book."""
    book, book_id = test_book
    app = client.app
    with app.state.test_engine.begin() as conn:
        from sqlalchemy.orm import sessionmaker
        SessionLocal = sessionmaker(bind=app.state.test_engine)
        session = SessionLocal()

        events = [
            Event(
                id="event-1",
                book_id=book_id,
                position=10,
                title="First Meeting",
                description="Alice meets Bob",
                event_type="meeting",
                entities=["Alice", "Bob"],
            ),
            Event(
                id="event-2",
                book_id=book_id,
                position=30,
                title="Discovery",
                description="A secret is revealed",
                event_type="discovery",
                entities=["Secret"],
            ),
            Event(
                id="event-3",
                book_id=book_id,
                position=60,
                title="Climax",
                description="The final confrontation",
                event_type="action",
                entities=["Alice", "Bob"],
            ),
        ]
        session.add_all(events)
        session.commit()
        return events


def test_get_events_no_position_filter(client: TestClient, test_book: tuple[Book, str], test_events: list[Event]) -> None:
    """Test retrieving all events for a book without position filter."""
    book, book_id = test_book
    response = client.get(f"/books/{book_id}/events")
    assert response.status_code == 200

    data = response.json()
    assert len(data) == 3
    assert data[0]["title"] == "First Meeting"
    assert data[1]["title"] == "Discovery"
    assert data[2]["title"] == "Climax"


def test_get_events_with_position_filter(client: TestClient, test_book: tuple[Book, str], test_events: list[Event]) -> None:
    """Test retrieving events filtered by position."""
    book, book_id = test_book
    response = client.get(f"/books/{book_id}/events?position=35")
    assert response.status_code == 200

    data = response.json()
    assert len(data) == 2
    assert data[0]["title"] == "First Meeting"
    assert data[1]["title"] == "Discovery"


def test_get_events_with_strict_position_boundary(
    client: TestClient, test_book: tuple[Book, str], test_events: list[Event]
) -> None:
    """Test that position filter is inclusive."""
    book, book_id = test_book
    response = client.get(f"/books/{book_id}/events?position=30")
    assert response.status_code == 200

    data = response.json()
    assert len(data) == 2
    assert any(e["title"] == "Discovery" for e in data)


def test_get_events_beyond_all_positions(client: TestClient, test_book: tuple[Book, str], test_events: list[Event]) -> None:
    """Test retrieving all events when position is beyond the last event."""
    book, book_id = test_book
    response = client.get(f"/books/{book_id}/events?position=100")
    assert response.status_code == 200

    data = response.json()
    assert len(data) == 3


def test_get_events_before_first_event(client: TestClient, test_book: tuple[Book, str], test_events: list[Event]) -> None:
    """Test retrieving no events when position is before the first event."""
    book, book_id = test_book
    response = client.get(f"/books/{book_id}/events?position=5")
    assert response.status_code == 200

    data = response.json()
    assert len(data) == 0


def test_get_events_nonexistent_book(client: TestClient) -> None:
    """Test retrieving events for a nonexistent book."""
    response = client.get("/books/nonexistent-book/events")
    assert response.status_code == 404


def test_get_events_pagination(client: TestClient, test_book: tuple[Book, str], test_events: list[Event]) -> None:
    """Test pagination parameters for events."""
    book, book_id = test_book
    response = client.get(f"/books/{book_id}/events?limit=2&offset=0")
    assert response.status_code == 200

    data = response.json()
    assert len(data) == 2


def test_get_events_pagination_offset(client: TestClient, test_book: tuple[Book, str], test_events: list[Event]) -> None:
    """Test pagination offset parameter."""
    book, book_id = test_book
    response = client.get(f"/books/{book_id}/events?limit=2&offset=1")
    assert response.status_code == 200

    data = response.json()
    assert len(data) == 2
    assert data[0]["title"] == "Discovery"


def test_event_fields_returned_correctly(
    client: TestClient, test_book: tuple[Book, str], test_events: list[Event]
) -> None:
    """Test that all event fields are returned correctly."""
    book, book_id = test_book
    response = client.get(f"/books/{book_id}/events")
    assert response.status_code == 200

    data = response.json()
    event = data[0]

    assert "id" in event
    assert "book_id" in event
    assert "position" in event
    assert "title" in event
    assert "description" in event
    assert "event_type" in event
    assert "entities" in event
    assert "created_at" in event

    assert event["book_id"] == book_id
    assert event["position"] == 10
    assert event["event_type"] == "meeting"
    assert event["entities"] == ["Alice", "Bob"]
