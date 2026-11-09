from pathlib import Path

import pytest
from alembic.config import Config
from sqlalchemy import inspect
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from alembic import command
from app.database import create_database_engine
from app.models import Book, Chapter, Paragraph

BACKEND_DIR = Path(__file__).resolve().parents[1]


def migrate_database(database_url: str, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("DATABASE_URL", database_url)
    config = Config(str(BACKEND_DIR / "alembic.ini"))
    config.set_main_option("script_location", str(BACKEND_DIR / "alembic"))
    command.upgrade(config, "head")


def test_migration_creates_schema_on_empty_database(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    database_url = f"sqlite:///{(tmp_path / 'empty.db').as_posix()}"
    migrate_database(database_url, monkeypatch)

    engine = create_database_engine(database_url)
    try:
        inspector = inspect(engine)
        assert {"alembic_version", "books", "chapters", "paragraphs", "jobs"} <= set(
            inspector.get_table_names()
        )
        assert inspector.get_foreign_keys("chapters")[0]["options"]["ondelete"] == "CASCADE"
        assert inspector.get_foreign_keys("paragraphs")
    finally:
        engine.dispose()


def test_constraints_enforce_unique_positions_and_foreign_keys(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    database_url = f"sqlite:///{(tmp_path / 'constraints.db').as_posix()}"
    migrate_database(database_url, monkeypatch)
    engine = create_database_engine(database_url)

    with Session(engine) as session:
        book = Book(title="Test", source_hash="a" * 64)
        chapter = Chapter(
            book=book,
            index=0,
            start_position=0,
            end_position=0,
        )
        paragraph = Paragraph(book=book, chapter=chapter, position=0, text="Text")
        session.add(paragraph)
        session.commit()

        session.add(Paragraph(book=book, chapter=chapter, position=0, text="Duplikat"))
        with pytest.raises(IntegrityError):
            session.commit()
        session.rollback()

        session.add(
            Paragraph(
                book=book,
                chapter_id="missing-chapter",
                position=1,
                text="Verwaister Absatz",
            )
        )
        with pytest.raises(IntegrityError):
            session.commit()
        session.rollback()

    engine.dispose()
