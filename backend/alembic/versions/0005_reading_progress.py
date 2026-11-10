"""Persist a book's current reading position.

Revision ID: 0005_reading_progress
Revises: 0004_extraction_checkpoints
Create Date: 2026-11-10

"""
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0005_reading_progress"
down_revision: str | None = "0004_extraction_checkpoints"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table("books", recreate="always") as batch_op:
        batch_op.add_column(sa.Column("current_position", sa.Integer(), nullable=True))
        batch_op.create_check_constraint(
            "ck_books_current_position_nonnegative",
            "current_position IS NULL OR current_position >= 0",
        )


def downgrade() -> None:
    with op.batch_alter_table("books", recreate="always") as batch_op:
        batch_op.drop_constraint("ck_books_current_position_nonnegative", type_="check")
        batch_op.drop_column("current_position")
