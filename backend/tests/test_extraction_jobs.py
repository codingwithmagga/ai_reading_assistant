from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session

from app.config import Settings
from app.extraction_jobs import (
    ExtractionJobAlreadyActiveError,
    ExtractionJobBusyError,
    create_extraction_job,
    process_extraction_job,
)
from app.extraction_schemas import (
    AliasExtraction,
    ChapterExtraction,
    EntityExtraction,
    EntityType,
)
from app.models import Base, Book, Chapter, ExtractionCheckpoint, Job, Paragraph
from app.openai_extractor import ExtractionResponse


class FakeExtractor:
    def __init__(self, *, fail_on_call: int | None = None) -> None:
        self.calls: list[dict[str, object]] = []
        self.fail_on_call = fail_on_call

    def extract_with_usage(self, **kwargs: object) -> ExtractionResponse:
        self.calls.append(kwargs)
        if len(self.calls) == self.fail_on_call:
            raise RuntimeError("private source text must not leak")

        extraction = ChapterExtraction(
            entities=[
                EntityExtraction(
                    canonical_name="Marta",
                    entity_type=EntityType.PERSON,
                    first_mention_ref="p0",
                )
            ],
            aliases=[
                AliasExtraction(
                    entity_name="Marta",
                    alias="die Wirtin",
                    paragraph_ref="p0",
                )
            ],
            facts=[],
            relationships=[],
        )
        return ExtractionResponse(extraction, input_tokens=10, output_tokens=3)


@pytest.fixture
def session() -> Session:
    engine = create_engine("sqlite://")
    Base.metadata.create_all(engine)
    with Session(engine, expire_on_commit=False) as db_session:
        yield db_session
    engine.dispose()


def _create_parsed_book(session: Session) -> Book:
    book = Book(title="Testbuch", source_hash="c" * 64, status="parsed")
    first = Chapter(book=book, index=0, start_position=0, end_position=2, title="Erstes")
    second = Chapter(book=book, index=1, start_position=3, end_position=3, title="Zweites")
    for chapter, position, text in (
        (first, 0, "Marta öffnet die Tür."),
        (first, 1, "Marta begrüßt den Gast."),
        (first, 2, "Marta reicht Tee."),
        (second, 3, "Marta schließt die Schenke."),
    ):
        book.paragraphs.append(Paragraph(chapter=chapter, position=position, text=text))
    session.add(book)
    session.commit()
    return book


def _settings() -> Settings:
    return Settings(
        _env_file=None,
        extraction_max_paragraphs_per_block=2,
        extraction_max_block_characters=500,
        openai_timeout_seconds=1,
        openai_max_attempts=1,
    )


def _run(
    session: Session, job: Job, extractor: FakeExtractor, settings: Settings | None = None
) -> Job:
    return process_extraction_job(
        session,
        job.id,
        extractor=extractor,
        settings=settings or _settings(),
    )


def test_job_processes_chapters_and_blocks_in_order_with_prior_context(session: Session) -> None:
    book = _create_parsed_book(session)
    job = create_extraction_job(session, book.id)
    extractor = FakeExtractor()

    completed = _run(session, job, extractor)

    assert completed.status == "completed"
    assert completed.progress == 100
    assert completed.last_completed_chapter_index == 1
    assert completed.last_completed_block_index == 0
    assert completed.input_tokens == 30
    assert completed.output_tokens == 9
    assert book.status == "ready"
    assert [[paragraph.text for paragraph in call["paragraphs"]] for call in extractor.calls] == [
        ["Marta öffnet die Tür.", "Marta begrüßt den Gast."],
        ["Marta reicht Tee."],
        ["Marta schließt die Schenke."],
    ]
    assert extractor.calls[0]["known_entities"] == []
    assert extractor.calls[1]["known_entities"][0].aliases == ["die Wirtin"]
    assert extractor.calls[2]["known_entities"][0].canonical_name == "Marta"
    checkpoints = list(
        session.scalars(
            select(ExtractionCheckpoint)
            .where(ExtractionCheckpoint.job_id == job.id)
            .order_by(ExtractionCheckpoint.chapter_index, ExtractionCheckpoint.block_index)
        )
    )
    assert [(item.chapter_index, item.block_index) for item in checkpoints] == [
        (0, 0),
        (0, 1),
        (1, 0),
    ]
    assert [(item.first_paragraph_position, item.paragraph_count) for item in checkpoints] == [
        (0, 2),
        (2, 1),
        (3, 1),
    ]


