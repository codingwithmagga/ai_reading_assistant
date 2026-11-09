from datetime import datetime

from pydantic import BaseModel, ConfigDict


class BookResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    title: str
    author: str | None
    language: str | None
    created_at: datetime
    status: str


class UploadResponse(BookResponse):
    source_hash: str
    reused: bool
    error: str | None = None


class ChapterResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    book_id: str
    index: int
    title: str | None
    start_position: int
    end_position: int


class ParagraphResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    chapter_id: str
    position: int
    text: str


class ChapterContentResponse(ChapterResponse):
    paragraphs: list[ParagraphResponse]
