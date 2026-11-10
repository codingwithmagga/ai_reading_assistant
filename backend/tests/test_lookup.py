import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app.lookup import (
    LookupPositionError,
    find_entities_by_name,
    validate_reading_position,
)
from app.models import Base, Book, Chapter, Entity, EntityAlias, Paragraph


@pytest.fixture
def session() -> Session:
    engine = create_engine("sqlite://")
    Base.metadata.create_all(engine)
    with Session(engine, expire_on_commit=False) as db_session:
        yield db_session
    engine.dispose()


def _create_lookup_data(session: Session) -> tuple[Book, Book]:
    book = Book(title="Testbuch", source_hash="a" * 64, status="ready")
    chapter = Chapter(
        book=book,
        index=0,
        start_position=0,
        end_position=5,
    )
    for position in range(6):
        book.paragraphs.append(
            Paragraph(
                chapter=chapter,
                position=position,
                text=f"Absatz {position}",
            )
        )

    marta = Entity(
        book=book,
        type="person",
        canonical_name="Marta",
        first_position=0,
    )
    marta.aliases.extend(
        [
            EntityAlias(alias="die Wirtin", first_position=1),
            EntityAlias(alias="die Fremde", first_position=3),
            EntityAlias(alias="späterer Name", first_position=4),
        ]
    )
    lea = Entity(
        book=book,
        type="person",
        canonical_name="Lea",
        first_position=2,
    )
    lea.aliases.append(EntityAlias(alias="die Fremde", first_position=3))
    later_entity = Entity(
        book=book,
        type="concept",
        canonical_name="Geheimnis",
        first_position=4,
    )

    other_book = Book(title="Anderes Buch", source_hash="b" * 64, status="ready")
    other_book.entities.append(
        Entity(
            type="person",
            canonical_name="Marta",
            first_position=0,
        )
    )
    session.add_all([book, other_book, marta, lea, later_entity])
    session.commit()
    return book, other_book


def test_validate_reading_position_uses_stored_paragraph_range(session: Session) -> None:
    book, _ = _create_lookup_data(session)

    assert validate_reading_position(session, book.id, 0) == 0
    assert validate_reading_position(session, book.id, 5) == 5

    for position in (-1, 6):
        with pytest.raises(LookupPositionError):
            validate_reading_position(session, book.id, position)


def test_validate_reading_position_rejects_books_without_paragraphs(session: Session) -> None:
    book = Book(title="Leeres Buch", source_hash="c" * 64, status="ready")
    session.add(book)
    session.commit()

    with pytest.raises(LookupPositionError, match="keine lesbaren Absätze"):
        validate_reading_position(session, book.id, 0)


def test_find_entities_by_name_normalizes_exact_names_and_scopes_to_book(
    session: Session,
) -> None:
    book, _ = _create_lookup_data(session)

    results = find_entities_by_name(
        session,
        book_id=book.id,
        query="  MARTA ",
        position=0,
    )

    assert [entity.canonical_name for entity in results] == ["Marta"]
    assert (
        find_entities_by_name(
            session,
            book_id=book.id,
            query="Mart",
            position=5,
        )
        == []
    )


def test_find_entities_by_name_only_matches_introduced_aliases_and_preserves_ambiguity(
    session: Session,
) -> None:
    book, _ = _create_lookup_data(session)
    query = "DIE   FREMDE"

    assert (
        find_entities_by_name(
            session,
            book_id=book.id,
            query=query,
            position=2,
        )
        == []
    )
    assert [
        entity.canonical_name
        for entity in find_entities_by_name(
            session,
            book_id=book.id,
            query=query,
            position=3,
        )
    ] == ["Marta", "Lea"]
    assert [
        entity.canonical_name
        for entity in find_entities_by_name(
            session,
            book_id=book.id,
            query="späterer Name",
            position=3,
        )
    ] == []
    assert [
        entity.canonical_name
        for entity in find_entities_by_name(
            session,
            book_id=book.id,
            query="Geheimnis",
            position=3,
        )
    ] == []
    assert find_entities_by_name(
        session,
        book_id=book.id,
        query="  ",
        position=5,
    ) == []
