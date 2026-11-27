"""Add events table for chronological event tracking.

Revision ID: 0010_events_table
Revises: 0009_paragraph_rich_text
Create Date: 2026-11-27

"""
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0010_events_table"
down_revision: str | None = "0009_paragraph_rich_text"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "events",
        sa.Column("id", sa.String(36), nullable=False),
        sa.Column("book_id", sa.String(36), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.Column("chapter_id", sa.String(36), nullable=True),
        sa.Column("paragraph_id", sa.String(36), nullable=True),
        sa.Column("title", sa.String(500), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("event_type", sa.String(50), nullable=True),
        sa.Column("entities", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("position >= 0", name="ck_events_position_nonnegative"),
        sa.ForeignKeyConstraint(["book_id"], ["books.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["chapter_id"], ["chapters.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["paragraph_id"], ["paragraphs.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_events_book_position", "events", ["book_id", "position"])


def downgrade() -> None:
    op.drop_index("ix_events_book_position", table_name="events")
    op.drop_table("events")
