from datetime import datetime

from pydantic import BaseModel, ConfigDict

from app.extraction_schemas import EntityType, FactKind


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


class JobResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    book_id: str
    type: str
    status: str
    progress: int
    last_completed_chapter_index: int | None
    last_completed_block_index: int | None
    error_code: str | None
    error: str | None
    input_tokens: int
    output_tokens: int
    created_at: datetime


class EntityAliasResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    alias: str
    first_position: int


class EntityListItemResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    type: EntityType
    canonical_name: str
    first_position: int
    aliases: list[EntityAliasResponse]


class LookupEntitySummaryResponse(BaseModel):
    id: str
    type: EntityType
    canonical_name: str
    first_position: int


class LookupFactResponse(BaseModel):
    id: str
    text: str
    kind: FactKind
    position: int
    chapter_id: str
    chapter_index: int
    chapter_title: str | None
    source_excerpt: str


class LookupRelationshipResponse(BaseModel):
    id: str
    entity_a: LookupEntitySummaryResponse
    entity_b: LookupEntitySummaryResponse
    label: str
    position: int


class EntityLookupMatchResponse(BaseModel):
    entity: LookupEntitySummaryResponse
    aliases: list[EntityAliasResponse]
    facts: list[LookupFactResponse]
    relationships: list[LookupRelationshipResponse]


class EntityLookupResponse(BaseModel):
    query: str
    position: int
    matches: list[EntityLookupMatchResponse]
