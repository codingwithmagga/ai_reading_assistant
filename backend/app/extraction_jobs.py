from collections.abc import Sequence
from datetime import UTC, datetime, timedelta
from math import floor
from typing import Protocol

from sqlalchemy import or_, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.config import Settings, get_settings
from app.entity_resolution import known_entities_at_position, persist_block_extraction
from app.extraction_schemas import (
    ChapterExtraction,
    ChapterParagraph,
    KnownEntity,
)
from app.models import Book, Chapter, ExtractionCheckpoint, Job, Paragraph
from app.openai_extractor import (
    ExtractionConfigurationError,
    ExtractionResponse,
    InvalidExtractionOutputError,
    OpenAIChapterExtractor,
)


class ExtractionJobAlreadyActiveError(RuntimeError):
    pass


class ExtractionJobBusyError(RuntimeError):
    pass


class ExtractionJobNotFoundError(LookupError):
    pass


class ExtractionBookNotReadyError(ValueError):
    pass


class ChapterExtractor(Protocol):
    def extract_with_usage(
        self,
        *,
        chapter_title: str | None,
        paragraphs: list[ChapterParagraph],
        known_entities: list[KnownEntity],
    ) -> ExtractionResponse: ...


def create_extraction_job(session: Session, book_id: str) -> Job:
    book = session.get(Book, book_id)
    if book is None:
        raise ExtractionBookNotReadyError("Buch nicht gefunden.")
    if book.status not in {"parsed", "error"}:
        raise ExtractionBookNotReadyError("Das Buch ist nicht für eine Extraktion bereit.")
    if session.scalar(select(Chapter.id).where(Chapter.book_id == book_id).limit(1)) is None:
        raise ExtractionBookNotReadyError("Das Buch enthält keine verarbeiteten Kapitel.")

    active_job = session.scalar(
        select(Job).where(
            Job.book_id == book_id,
            Job.type == "extraction",
            Job.status.in_(("pending", "running")),
        )
    )
    if active_job is not None:
        if active_job.status == "pending":
            return active_job
        raise ExtractionJobAlreadyActiveError("Für dieses Buch läuft bereits ein Extraktionsjob.")

    if book.status == "error":
        failed_job = session.scalar(
            select(Job)
            .where(
                Job.book_id == book_id,
                Job.type == "extraction",
                Job.status == "error",
            )
            .order_by(Job.created_at.desc(), Job.id.desc())
        )
        if failed_job is None:
            raise ExtractionBookNotReadyError("Das Buch ist nicht für eine Extraktion bereit.")
        failed_job.status = "pending"
        failed_job.error = None
        failed_job.error_code = None
        book.status = "parsed"
        session.commit()
        session.refresh(failed_job)
        return failed_job

    job = Job(book_id=book_id, type="extraction", status="pending", progress=0)
    session.add(job)
    try:
        session.commit()
    except IntegrityError as error:
        session.rollback()
        active_job = session.scalar(
            select(Job.id).where(
                Job.book_id == book_id,
                Job.type == "extraction",
                Job.status.in_(("pending", "running")),
            )
        )
        if active_job is None:
            raise
        raise ExtractionJobAlreadyActiveError(
            "Für dieses Buch läuft bereits ein Extraktionsjob."
        ) from error
    session.refresh(job)
    return job


