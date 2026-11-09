"""Prevent duplicate EPUB uploads by source hash.

Revision ID: 0002_unique_book_source_hash
Revises: 0001_initial_schema
Create Date: 2026-11-09

"""
from collections.abc import Sequence

from alembic import op

revision: str = "0002_unique_book_source_hash"
down_revision: str | None = "0001_initial_schema"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table("books") as batch_op:
        batch_op.create_unique_constraint("uq_books_source_hash", ["source_hash"])


def downgrade() -> None:
    with op.batch_alter_table("books") as batch_op:
        batch_op.drop_constraint("uq_books_source_hash", type_="unique")
