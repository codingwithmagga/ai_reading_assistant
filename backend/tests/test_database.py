from pathlib import Path

import pytest
from alembic.config import Config
from sqlalchemy import inspect, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from alembic import command
from app.config import get_settings
from app.database import create_database_engine
from app.models import Book, Chapter, Entity, EntityAlias, Fact, Paragraph, Relationship

BACKEND_DIR = Path(__file__).resolve().parents[1]


def migrate_database(database_url: str, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("DATABASE_URL", database_url)
    get_settings.cache_clear()
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
        assert {
            "alembic_version",
            "books",
            "chapters",
            "paragraphs",
            "jobs",
            "entities",
            "entity_aliases",
            "facts",
            "relationships",
            "extraction_checkpoints",
        } <= set(inspector.get_table_names())
        assert "current_position" in {
            column["name"] for column in inspector.get_columns("books")
        }
        assert inspector.get_foreign_keys("chapters")[0]["options"]["ondelete"] == "CASCADE"
        assert inspector.get_foreign_keys("paragraphs")
        assert inspector.get_foreign_keys("entity_aliases")[0]["options"]["ondelete"] == "CASCADE"
        assert {fk["referred_table"] for fk in inspector.get_foreign_keys("facts")} == {
            "books",
            "chapters",
            "entities",
        }
        assert len(inspector.get_foreign_keys("relationships")) == 3
        assert {index["name"] for index in inspector.get_indexes("facts")} == {
            "ix_facts_book_position",
            "ix_facts_entity_position",
        }
        assert {index["name"] for index in inspector.get_indexes("jobs")} >= {
            "uq_jobs_active_extraction_book"
        }
        assert {
            "error_code",
            "last_completed_chapter_index",
            "last_completed_block_index",
            "input_tokens",
            "output_tokens",
            "lease_expires_at",
        } <= {column["name"] for column in inspector.get_columns("jobs")}
        assert {index["name"] for index in inspector.get_indexes("extraction_checkpoints")} == {
            "ix_extraction_checkpoints_job_order"
        }
    finally:
        engine.dispose()


def test_extraction_schema_constraints_and_relationships(
        tmp_path: Path,
        monkeypatch: pytest.MonkeyPatch,
) -> None:
        database_url = f"sqlite:///{(tmp_path / 'extraction.db').as_posix()}"
        migrate_database(database_url, monkeypatch)
        engine = create_database_engine(database_url)

        with Session(engine) as session:
            book = Book(title="Testbuch", source_hash="b" * 64, status="parsed")
            chapter = Chapter(
                book=book,
                index=0,
                start_position=0,
                end_position=1,
            )
            person = Entity(
                book=book,
                type="person",
                canonical_name="Marta",
                first_position=0,
            )
            place = Entity(
                book=book,
                type="place",
                canonical_name="Dorf",
                first_position=1,
            )
            person.aliases.append(EntityAlias(alias="die Wirtin", first_position=1))
            fact = Fact(
                book=book,
                entity=person,
                chapter=chapter,
                text="Marta ist Wirtin.",
                position=1,
                source_excerpt="Die Wirtin bringt den Tee.",
                kind="description",
            )
            relationship = Relationship(
                book=book,
                entity_a=person,
                entity_b=place,
                label="lebt in",
                position=1,
            )
            session.add_all([fact, relationship])
            session.commit()

            assert person.book_id == book.id
            assert person.aliases[0].first_position == 1
            assert fact.chapter_id == chapter.id
            assert relationship.entity_a_id == person.id
            assert relationship.entity_b_id == place.id

            session.add(
                Entity(
                    book=book,
                    type="unknown",
                    canonical_name="Ungültig",
                    first_position=0,
                )
            )
            with pytest.raises(IntegrityError):
                session.commit()
            session.rollback()

            session.add(
                EntityAlias(entity=person, alias="die Wirtin", first_position=2)
            )
            with pytest.raises(IntegrityError):
                session.commit()
            session.rollback()

            session.add(
                Fact(
                    book=book,
                    entity=person,
                    chapter=chapter,
                    text="Zu langer Quellauszug.",
                    position=0,
                    source_excerpt="x" * 201,
                    kind="event",
                )
            )
            with pytest.raises(IntegrityError):
                session.commit()
            session.rollback()

        engine.dispose()


def test_extraction_migration_can_be_downgraded_and_reapplied(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    database_url = f"sqlite:///{(tmp_path / 'downgrade.db').as_posix()}"
    migrate_database(database_url, monkeypatch)
    config = Config(str(BACKEND_DIR / "alembic.ini"))
    config.set_main_option("script_location", str(BACKEND_DIR / "alembic"))

    command.downgrade(config, "0002_unique_book_source_hash")
    engine = create_database_engine(database_url)
    try:
        assert not {"entities", "entity_aliases", "facts", "relationships"} & set(
            inspect(engine).get_table_names()
        )
        assert "extraction_checkpoints" not in inspect(engine).get_table_names()
        assert "current_position" not in {
            column["name"] for column in inspect(engine).get_columns("books")
        }
        assert "error_code" not in {
            column["name"] for column in inspect(engine).get_columns("jobs")
        }
    finally:
        engine.dispose()

    command.upgrade(config, "head")
    engine = create_database_engine(database_url)
    try:
        assert {
            "entities",
            "entity_aliases",
            "facts",
            "relationships",
            "extraction_checkpoints",
        } <= set(inspect(engine).get_table_names())
        assert "current_position" in {
            column["name"] for column in inspect(engine).get_columns("books")
        }
    finally:
        engine.dispose()


@pytest.mark.parametrize("direction", ["upgrade", "downgrade"])
@pytest.mark.parametrize("fail_restore", [False, True])
def test_chapter_limit_migration_preserves_checkpoints(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    direction: str,
    fail_restore: bool,
) -> None:
    database_url = f"sqlite:///{(tmp_path / 'checkpoints.db').as_posix()}"
    monkeypatch.setenv("DATABASE_URL", database_url)
    get_settings.cache_clear()
    config = Config(str(BACKEND_DIR / "alembic.ini"))
    config.set_main_option("script_location", str(BACKEND_DIR / "alembic"))
    command.upgrade(config, "0005_reading_progress" if direction == "upgrade" else "head")

    engine = create_database_engine(database_url)
    try:
        with engine.begin() as connection:
            assert connection.exec_driver_sql("PRAGMA foreign_keys").scalar_one() == 1
            connection.execute(text(
                "INSERT INTO books (id, title, created_at, status, source_hash) "
                "VALUES ('book', 'Test', '2026-01-01', 'parsed', 'hash')"
            ))
            connection.execute(text(
                "INSERT INTO jobs (id, book_id, type, status, progress, created_at) "
                "VALUES ('job', 'book', 'extraction', 'error', 50, '2026-01-01')"
            ))
            connection.execute(text(
                "INSERT INTO extraction_checkpoints "
                "(id, job_id, chapter_index, block_index, first_paragraph_position, "
                "paragraph_count, result_json, input_tokens, output_tokens, created_at) "
                "VALUES ('checkpoint', 'job', 2, 1, 10, 3, '{}', 100, 20, '2026-01-01')"
            ))
            before = connection.exec_driver_sql("SELECT * FROM extraction_checkpoints").all()
            if fail_restore:
                connection.exec_driver_sql(
                    "CREATE TRIGGER reject_checkpoint_restore "
                    "BEFORE INSERT ON extraction_checkpoints "
                    "BEGIN SELECT RAISE(ABORT, 'checkpoint restore failed'); END"
                )

        def migrate() -> None:
            if direction == "upgrade":
                command.upgrade(config, "head")
            else:
                command.downgrade(config, "0005_reading_progress")

        if fail_restore:
            with pytest.raises(IntegrityError, match="checkpoint restore failed"):
                migrate()
        else:
            migrate()

        with engine.begin() as connection:
            after = connection.exec_driver_sql("SELECT * FROM extraction_checkpoints").all()
            assert after == before
            assert connection.exec_driver_sql("PRAGMA foreign_key_check").all() == []
            assert connection.exec_driver_sql("SELECT id FROM jobs").scalar_one() == "job"
            has_limit = (direction == "upgrade") != fail_restore
            assert ("max_chapter_index" in {
                column["name"] for column in inspect(connection).get_columns("jobs")
            }) == has_limit
            if has_limit:
                assert connection.exec_driver_sql(
                    "SELECT max_chapter_index FROM jobs"
                ).scalar_one() is None
                with pytest.raises(IntegrityError):
                    connection.exec_driver_sql("UPDATE jobs SET max_chapter_index = -1")
                connection.exec_driver_sql("UPDATE jobs SET max_chapter_index = 0")
            connection.exec_driver_sql("DELETE FROM jobs WHERE id = 'job'")
            assert connection.exec_driver_sql("SELECT * FROM extraction_checkpoints").all() == []
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
        session.add(
            Book(
                title="Ungültige Leseposition",
                source_hash="c" * 64,
                current_position=-1,
            )
        )
        with pytest.raises(IntegrityError):
            session.commit()
        session.rollback()

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