def process_extraction_job(
    session: Session,
    job_id: str,
    *,
    extractor: ChapterExtractor | None = None,
    settings: Settings | None = None,
) -> Job:
    job = session.get(Job, job_id)
    if job is None or job.type != "extraction":
        raise ExtractionJobNotFoundError("Extraktionsjob nicht gefunden.")
    if job.status == "completed":
        return job

    now = datetime.now(UTC)
    lease_expires_at = _as_utc(job.lease_expires_at)
    if job.status == "running" and lease_expires_at is not None and lease_expires_at > now:
        raise ExtractionJobBusyError("Der Extraktionsjob wird bereits verarbeitet.")
    if job.status not in {"pending", "error", "running"}:
        raise ValueError(f"Ungültiger Jobstatus für die Wiederaufnahme: {job.status}.")

    book = session.get(Book, job.book_id)
    if book is None:
        raise ExtractionBookNotReadyError("Das Buch dieses Jobs existiert nicht mehr.")

    effective_settings = settings or get_settings()
    worker = extractor or OpenAIChapterExtractor(effective_settings)
    chapters = list(
        session.scalars(
            select(Chapter).where(Chapter.book_id == book.id).order_by(Chapter.index, Chapter.id)
        )
    )
    if not chapters:
        raise ExtractionBookNotReadyError("Das Buch enthält keine verarbeiteten Kapitel.")

    lease_expires_at = now + timedelta(
        seconds=max(
            120,
            effective_settings.openai_timeout_seconds * effective_settings.openai_max_attempts + 60,
        )
    )
    claim = session.execute(
        update(Job)
        .where(
            Job.id == job.id,
            Job.status.in_(("pending", "error", "running")),
            or_(
                Job.status != "running",
                Job.lease_expires_at.is_(None),
                Job.lease_expires_at <= now,
            ),
        )
        .values(
            status="running",
            error=None,
            error_code=None,
            lease_expires_at=lease_expires_at,
        )
        .execution_options(synchronize_session=False)
    )
    if claim.rowcount != 1:
        session.rollback()
        raise ExtractionJobBusyError("Der Extraktionsjob wird bereits verarbeitet.")
    session.refresh(job)
    book.status = "extracting"
    session.commit()

    try:
        _process_chapters(
            session,
            job,
            book,
            chapters,
            worker,
            effective_settings,
        )
        job.status = "completed"
        job.progress = 100
        job.lease_expires_at = None
        book.status = "ready"
        session.commit()
    except Exception as error:
        session.rollback()
        job = session.get(Job, job_id)
        book = session.get(Book, job.book_id) if job is not None else None
        if job is not None:
            job.status = "error"
            job.error_code = type(error).__name__[:100]
            job.error = _safe_error_message(error)
            job.lease_expires_at = None
            if isinstance(error, InvalidExtractionOutputError):
                job.input_tokens += error.input_tokens
                job.output_tokens += error.output_tokens
        if book is not None:
            book.status = "error"
        session.commit()
        raise

    session.refresh(job)
    return job


