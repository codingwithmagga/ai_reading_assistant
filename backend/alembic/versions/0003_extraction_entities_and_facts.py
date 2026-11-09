"""Add entities, aliases, facts, and relationships.

Revision ID: 0003_extraction_entities_and_facts
Revises: 0002_unique_book_source_hash
Create Date: 2026-11-09

"""
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0003_extraction_entities_and_facts"
down_revision: str | None = "0002_unique_book_source_hash"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "entities",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("book_id", sa.String(length=36), nullable=False),
        sa.Column("type", sa.String(length=16), nullable=False),
        sa.Column("canonical_name", sa.String(length=500), nullable=False),
        sa.Column("first_position", sa.Integer(), nullable=False),
        sa.CheckConstraint(
            "type IN ('person', 'place', 'group', 'object', 'concept')",
            name="ck_entities_type",
        ),
        sa.CheckConstraint("first_position >= 0", name="ck_entities_first_position"),
        sa.ForeignKeyConstraint(["book_id"], ["books.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "book_id",
            "type",
            "canonical_name",
            name="uq_entities_book_type_name",
        ),
    )
    op.create_index(
        "ix_entities_book_canonical_name",
        "entities",
        ["book_id", "canonical_name"],
    )
    op.create_table(
        "entity_aliases",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("entity_id", sa.String(length=36), nullable=False),
        sa.Column("alias", sa.String(length=500), nullable=False),
        sa.Column("first_position", sa.Integer(), nullable=False),
        sa.CheckConstraint("first_position >= 0", name="ck_entity_aliases_first_position"),
        sa.ForeignKeyConstraint(["entity_id"], ["entities.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("entity_id", "alias", name="uq_entity_aliases_entity_alias"),
    )
    op.create_index(
        "ix_entity_aliases_entity_position",
        "entity_aliases",
        ["entity_id", "first_position"],
    )
    op.create_table(
        "facts",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("book_id", sa.String(length=36), nullable=False),
        sa.Column("entity_id", sa.String(length=36), nullable=False),
        sa.Column("text", sa.Text(), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.Column("chapter_id", sa.String(length=36), nullable=False),
        sa.Column("source_excerpt", sa.String(length=200), nullable=False),
        sa.Column("kind", sa.String(length=16), nullable=False),
        sa.CheckConstraint(
            "kind IN ('description', 'relationship', 'event', 'motivation')",
            name="ck_facts_kind",
        ),
        sa.CheckConstraint("position >= 0", name="ck_facts_position"),
        sa.CheckConstraint("length(source_excerpt) <= 200", name="ck_facts_excerpt_length"),
        sa.ForeignKeyConstraint(["book_id"], ["books.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["chapter_id"], ["chapters.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["entity_id"], ["entities.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "entity_id",
            "position",
            "kind",
            "text",
            name="uq_facts_entity_position_kind_text",
        ),
    )
    op.create_index("ix_facts_book_position", "facts", ["book_id", "position"])
    op.create_index("ix_facts_entity_position", "facts", ["entity_id", "position"])
    op.create_table(
        "relationships",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("book_id", sa.String(length=36), nullable=False),
        sa.Column("entity_a_id", sa.String(length=36), nullable=False),
        sa.Column("entity_b_id", sa.String(length=36), nullable=False),
        sa.Column("label", sa.String(length=500), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.CheckConstraint("position >= 0", name="ck_relationships_position"),
        sa.ForeignKeyConstraint(["book_id"], ["books.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["entity_a_id"], ["entities.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["entity_b_id"], ["entities.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "entity_a_id",
            "entity_b_id",
            "label",
            "position",
            name="uq_relationships_pair_label_position",
        ),
    )
    op.create_index(
        "ix_relationships_book_position",
        "relationships",
        ["book_id", "position"],
    )


def downgrade() -> None:
    op.drop_index("ix_relationships_book_position", table_name="relationships")
    op.drop_table("relationships")
    op.drop_index("ix_facts_entity_position", table_name="facts")
    op.drop_index("ix_facts_book_position", table_name="facts")
    op.drop_table("facts")
    op.drop_index("ix_entity_aliases_entity_position", table_name="entity_aliases")
    op.drop_table("entity_aliases")
    op.drop_index("ix_entities_book_canonical_name", table_name="entities")
    op.drop_table("entities")
