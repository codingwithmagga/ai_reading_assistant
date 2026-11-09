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
    source_hash: str


class UploadResponse(BookResponse):
    reused: bool
    error: str | None = None
