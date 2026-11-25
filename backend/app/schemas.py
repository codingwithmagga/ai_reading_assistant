from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

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


class RichTextSegment(BaseModel):
    text: str
    bold: bool = False
    italic: bool = False
    underline: bool = False
    strike: bool = False
    code: bool = False
    sub: bool = False
    sup: bool = False


class ParagraphResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    chapter_id: str
    position: int
    text: str
    rich_text: list[RichTextSegment] | None = None


class ChapterContentResponse(ChapterResponse):
    paragraphs: list[ParagraphResponse]


class ReadingProgressResponse(BaseModel):
    book_id: str
    current_position: int | None


class ReadingProgressUpdate(BaseModel):
    position: int = Field(strict=True)


class ExtractionJobStartRequest(BaseModel):
    min_chapter_index: int = Field(default=0, strict=True, ge=0)
    max_chapter_index: int | None = Field(default=None, strict=True, ge=0)


class JobResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    book_id: str
    type: str
    status: str
    progress: int
    min_chapter_index: int
    max_chapter_index: int | None
    last_completed_chapter_index: int | None
    last_completed_block_index: int | None
    error_code: str | None
    error: str | None
    input_tokens: int
    output_tokens: int
    lease_expires_at: datetime | None
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


class RecapEventResponse(BaseModel):
    id: str
    text: str
    position: int
    chapter_id: str
    chapter_index: int
    chapter_title: str | None
    source_excerpt: str
    entity: LookupEntitySummaryResponse


class RecapResponse(BaseModel):
    position: int
    events: list[RecapEventResponse]
    characters: list[EntityListItemResponse]


class ChapterOverviewFactResponse(BaseModel):
    id: str
    text: str
    kind: FactKind
    position: int
    source_excerpt: str
    entity: LookupEntitySummaryResponse


class ChapterOverviewChapterResponse(BaseModel):
    id: str
    index: int
    title: str | None
    start_position: int
    end_position: int
    facts: list[ChapterOverviewFactResponse]
    relationships: list[LookupRelationshipResponse]


class ChapterOverviewResponse(BaseModel):
    position: int
    chapters: list[ChapterOverviewChapterResponse]


class NotesExportEntityResponse(LookupEntitySummaryResponse):
    aliases: list[EntityAliasResponse]
    facts: list[LookupFactResponse]


class NotesExportResponse(BaseModel):
    book_id: str
    title: str
    author: str | None
    language: str | None
    position: int
    entities: list[NotesExportEntityResponse]
    relationships: list[LookupRelationshipResponse]
    events: list[RecapEventResponse]
