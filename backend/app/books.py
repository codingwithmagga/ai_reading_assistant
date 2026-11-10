import logging
from hashlib import sha256
from pathlib import PurePath

from fastapi import (
    APIRouter,
    BackgroundTasks,
    Depends,
    File,
    HTTPException,
    Query,
    Response,
    UploadFile,
)
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.config import get_settings
from app.database import SessionLocal, get_session
from app.entity_resolution import normalize_entity_name
from app.epub_parser import EpubParsingError, parse_epub
from app.extraction_jobs import (
    ExtractionJobAlreadyActiveError,
    create_extraction_job,
    process_extraction_job,
)
from app.extraction_schemas import EntityType
from app.lookup import (
    LookupPositionError,
    find_entities_by_name,
    get_entity_aliases,
    get_entity_facts,
    get_entity_relationships,
    list_entities_at_position,
    validate_reading_position,
)
from app.models import Book, Chapter, Entity, Job, Paragraph
from app.schemas import (
    BookResponse,
    ChapterContentResponse,
    ChapterResponse,
    EntityAliasResponse,
    EntityListItemResponse,
    EntityLookupMatchResponse,
    EntityLookupResponse,
    JobResponse,
    LookupEntitySummaryResponse,
    LookupFactResponse,
    LookupRelationshipResponse,
    UploadResponse,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/books", tags=["books"])


@router.get("", response_model=list[BookResponse])
def list_books(session: Session = Depends(get_session)) -> list[Book]:
    return list(session.scalars(select(Book).order_by(Book.created_at.desc(), Book.id)))


@router.post("", response_model=UploadResponse, status_code=201)
def upload_book(
    response: Response,
    file: UploadFile = File(...),
    session: Session = Depends(get_session),
) -> UploadResponse:
    settings = get_settings()
    max_upload_bytes = settings.epub_max_upload_bytes
    content = file.file.read(max_upload_bytes + 1)
    if len(content) > max_upload_bytes:
        raise HTTPException(
            status_code=413,
            detail={
                "code": "upload_too_large",
                "message": (
                    "Die EPUB-Datei überschreitet die erlaubte Upload-Größe von "
                    f"{settings.epub_max_upload_mb} MB."
                ),
            },
        )

    source_hash = sha256(content).hexdigest()
    existing_book = session.scalar(select(Book).where(Book.source_hash == source_hash))
    if existing_book is not None:
        response.status_code = 200
        return _upload_response(existing_book, session, reused=True)

    filename = PurePath((file.filename or "").replace("\\", "/")).name
    fallback_title = PurePath(filename).stem[:500] or "Unbekannter Titel"
    try:
        parsed = parse_epub(
            content,
            max_upload_bytes=max_upload_bytes,
            max_uncompressed_bytes=settings.epub_max_uncompressed_bytes,
            max_archive_entries=settings.epub_max_archive_entries,
        )
    except EpubParsingError as error:
        failed_book = Book(
            title=fallback_title,
            source_hash=source_hash,
            status="error",
        )
        session.add(failed_book)
        session.add(
            Job(
                book=failed_book,
                type="parsing",
                status="error",
                error=str(error),
            )
        )
        try:
            session.commit()
        except IntegrityError:
            session.rollback()
            existing_book = session.scalar(select(Book).where(Book.source_hash == source_hash))
            if existing_book is None:
                raise
            response.status_code = 200
            return _upload_response(existing_book, session, reused=True)
        raise HTTPException(
            status_code=422,
            detail={
                "code": "invalid_epub",
                "message": str(error),
                "book_id": failed_book.id,
            },
        ) from error

    book = Book(
        title=parsed.title or fallback_title,
        author=parsed.author,
        language=parsed.language,
        source_hash=source_hash,
        status="parsing",
    )
    for parsed_chapter in parsed.chapters:
        chapter = Chapter(
            book=book,
            index=parsed_chapter.index,
            title=parsed_chapter.title,
            start_position=parsed_chapter.start_position,
            end_position=parsed_chapter.end_position,
        )
        for offset, text in enumerate(parsed_chapter.paragraphs):
            book.paragraphs.append(
                Paragraph(
                    chapter=chapter,
                    position=parsed_chapter.start_position + offset,
                    text=text,
                )
            )

    book.status = "parsed"
    session.add(
        Job(
            book=book,
            type="parsing",
            status="completed",
            progress=100,
        )
    )
    session.add(book)
    try:
        session.commit()
    except IntegrityError:
        session.rollback()
        existing_book = session.scalar(select(Book).where(Book.source_hash == source_hash))
        if existing_book is None:
            raise
        response.status_code = 200
        return _upload_response(existing_book, session, reused=True)

    return _upload_response(book, session, reused=False)


@router.get("/{book_id}", response_model=BookResponse)
def get_book(book_id: str, session: Session = Depends(get_session)) -> Book:
    book = session.get(Book, book_id)
    if book is None:
        raise HTTPException(
            status_code=404,
            detail={"code": "book_not_found", "message": "Buch nicht gefunden."},
        )
    return book


@router.get(
    "/{book_id}/entities",
    response_model=list[EntityListItemResponse],
)
def list_book_entities(
    book_id: str,
    position: int = Query(),
    entity_type: EntityType | None = Query(default=None, alias="type"),
    session: Session = Depends(get_session),
) -> list[EntityListItemResponse]:
    _require_book(session, book_id)
    try:
        validate_reading_position(session, book_id, position)
    except LookupPositionError as error:
        raise HTTPException(
            status_code=422,
            detail={
                "code": "invalid_reading_position",
                "message": str(error),
            },
        ) from error

    entities = list_entities_at_position(
        session,
        book_id=book_id,
        position=position,
        entity_type=entity_type.value if entity_type is not None else None,
    )
    return [
        EntityListItemResponse(
            id=entity.id,
            type=EntityType(entity.type),
            canonical_name=entity.canonical_name,
            first_position=entity.first_position,
            aliases=[
                EntityAliasResponse(
                    alias=alias.alias,
                    first_position=alias.first_position,
                )
                for alias in aliases
            ],
        )
        for entity, aliases in entities
    ]


@router.get(
    "/{book_id}/lookup",
    response_model=EntityLookupResponse,
)
def lookup_book_entity(
    book_id: str,
    q: str = Query(min_length=1, max_length=500),
    position: int = Query(),
    session: Session = Depends(get_session),
) -> EntityLookupResponse:
    _require_book(session, book_id)
    if not normalize_entity_name(q):
        raise HTTPException(
            status_code=422,
            detail={
                "code": "empty_lookup_query",
                "message": "Der Suchbegriff darf nicht leer sein.",
            },
        )
    try:
        validate_reading_position(session, book_id, position)
    except LookupPositionError as error:
        raise HTTPException(
            status_code=422,
            detail={
                "code": "invalid_reading_position",
                "message": str(error),
            },
        ) from error

    entities = find_entities_by_name(
        session,
        book_id=book_id,
        query=q,
        position=position,
    )
    matches = []
    for entity in entities:
        facts = get_entity_facts(
            session,
            book_id=book_id,
            entity_id=entity.id,
            position=position,
        )
        relationships = get_entity_relationships(
            session,
            book_id=book_id,
            entity_id=entity.id,
            position=position,
        )
        matches.append(
            EntityLookupMatchResponse(
                entity=_lookup_entity_summary(entity),
                aliases=[
                    EntityAliasResponse(
                        alias=alias.alias,
                        first_position=alias.first_position,
                    )
                    for alias in get_entity_aliases(
                        session,
                        entity_id=entity.id,
                        position=position,
                    )
                ],
                facts=[
                    LookupFactResponse(
                        id=fact.id,
                        text=fact.text,
                        kind=fact.kind,
                        position=fact.position,
                        chapter_id=chapter.id,
                        chapter_index=chapter.index,
                        chapter_title=chapter.title,
                        source_excerpt=fact.source_excerpt,
                    )
                    for fact, chapter in facts
                ],
                relationships=[
                    LookupRelationshipResponse(
                        id=relationship.id,
                        entity_a=_lookup_entity_summary(entity_a),
                        entity_b=_lookup_entity_summary(entity_b),
                        label=relationship.label,
                        position=relationship.position,
                    )
                    for relationship, entity_a, entity_b in relationships
                ],
            )
        )
    return EntityLookupResponse(query=q, position=position, matches=matches)


@router.get("/{book_id}/chapters", response_model=list[ChapterResponse])
def list_chapters(book_id: str, session: Session = Depends(get_session)) -> list[Chapter]:
    _require_book(session, book_id)
    statement = (
        select(Chapter).where(Chapter.book_id == book_id).order_by(Chapter.index, Chapter.id)
    )
    return list(session.scalars(statement))


@router.get(
    "/{book_id}/content/{chapter_id}",
    response_model=ChapterContentResponse,
)
def get_chapter_content(
    book_id: str,
    chapter_id: str,
    session: Session = Depends(get_session),
) -> ChapterContentResponse:
    _require_book(session, book_id)
    chapter = session.scalar(
        select(Chapter).where(Chapter.id == chapter_id, Chapter.book_id == book_id)
    )
    if chapter is None:
        raise HTTPException(
            status_code=404,
            detail={"code": "chapter_not_found", "message": "Kapitel nicht gefunden."},
        )

    paragraphs = session.scalars(
        select(Paragraph)
        .where(Paragraph.book_id == book_id, Paragraph.chapter_id == chapter_id)
        .order_by(Paragraph.position, Paragraph.id)
    )
    return ChapterContentResponse(
        id=chapter.id,
        book_id=chapter.book_id,
        index=chapter.index,
        title=chapter.title,
        start_position=chapter.start_position,
        end_position=chapter.end_position,
        paragraphs=list(paragraphs),
    )


@router.post(
    "/{book_id}/extraction-jobs",
    response_model=JobResponse,
    status_code=202,
)
def start_extraction_job(
    book_id: str,
    background_tasks: BackgroundTasks,
    session: Session = Depends(get_session),
) -> Job:
    _require_book(session, book_id)
    try:
        job = create_extraction_job(session, book_id)
    except ExtractionJobAlreadyActiveError as error:
        raise HTTPException(
            status_code=409,
            detail={
                "code": "extraction_job_active",
                "message": str(error),
            },
        ) from error
    except ValueError as error:
        raise HTTPException(
            status_code=409,
            detail={
                "code": "book_not_ready_for_extraction",
                "message": str(error),
            },
        ) from error

    background_tasks.add_task(run_extraction_job_background, job.id)
    return job


@router.get("/{book_id}/jobs", response_model=list[JobResponse])
def list_book_jobs(book_id: str, session: Session = Depends(get_session)) -> list[Job]:
    _require_book(session, book_id)
    return list(
        session.scalars(
            select(Job).where(Job.book_id == book_id).order_by(Job.created_at.desc(), Job.id.desc())
        )
    )


def run_extraction_job_background(job_id: str) -> None:
    try:
        with SessionLocal() as session:
            process_extraction_job(session, job_id)
    except Exception as error:
        logger.error(
            "Extraction background job failed",
            extra={"job_id": job_id, "error_code": type(error).__name__},
        )


def _require_book(session: Session, book_id: str) -> Book:
    book = session.get(Book, book_id)
    if book is None:
        raise HTTPException(
            status_code=404,
            detail={"code": "book_not_found", "message": "Buch nicht gefunden."},
        )
    return book


def _lookup_entity_summary(entity: Entity) -> LookupEntitySummaryResponse:
    return LookupEntitySummaryResponse(
        id=entity.id,
        type=EntityType(entity.type),
        canonical_name=entity.canonical_name,
        first_position=entity.first_position,
    )


def _upload_response(book: Book, session: Session, *, reused: bool) -> UploadResponse:
    parsing_job = session.scalar(
        select(Job)
        .where(Job.book_id == book.id, Job.type == "parsing")
        .order_by(Job.created_at.desc())
    )
    return UploadResponse(
        id=book.id,
        title=book.title,
        author=book.author,
        language=book.language,
        created_at=book.created_at,
        status=book.status,
        source_hash=book.source_hash,
        reused=reused,
        error=parsing_job.error if parsing_job is not None else None,
    )
