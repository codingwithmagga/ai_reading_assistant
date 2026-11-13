import re

from fastapi import APIRouter, Depends, File, HTTPException, Response, UploadFile
from pydantic import ValidationError
from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.backup_schemas import (
    BackupBook,
    BackupChapter,
    BackupEntity,
    BackupFact,
    BackupJob,
    BackupRelationship,
    LibraryBackup,
    RestoreResponse,
)
from app.config import get_settings
from app.database import get_session
from app.extraction_jobs import ExtractionBookNotReadyError, _make_blocks
from app.extraction_schemas import ChapterExtraction, ChapterParagraph, validate_chapter_references
from app.models import (
    Book,
    Chapter,
    Entity,
    EntityAlias,
    ExtractionCheckpoint,
    Fact,
    Job,
    Paragraph,
    Relationship,
)

router = APIRouter(prefix="/backup", tags=["backup"])

# Leave room under the proxy's request-body limit for multipart framing.
MULTIPART_RESERVE_BYTES = 64 * 1024


def _backup_size_limit() -> int:
    return get_settings().epub_max_upload_bytes - MULTIPART_RESERVE_BYTES


def _error(status: int, code: str, message: str) -> HTTPException:
    return HTTPException(status_code=status, detail={"code": code, "message": message})


def _lock_library(session: Session) -> None:
    # SQLite's write reservation makes the snapshot and replacement indivisible
    # with respect to other processes and extraction job creation.
    if session.get_bind().dialect.name != "sqlite":
        raise _error(503, "backup_unsupported_database", "Backup requires SQLite.")
    session.connection().exec_driver_sql("BEGIN IMMEDIATE")


def _check_quiescent(session: Session) -> None:
    active = session.scalar(
        select(Job.id).where(Job.status.in_(("pending", "running"))).limit(1)
    )
    unstable = session.scalar(
        select(Book.id).where(Book.status.in_(("uploaded", "parsing", "extracting"))).limit(1)
    )
    if active is not None or unstable is not None:
        raise _error(409, "backup_jobs_active", "Wait for active jobs before using backup.")


def _chapters(session: Session, book: Book) -> list[BackupChapter]:
    chapters = session.scalars(
        select(Chapter).where(Chapter.book_id == book.id).order_by(Chapter.index)
    )
    return [
        BackupChapter(
            index=chapter.index,
            start_position=chapter.start_position,
            end_position=chapter.end_position,
            positions=list(
                session.scalars(
                    select(Paragraph.position)
                    .where(Paragraph.book_id == book.id, Paragraph.chapter_id == chapter.id)
                    .order_by(Paragraph.position)
                )
            ),
        )
        for chapter in chapters
    ]


def _export_book(session: Session, book: Book) -> BackupBook:
    entities = list(session.scalars(select(Entity).where(Entity.book_id == book.id)))
    facts = list(session.scalars(select(Fact).where(Fact.book_id == book.id)))
    relations = list(session.scalars(select(Relationship).where(Relationship.book_id == book.id)))
    jobs = list(session.scalars(select(Job).where(Job.book_id == book.id)))
    return BackupBook(
        source_hash=book.source_hash,
        title=book.title,
        author=book.author,
        language=book.language,
        created_at=book.created_at,
        status=book.status,
        current_position=book.current_position,
        chapters=_chapters(session, book),
        entities=[BackupEntity.model_validate(entity) for entity in entities],
        facts=[
            BackupFact(
                entity_id=fact.entity_id,
                chapter_index=fact.chapter.index,
                text=fact.text,
                position=fact.position,
                source_excerpt=fact.source_excerpt,
                kind=fact.kind,
            )
            for fact in facts
        ],
        relationships=[BackupRelationship.model_validate(relation) for relation in relations],
        jobs=[BackupJob.model_validate(job) for job in jobs],
    )


def _is_empty_parsing_failure(session: Session, data: BackupBook, book: Book) -> bool:
    return (
        data.status == "error"
        and not data.chapters
        and data.current_position is None
        and not data.entities
        and not data.facts
        and not data.relationships
        and bool(data.jobs)
        and all(
            job.type == "parsing"
            and job.status == "error"
            and not job.extraction_checkpoints
            and job.last_completed_chapter_index is None
            and job.last_completed_block_index is None
            and job.input_tokens == 0
            and job.output_tokens == 0
            for job in data.jobs
        )
        and session.scalar(
            select(Paragraph.id).where(Paragraph.book_id == book.id).limit(1)
        ) is None
    )


