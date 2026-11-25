"""Store bounded rich-text formatting for EPUB paragraphs.

Revision ID: 0009_paragraph_rich_text
Revises: 0008_extraction_worker_lease_owner
Create Date: 2026-11-25

"""
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0009_paragraph_rich_text"
down_revision: str | None = "0008_extraction_worker_lease_owner"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table("paragraphs") as batch_op:
        batch_op.add_column(sa.Column("rich_text", sa.JSON(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("paragraphs") as batch_op:
        batch_op.drop_column("rich_text")