def test_failed_job_resumes_after_last_atomic_checkpoint_without_duplication(
    session: Session,
) -> None:
    book = _create_parsed_book(session)
    job = create_extraction_job(session, book.id)
    first_worker = FakeExtractor(fail_on_call=2)

    with pytest.raises(RuntimeError, match="private source"):
        _run(session, job, first_worker)

    session.refresh(job)
    assert job.status == "error"
    assert job.progress == 33
    assert job.error_code == "RuntimeError"
    assert "private source text" not in job.error
    assert book.status == "error"
    assert session.scalar(
        select(ExtractionCheckpoint.id).where(ExtractionCheckpoint.job_id == job.id)
    )

    resume_worker = FakeExtractor()
    completed = _run(session, job, resume_worker)

    assert completed.status == "completed"
    assert completed.progress == 100
    assert completed.input_tokens == 30
    assert completed.output_tokens == 9
    assert len(resume_worker.calls) == 2
    assert resume_worker.calls[0]["known_entities"][0].canonical_name == "Marta"
    assert (
        len(
            list(
                session.scalars(
                    select(ExtractionCheckpoint).where(ExtractionCheckpoint.job_id == job.id)
                )
            )
        )
        == 3
    )


def test_only_one_active_extraction_job_is_allowed_per_book(session: Session) -> None:
    book = _create_parsed_book(session)
    create_extraction_job(session, book.id)

    with pytest.raises(ExtractionJobAlreadyActiveError):
        create_extraction_job(session, book.id)


def test_running_job_with_live_lease_is_not_started_twice(session: Session) -> None:
    book = _create_parsed_book(session)
    job = Job(
        book_id=book.id,
        type="extraction",
        status="running",
        lease_expires_at=datetime.now(UTC) + timedelta(minutes=5),
    )
    session.add(job)
    session.commit()

    with pytest.raises(ExtractionJobBusyError):
        _run(session, job, FakeExtractor())


def test_long_chapter_is_split_into_bounded_contiguous_text_blocks(session: Session) -> None:
    book = _create_parsed_book(session)
    paragraphs = list(
        session.scalars(
            select(Paragraph).where(Paragraph.book_id == book.id).order_by(Paragraph.position)
        )
    )
    paragraphs[0].text = "a" * 300
    paragraphs[1].text = "b" * 300
    session.commit()
    job = create_extraction_job(session, book.id)
    extractor = FakeExtractor()

    completed = _run(session, job, extractor)

    assert completed.status == "completed"
    first_chapter_calls = [call for call in extractor.calls if call["chapter_title"] == "Erstes"]
    assert [
        [len(paragraph.text) for paragraph in call["paragraphs"]] for call in first_chapter_calls
    ] == [
        [300],
        [300, len("Marta reicht Tee.")],
    ]


def test_paragraph_larger_than_block_limit_fails_the_job(session: Session) -> None:
    book = _create_parsed_book(session)
    paragraph = session.scalar(select(Paragraph).where(Paragraph.book_id == book.id))
    paragraph.text = "x" * 501
    session.commit()
    job = create_extraction_job(session, book.id)

    with pytest.raises(ValueError, match="maximale Textgröße"):
        _run(session, job, FakeExtractor())

    session.refresh(job)
    assert job.status == "error"
    assert job.error_code == "ExtractionBookNotReadyError"
    assert "501" not in job.error