@router.get("", response_model=LibraryBackup)
def export_backup(session: Session = Depends(get_session)) -> Response:
    _lock_library(session)
    _check_quiescent(session)
    try:
        books = []
        for book in session.scalars(select(Book).order_by(Book.id)):
            data = _export_book(session, book)
            if _is_empty_parsing_failure(session, data, book):
                continue
            _validate_book(session, data, book)
            books.append(data)
        backup = LibraryBackup(version=1, books=books)
    except ValueError as error:
        raise _error(
            409, "backup_inconsistent_data", "Stored library data cannot be restored safely."
        ) from error
    content = backup.model_dump_json()
    if len(content.encode("utf-8")) > _backup_size_limit():
        raise _error(413, "backup_too_large", "Backup exceeds the configured size limit.")
    return Response(
        content=content,
        media_type="application/json",
        headers={
            "Content-Disposition": 'attachment; filename="reading-assistant-backup.json"',
            "Cache-Control": "no-store",
        },
    )


def _validate_book(session: Session, data: BackupBook, book: Book) -> None:
    if not data.chapters or any(not chapter.positions for chapter in data.chapters):
        raise _error(
            409,
            "backup_unrestorable_book",
            "A book has no parsed content and cannot be restored from an uploaded EPUB.",
        )
    if data.chapters != _chapters(session, book):
        raise _error(409, "backup_layout_mismatch", "The EPUB chapter layout does not match.")
    paragraphs = {
        paragraph.position: paragraph
        for paragraph in session.scalars(select(Paragraph).where(Paragraph.book_id == book.id))
    }
    chapters = {
        chapter.index: chapter
        for chapter in session.scalars(select(Chapter).where(Chapter.book_id == book.id))
    }
    entities = {entity.id: entity for entity in data.entities}
    if len(entities) != len(data.entities):
        raise ValueError("Duplicate entity ID")
    if data.current_position is not None and data.current_position not in paragraphs:
        raise ValueError("Invalid progress")
    for entity in data.entities:
        if entity.first_position not in paragraphs:
            raise ValueError("Invalid entity position")
        for alias in entity.aliases:
            if (
                alias.first_position not in paragraphs
                or alias.first_position < entity.first_position
            ):
                raise ValueError("Invalid alias position")
    for fact in data.facts:
        entity = entities.get(fact.entity_id)
        paragraph = paragraphs.get(fact.position)
        chapter = chapters.get(fact.chapter_index)
        if (
            entity is None
            or paragraph is None
            or chapter is None
            or paragraph.chapter_id != chapter.id
            or fact.position < entity.first_position
            or _normalize(fact.source_excerpt) not in _normalize(paragraph.text)
        ):
            raise ValueError("Invalid fact")
    for relation in data.relationships:
        first = entities.get(relation.entity_a_id)
        second = entities.get(relation.entity_b_id)
        if (
            first is None
            or second is None
            or relation.position not in paragraphs
            or relation.position < max(first.first_position, second.first_position)
        ):
            raise ValueError("Invalid relationship")
    for job in data.jobs:
        _validate_job(job, chapters, paragraphs)
        if data.status == "error" and job.type == "extraction" and job.status == "error":
            _validate_resume_settings(job, chapters, paragraphs)


def _validate_resume_settings(
    job: BackupJob, chapters: dict[int, Chapter], paragraphs: dict[int, Paragraph]
) -> None:
    expected = {}
    try:
        for index, chapter in chapters.items():
            chapter_paragraphs = sorted(
                (
                    paragraph
                    for paragraph in paragraphs.values()
                    if paragraph.chapter_id == chapter.id
                ),
                key=lambda paragraph: paragraph.position,
            )
            for block_index, block in enumerate(_make_blocks(chapter_paragraphs, get_settings())):
                expected[index, block_index] = (block[0].position, len(block))
    except ExtractionBookNotReadyError as error:
        raise _error(
            409, "backup_checkpoint_incompatible", "Extraction settings do not match checkpoints."
        ) from error
    for checkpoint in job.extraction_checkpoints:
        key = (checkpoint.chapter_index, checkpoint.block_index)
        if expected.get(key) != (checkpoint.first_paragraph_position, checkpoint.paragraph_count):
            raise _error(
                409, "backup_checkpoint_incompatible",
                "Extraction settings do not match checkpoints.",
            )


def _normalize(value: str) -> str:
    return re.sub(r"\s+", " ", value).strip().casefold()


