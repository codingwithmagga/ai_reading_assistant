from datetime import UTC, datetime
from uuid import uuid4

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    text,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass


def utc_now() -> datetime:
    return datetime.now(UTC)


class Book(Base):
    __tablename__ = "books"
    __table_args__ = (
        CheckConstraint(
            "status IN ('uploaded', 'parsing', 'extracting', 'parsed', 'ready', 'error')",
            name="ck_books_status",
        ),
        CheckConstraint(
            "current_position IS NULL OR current_position >= 0",
            name="ck_books_current_position_nonnegative",
        ),
        UniqueConstraint("source_hash", name="uq_books_source_hash"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    title: Mapped[str] = mapped_column(String(500), nullable=False)
    author: Mapped[str | None] = mapped_column(String(500))
    language: Mapped[str | None] = mapped_column(String(32))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="uploaded")
    source_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    current_position: Mapped[int | None] = mapped_column(Integer)

    chapters: Mapped[list["Chapter"]] = relationship(
        back_populates="book",
        cascade="all, delete-orphan",
        passive_deletes=True,
        order_by="Chapter.index",
    )
    paragraphs: Mapped[list["Paragraph"]] = relationship(
        back_populates="book",
        cascade="all, delete-orphan",
        passive_deletes=True,
        order_by="Paragraph.position",
    )
    jobs: Mapped[list["Job"]] = relationship(
        back_populates="book",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
    entities: Mapped[list["Entity"]] = relationship(
        back_populates="book",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
    facts: Mapped[list["Fact"]] = relationship(
        back_populates="book",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
    relationships: Mapped[list["Relationship"]] = relationship(
        back_populates="book",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )


class Chapter(Base):
    __tablename__ = "chapters"
    __table_args__ = (
        UniqueConstraint("book_id", "index", name="uq_chapters_book_index"),
        CheckConstraint('"index" >= 0', name="ck_chapters_index_nonnegative"),
        CheckConstraint("start_position >= 0", name="ck_chapters_start_nonnegative"),
        CheckConstraint(
            "end_position >= start_position",
            name="ck_chapters_position_range",
        ),
        Index("ix_chapters_book_range", "book_id", "start_position", "end_position"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    book_id: Mapped[str] = mapped_column(
        ForeignKey("books.id", ondelete="CASCADE"),
        nullable=False,
    )
    index: Mapped[int] = mapped_column(Integer, nullable=False)
    title: Mapped[str | None] = mapped_column(String(500))
    start_position: Mapped[int] = mapped_column(Integer, nullable=False)
    end_position: Mapped[int] = mapped_column(Integer, nullable=False)

    book: Mapped[Book] = relationship(back_populates="chapters")
    paragraphs: Mapped[list["Paragraph"]] = relationship(
        back_populates="chapter",
        cascade="all, delete-orphan",
        passive_deletes=True,
        order_by="Paragraph.position",
    )


class Paragraph(Base):
    __tablename__ = "paragraphs"
    __table_args__ = (
        UniqueConstraint("book_id", "position", name="uq_paragraphs_book_position"),
        CheckConstraint("position >= 0", name="ck_paragraphs_position_nonnegative"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    book_id: Mapped[str] = mapped_column(
        ForeignKey("books.id", ondelete="CASCADE"),
        nullable=False,
    )
    chapter_id: Mapped[str] = mapped_column(
        ForeignKey("chapters.id", ondelete="CASCADE"),
        nullable=False,
    )
    position: Mapped[int] = mapped_column(Integer, nullable=False)
    text: Mapped[str] = mapped_column(Text, nullable=False)

    book: Mapped[Book] = relationship(back_populates="paragraphs")
    chapter: Mapped[Chapter] = relationship(back_populates="paragraphs")


class Job(Base):
    __tablename__ = "jobs"
    __table_args__ = (
        CheckConstraint("progress >= 0 AND progress <= 100", name="ck_jobs_progress_range"),
        CheckConstraint(
            "status IN ('pending', 'running', 'completed', 'error')",
            name="ck_jobs_status",
        ),
        CheckConstraint(
            "input_tokens >= 0 AND output_tokens >= 0",
            name="ck_jobs_token_counts_nonnegative",
        ),
        Index(
            "uq_jobs_active_extraction_book",
            "book_id",
            unique=True,
            sqlite_where=text("type = 'extraction' AND status IN ('pending', 'running')"),
            postgresql_where=text("type = 'extraction' AND status IN ('pending', 'running')"),
        ),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    book_id: Mapped[str] = mapped_column(
        ForeignKey("books.id", ondelete="CASCADE"),
        nullable=False,
    )
    type: Mapped[str] = mapped_column(String(32), nullable=False)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="pending")
    progress: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    error: Mapped[str | None] = mapped_column(Text)
    error_code: Mapped[str | None] = mapped_column(String(100))
    last_completed_chapter_index: Mapped[int | None] = mapped_column(Integer)
    last_completed_block_index: Mapped[int | None] = mapped_column(Integer)
    input_tokens: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    output_tokens: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    lease_expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)

    book: Mapped[Book] = relationship(back_populates="jobs")
    extraction_checkpoints: Mapped[list["ExtractionCheckpoint"]] = relationship(
        back_populates="job",
        cascade="all, delete-orphan",
        passive_deletes=True,
        order_by="(ExtractionCheckpoint.chapter_index, ExtractionCheckpoint.block_index)",
    )


class ExtractionCheckpoint(Base):
    __tablename__ = "extraction_checkpoints"
    __table_args__ = (
        CheckConstraint("chapter_index >= 0", name="ck_extraction_checkpoints_chapter_nonnegative"),
        CheckConstraint("block_index >= 0", name="ck_extraction_checkpoints_block_nonnegative"),
        CheckConstraint(
            "first_paragraph_position >= 0",
            name="ck_extraction_checkpoints_position_nonnegative",
        ),
        CheckConstraint(
            "paragraph_count > 0",
            name="ck_extraction_checkpoints_paragraph_count_positive",
        ),
        CheckConstraint(
            "input_tokens >= 0 AND output_tokens >= 0",
            name="ck_extraction_checkpoints_tokens_nonnegative",
        ),
        UniqueConstraint(
            "job_id",
            "chapter_index",
            "block_index",
            name="uq_extraction_checkpoints_job_chapter_block",
        ),
        Index(
            "ix_extraction_checkpoints_job_order",
            "job_id",
            "chapter_index",
            "block_index",
        ),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    job_id: Mapped[str] = mapped_column(ForeignKey("jobs.id", ondelete="CASCADE"), nullable=False)
    chapter_index: Mapped[int] = mapped_column(Integer, nullable=False)
    block_index: Mapped[int] = mapped_column(Integer, nullable=False)
    first_paragraph_position: Mapped[int] = mapped_column(Integer, nullable=False)
    paragraph_count: Mapped[int] = mapped_column(Integer, nullable=False)
    result_json: Mapped[str] = mapped_column(Text, nullable=False)
    input_tokens: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    output_tokens: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)

    job: Mapped[Job] = relationship(back_populates="extraction_checkpoints")


class Entity(Base):
    __tablename__ = "entities"
    __table_args__ = (
        CheckConstraint(
            "type IN ('person', 'place', 'group', 'object', 'concept')",
            name="ck_entities_type",
        ),
        CheckConstraint("first_position >= 0", name="ck_entities_first_position"),
        UniqueConstraint(
            "book_id",
            "type",
            "canonical_name",
            name="uq_entities_book_type_name",
        ),
        Index("ix_entities_book_canonical_name", "book_id", "canonical_name"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    book_id: Mapped[str] = mapped_column(
        ForeignKey("books.id", ondelete="CASCADE"),
        nullable=False,
    )
    type: Mapped[str] = mapped_column(String(16), nullable=False)
    canonical_name: Mapped[str] = mapped_column(String(500), nullable=False)
    first_position: Mapped[int] = mapped_column(Integer, nullable=False)

    book: Mapped[Book] = relationship(back_populates="entities")
    aliases: Mapped[list["EntityAlias"]] = relationship(
        back_populates="entity",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
    facts: Mapped[list["Fact"]] = relationship(
        back_populates="entity",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
    relationships_from: Mapped[list["Relationship"]] = relationship(
        back_populates="entity_a",
        foreign_keys="Relationship.entity_a_id",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
    relationships_to: Mapped[list["Relationship"]] = relationship(
        back_populates="entity_b",
        foreign_keys="Relationship.entity_b_id",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )


class EntityAlias(Base):
    __tablename__ = "entity_aliases"
    __table_args__ = (
        CheckConstraint("first_position >= 0", name="ck_entity_aliases_first_position"),
        UniqueConstraint("entity_id", "alias", name="uq_entity_aliases_entity_alias"),
        Index("ix_entity_aliases_entity_position", "entity_id", "first_position"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    entity_id: Mapped[str] = mapped_column(
        ForeignKey("entities.id", ondelete="CASCADE"),
        nullable=False,
    )
    alias: Mapped[str] = mapped_column(String(500), nullable=False)
    first_position: Mapped[int] = mapped_column(Integer, nullable=False)

    entity: Mapped[Entity] = relationship(back_populates="aliases")


class Fact(Base):
    __tablename__ = "facts"
    __table_args__ = (
        CheckConstraint(
            "kind IN ('description', 'relationship', 'event', 'motivation')",
            name="ck_facts_kind",
        ),
        CheckConstraint("position >= 0", name="ck_facts_position"),
        CheckConstraint("length(source_excerpt) <= 200", name="ck_facts_excerpt_length"),
        UniqueConstraint(
            "entity_id",
            "position",
            "kind",
            "text",
            name="uq_facts_entity_position_kind_text",
        ),
        Index("ix_facts_book_position", "book_id", "position"),
        Index("ix_facts_entity_position", "entity_id", "position"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    book_id: Mapped[str] = mapped_column(
        ForeignKey("books.id", ondelete="CASCADE"),
        nullable=False,
    )
    entity_id: Mapped[str] = mapped_column(
        ForeignKey("entities.id", ondelete="CASCADE"),
        nullable=False,
    )
    text: Mapped[str] = mapped_column(Text, nullable=False)
    position: Mapped[int] = mapped_column(Integer, nullable=False)
    chapter_id: Mapped[str] = mapped_column(
        ForeignKey("chapters.id", ondelete="CASCADE"),
        nullable=False,
    )
    source_excerpt: Mapped[str] = mapped_column(String(200), nullable=False)
    kind: Mapped[str] = mapped_column(String(16), nullable=False)

    book: Mapped[Book] = relationship(back_populates="facts")
    entity: Mapped[Entity] = relationship(back_populates="facts")
    chapter: Mapped[Chapter] = relationship()


class Relationship(Base):
    __tablename__ = "relationships"
    __table_args__ = (
        CheckConstraint("position >= 0", name="ck_relationships_position"),
        UniqueConstraint(
            "entity_a_id",
            "entity_b_id",
            "label",
            "position",
            name="uq_relationships_pair_label_position",
        ),
        Index("ix_relationships_book_position", "book_id", "position"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    book_id: Mapped[str] = mapped_column(
        ForeignKey("books.id", ondelete="CASCADE"),
        nullable=False,
    )
    entity_a_id: Mapped[str] = mapped_column(
        ForeignKey("entities.id", ondelete="CASCADE"),
        nullable=False,
    )
    entity_b_id: Mapped[str] = mapped_column(
        ForeignKey("entities.id", ondelete="CASCADE"),
        nullable=False,
    )
    label: Mapped[str] = mapped_column(String(500), nullable=False)
    position: Mapped[int] = mapped_column(Integer, nullable=False)

    book: Mapped[Book] = relationship(back_populates="relationships")
    entity_a: Mapped[Entity] = relationship(
        back_populates="relationships_from",
        foreign_keys=[entity_a_id],
    )
    entity_b: Mapped[Entity] = relationship(
        back_populates="relationships_to",
        foreign_keys=[entity_b_id],
    )
