from datetime import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, field_validator

from app.extraction_schemas import EntityType, FactKind

Position = Annotated[int, Field(strict=True, ge=0, le=2**63 - 1)]
Name = Annotated[str, StringConstraints(min_length=1, max_length=500, pattern=r"\S")]
Identifier = Annotated[str, StringConstraints(min_length=1, max_length=36)]


class BackupModel(BaseModel):
    model_config = ConfigDict(extra="forbid", from_attributes=True)


class BackupChapter(BackupModel):
    index: Position
    start_position: Position
    end_position: Position
    positions: list[Position]


class BackupAlias(BackupModel):
    alias: Name
    first_position: Position


class BackupEntity(BackupModel):
    id: Identifier
    type: EntityType
    canonical_name: Name
    first_position: Position
    aliases: list[BackupAlias]


class BackupFact(BackupModel):
    entity_id: Identifier
    chapter_index: Position
    text: Annotated[str, StringConstraints(min_length=1, max_length=2000, pattern=r"\S")]
    position: Position
    source_excerpt: Annotated[str, StringConstraints(min_length=1, max_length=200, pattern=r"\S")]
    kind: FactKind


class BackupRelationship(BackupModel):
    entity_a_id: Identifier
    entity_b_id: Identifier
    label: Name
    position: Position


class BackupCheckpoint(BackupModel):
    chapter_index: Position
    block_index: Position
    first_paragraph_position: Position
    paragraph_count: Annotated[int, Field(strict=True, gt=0, le=2**63 - 1)]
    result_json: str
    input_tokens: Position
    output_tokens: Position
    created_at: datetime


class BackupJob(BackupModel):
    type: Literal["parsing", "extraction"]
    status: Literal["completed", "error"]
    progress: Annotated[int, Field(strict=True, ge=0, le=100)]
    error: str | None
    error_code: Annotated[str, StringConstraints(max_length=100)] | None
    last_completed_chapter_index: Position | None
    last_completed_block_index: Position | None
    input_tokens: Position
    output_tokens: Position
    created_at: datetime
    extraction_checkpoints: list[BackupCheckpoint]


class BackupBook(BackupModel):
    source_hash: Annotated[
        str, StringConstraints(min_length=64, max_length=64, pattern=r"^[0-9a-f]{64}$")
    ]
    title: Name
    author: Annotated[str, StringConstraints(max_length=500)] | None
    language: Annotated[str, StringConstraints(max_length=32)] | None
    created_at: datetime
    status: Literal["parsed", "ready", "error"]
    current_position: Position | None
    chapters: list[BackupChapter]
    entities: list[BackupEntity]
    facts: list[BackupFact]
    relationships: list[BackupRelationship]
    jobs: list[BackupJob]


class LibraryBackup(BackupModel):
    version: Literal[1]
    books: list[BackupBook]

    @field_validator("version", mode="before")
    @classmethod
    def validate_version(cls, value: object) -> object:
        if type(value) is not int:
            raise ValueError("Invalid version")
        return value


class RestoreResponse(BaseModel):
    restored: int = Field(ge=0)
