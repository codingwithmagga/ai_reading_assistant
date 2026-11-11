"""Allow extraction jobs to stop at a selected chapter.

Revision ID: 0006_extraction_chapter_limit
Revises: 0005_reading_progress
Create Date: 2026-11-11

"""
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0006_extraction_chapter_limit"
down_revision: str | None = "0005_reading_progress"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table("jobs", recreate="always") as batch_op:
        batch_op.add_column(sa.Column("max_chapter_index", sa.Integer(), nullable=True))
        batch_op.create_check_constraint(
            "ck_jobs_max_chapter_index_nonnegative",
            "max_chapter_index IS NULL OR max_chapter_index >= 0",
        )


def downgrade() -> None:
    with op.batch_alter_table("jobs", recreate="always") as batch_op:
        batch_op.drop_constraint("ck_jobs_max_chapter_index_nonnegative", type_="check")
        batch_op.drop_column("max_chapter_index")
