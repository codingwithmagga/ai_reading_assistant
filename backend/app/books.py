from hashlib import sha256
from pathlib import PurePath

from fastapi import APIRouter, Depends, File, HTTPException, Response, UploadFile
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.database import get_session
from app.epub_parser import MAX_UPLOAD_BYTES, EpubParsingError, parse_epub
from app.models import Book, Chapter, Job, Paragraph
from app.schemas import UploadResponse

router = APIRouter(prefix="/books", tags=["books"])


@router.post("", response_model=UploadResponse, status_code=201)
def upload_book(
    response: Response,
    file: UploadFile = File(...),
    session: Session = Depends(get_session),
) -> UploadResponse:
    content = file.file.read(MAX_UPLOAD_BYTES + 1)
    if len(content) > MAX_UPLOAD_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"Die EPUB-Datei überschreitet die erlaubte Upload-Größe von "
            f"{MAX_UPLOAD_BYTES // (1024 * 1024)} MB.",
        )

    source_hash = sha256(content).hexdigest()
    existing_book = session.scalar(select(Book).where(Book.source_hash == source_hash))
    if existing_book is not None:
        response.status_code = 200
        return _upload_response(existing_book, session, reused=True)

    filename = PurePath((file.filename or "").replace("\\", "/")).name
    fallback_title = PurePath(filename).stem[:500] or "Unbekannter Titel"
    try:
        parsed = parse_epub(content)
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
            detail={"message": str(error), "book_id": failed_book.id},
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