def _validate_job(
    job: BackupJob, chapters: dict[int, Chapter], paragraphs: dict[int, Paragraph]
) -> None:
    checkpoints = job.extraction_checkpoints
    if job.type != "extraction" and checkpoints:
        raise ValueError("Unexpected checkpoints")
    ordered_chapters = sorted(chapters)
    chapter_offset = 0
    next_position = chapters[ordered_chapters[0]].start_position if ordered_chapters else 0
    next_block = 0
    for checkpoint in checkpoints:
        while chapter_offset < len(ordered_chapters):
            chapter = chapters[ordered_chapters[chapter_offset]]
            if next_position <= chapter.end_position:
                break
            chapter_offset += 1
            next_block = 0
            if chapter_offset < len(ordered_chapters):
                next_position = chapters[ordered_chapters[chapter_offset]].start_position
        if chapter_offset == len(ordered_chapters):
            raise ValueError("Extra checkpoint")
        chapter = chapters[ordered_chapters[chapter_offset]]
        end = next_position + checkpoint.paragraph_count
        if (
            checkpoint.chapter_index != chapter.index
            or checkpoint.block_index != next_block
            or checkpoint.first_paragraph_position != next_position
            or end - 1 > chapter.end_position
        ):
            raise ValueError("Invalid checkpoint range")
        block = [paragraphs.get(position) for position in range(next_position, end)]
        if any(paragraph is None or paragraph.chapter_id != chapter.id for paragraph in block):
            raise ValueError("Invalid checkpoint paragraphs")
        extraction = ChapterExtraction.model_validate_json(checkpoint.result_json)
        validate_chapter_references(
            extraction,
            [ChapterParagraph(reference=f"p{i}", text=p.text) for i, p in enumerate(block)],
        )
        next_position = end
        next_block += 1
    last = checkpoints[-1] if checkpoints else None
    if (
        job.last_completed_chapter_index != (last.chapter_index if last else None)
        or job.last_completed_block_index != (last.block_index if last else None)
        or job.input_tokens < sum(item.input_tokens for item in checkpoints)
        or job.output_tokens < sum(item.output_tokens for item in checkpoints)
    ):
        raise ValueError("Invalid checkpoint progress")
    if job.type == "extraction" and job.status == "completed":
        if not ordered_chapters or next_position <= chapters[ordered_chapters[-1]].end_position:
            raise ValueError("Completed extraction has missing checkpoints")


def _replace_book(session: Session, data: BackupBook, book: Book) -> None:
    chapter_ids = {
        chapter.index: chapter.id
        for chapter in session.scalars(select(Chapter).where(Chapter.book_id == book.id))
    }
    session.execute(delete(Entity).where(Entity.book_id == book.id))
    session.execute(delete(Job).where(Job.book_id == book.id))
    session.flush()
    book.title = data.title
    book.author = data.author
    book.language = data.language
    book.created_at = data.created_at
    book.status = data.status
    book.current_position = data.current_position
    entity_map = {}
    for item in data.entities:
        entity = Entity(
            book_id=book.id,
            type=item.type.value,
            canonical_name=item.canonical_name,
            first_position=item.first_position,
            aliases=[EntityAlias(**alias.model_dump()) for alias in item.aliases],
        )
        session.add(entity)
        entity_map[item.id] = entity
    session.flush()
    for item in data.facts:
        values = item.model_dump(exclude={"entity_id", "chapter_index"})
        session.add(
            Fact(book_id=book.id, entity_id=entity_map[item.entity_id].id,
                 chapter_id=chapter_ids[item.chapter_index], **values)
        )
    for item in data.relationships:
        session.add(
            Relationship(book_id=book.id, entity_a_id=entity_map[item.entity_a_id].id,
                         entity_b_id=entity_map[item.entity_b_id].id,
                         label=item.label, position=item.position)
        )
    for item in data.jobs:
        values = item.model_dump(exclude={"extraction_checkpoints"})
        job = Job(book_id=book.id, **values)
        job.extraction_checkpoints = [
            ExtractionCheckpoint(**checkpoint.model_dump())
            for checkpoint in item.extraction_checkpoints
        ]
        session.add(job)


@router.post("", response_model=RestoreResponse)
def import_backup(
    file: UploadFile = File(...), session: Session = Depends(get_session)
) -> RestoreResponse:
    content = file.file.read(_backup_size_limit() + 1)
    if len(content) > _backup_size_limit():
        raise _error(413, "backup_too_large", "Backup exceeds the upload limit.")
    try:
        backup = LibraryBackup.model_validate_json(content)
    except ValidationError as error:
        raise _error(422, "invalid_backup", "Invalid or unsupported backup.") from error
    _lock_library(session)
    _check_quiescent(session)
    try:
        hashes = [item.source_hash for item in backup.books]
        if len(set(hashes)) != len(hashes):
            raise ValueError("Duplicate book")
        targets = {book.source_hash: book for book in session.scalars(select(Book))}
        for item in backup.books:
            book = targets.get(item.source_hash)
            if book is None:
                raise _error(409, "backup_book_missing", "A matching EPUB must be uploaded first.")
            _validate_book(session, item, book)
        for item in backup.books:
            _replace_book(session, item, targets[item.source_hash])
        session.commit()
    except (ValueError, IntegrityError) as error:
        session.rollback()
        raise _error(
            422, "invalid_backup", "Backup contains invalid data or references."
        ) from error
    return RestoreResponse(restored=len(backup.books))