def _process_chapters(
    session: Session,
    job: Job,
    book: Book,
    chapters: Sequence[Chapter],
    extractor: ChapterExtractor,
    settings: Settings,
) -> None:
    paragraph_map = {
        chapter.id: list(
            session.scalars(
                select(Paragraph)
                .where(Paragraph.book_id == book.id, Paragraph.chapter_id == chapter.id)
                .order_by(Paragraph.position, Paragraph.id)
            )
        )
        for chapter in chapters
    }
    if any(not paragraphs for paragraphs in paragraph_map.values()):
        raise ExtractionBookNotReadyError("Jedes Kapitel muss mindestens einen Absatz enthalten.")

    chapter_blocks = {
        chapter.id: _make_blocks(paragraph_map[chapter.id], settings) for chapter in chapters
    }
    total_blocks = sum(len(blocks) for blocks in chapter_blocks.values())
    existing_checkpoints = list(
        session.scalars(
            select(ExtractionCheckpoint)
            .where(ExtractionCheckpoint.job_id == job.id)
            .order_by(
                ExtractionCheckpoint.chapter_index,
                ExtractionCheckpoint.block_index,
            )
        )
    )
    checkpoint_map = {
        (checkpoint.chapter_index, checkpoint.block_index): checkpoint
        for checkpoint in existing_checkpoints
    }
    if len(checkpoint_map) != len(existing_checkpoints):
        raise ValueError("Der Job enthält doppelte Checkpoint-Referenzen.")
    expected_checkpoint_keys = {
        (chapter.index, block_index)
        for chapter in chapters
        for block_index in range(len(chapter_blocks[chapter.id]))
    }
    if not set(checkpoint_map) <= expected_checkpoint_keys:
        raise ValueError("Der Job enthält Checkpoints außerhalb der Kapitelblöcke.")

    completed_blocks = 0
    for chapter in chapters:
        for block_index, block in enumerate(chapter_blocks[chapter.id]):
            checkpoint_key = (chapter.index, block_index)
            checkpoint = checkpoint_map.get(checkpoint_key)

            if checkpoint is None:
                later_checkpoints = [
                    item for key, item in checkpoint_map.items() if key > checkpoint_key
                ]
                if later_checkpoints:
                    raise ValueError(
                        "Ein späterer Checkpoint liegt vor einem fehlenden Kapitelblock."
                    )

                request_paragraphs = [
                    ChapterParagraph(reference=f"p{index}", text=paragraph.text)
                    for index, paragraph in enumerate(block)
                ]
                response = extractor.extract_with_usage(
                    chapter_title=chapter.title,
                    paragraphs=request_paragraphs,
                    known_entities=known_entities_at_position(
                        session,
                        book.id,
                        block[0].position - 1,
                    ),
                )
                persist_block_extraction(
                    session,
                    book=book,
                    chapter=chapter,
                    paragraphs=block,
                    extraction=response.extraction,
                )
                checkpoint = ExtractionCheckpoint(
                    job_id=job.id,
                    chapter_index=chapter.index,
                    block_index=block_index,
                    first_paragraph_position=block[0].position,
                    paragraph_count=len(block),
                    result_json=response.extraction.model_dump_json(),
                    input_tokens=response.input_tokens,
                    output_tokens=response.output_tokens,
                )
                session.add(checkpoint)
                job.last_completed_chapter_index = chapter.index
                job.last_completed_block_index = block_index
                job.input_tokens += response.input_tokens
                job.output_tokens += response.output_tokens
                completed_blocks += 1
                job.progress = max(
                    job.progress,
                    floor(completed_blocks * 100 / total_blocks),
                )
                job.lease_expires_at = datetime.now(UTC) + timedelta(
                    seconds=max(
                        120,
                        settings.openai_timeout_seconds * settings.openai_max_attempts + 60,
                    )
                )
                session.commit()
            else:
                if checkpoint.first_paragraph_position != block[
                    0
                ].position or checkpoint.paragraph_count != len(block):
                    raise ValueError("Ein Checkpoint passt nicht mehr zu den Buchabsätzen.")
                completed_blocks += 1

            ChapterExtraction.model_validate_json(checkpoint.result_json)


def _make_blocks(paragraphs: Sequence[Paragraph], settings: Settings) -> list[list[Paragraph]]:
    blocks: list[list[Paragraph]] = []
    current: list[Paragraph] = []
    current_characters = 0
    for paragraph in paragraphs:
        paragraph_characters = len(paragraph.text)
        if paragraph_characters > settings.extraction_max_block_characters:
            raise ExtractionBookNotReadyError(
                "Ein Absatz überschreitet die maximale Textgröße eines Extraktionsblocks."
            )
        if current and (
            len(current) >= settings.extraction_max_paragraphs_per_block
            or current_characters + paragraph_characters > settings.extraction_max_block_characters
        ):
            blocks.append(current)
            current = []
            current_characters = 0
        current.append(paragraph)
        current_characters += paragraph_characters
    if current:
        blocks.append(current)
    return blocks


def _as_utc(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value.astimezone(UTC)


def _safe_error_message(error: Exception) -> str:
    if isinstance(error, ExtractionConfigurationError):
        return str(error)
    if isinstance(error, InvalidExtractionOutputError):
        return str(error)
    return f"Extraktionsjob fehlgeschlagen ({type(error).__name__})."
