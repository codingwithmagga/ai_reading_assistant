import logging
from hashlib import sha256
from pathlib import PurePath

from fastapi import (
    APIRouter,
    BackgroundTasks,
    Depends,
    File,
    HTTPException,
    Response,
    UploadFile,
)
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.config import get_settings
from app.database import SessionLocal, get_session
from app.epub_parser import EpubParsingError, parse_epub
from app.extraction_jobs import (
    ExtractionJobAlreadyActiveError,
    create_extraction_job,
    process_extraction_job,
)
from app.models import Book, Chapter, Job, Paragraph
from app.schemas import (
    BookResponse,
    ChapterContentResponse,
    ChapterResponse,
    JobResponse,
    ReadingProgressResponse,
    ReadingProgressUpdate,
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


@router.get("/{book_id}/progress", response_model=ReadingProgressResponse)
def get_reading_progress(
    book_id: str,
    session: Session = Depends(get_session),
) -> ReadingProgressResponse:
    book = _require_book(session, book_id)
    return ReadingProgressResponse(
        book_id=book.id,
        current_position=book.current_position,
    )


@router.put("/{book_id}/progress", response_model=ReadingProgressResponse)
def update_reading_progress(
    book_id: str,
    progress: ReadingProgressUpdate,
    session: Session = Depends(get_session),
) -> ReadingProgressResponse:
    book = _require_book(session, book_id)
    paragraph_exists = session.scalar(
        select(Paragraph.id).where(
            Paragraph.book_id == book_id,
            Paragraph.position == progress.position,
        )
    )
    if paragraph_exists is None:
        raise HTTPException(
            status_code=422,
            detail={
                "code": "invalid_reading_position",
                "message": "Die Leseposition liegt außerhalb des Buchinhalts.",
            },
        )

    book.current_position = progress.position
    session.commit()
    session.refresh(book)
    return ReadingProgressResponse(
        book_id=book.id,
        current_position=book.current_position,
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
