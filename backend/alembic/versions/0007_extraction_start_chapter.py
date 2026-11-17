"""Persist the first chapter of an extraction job."""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0007_extraction_start_chapter"
down_revision: str | None = "0006_extraction_chapter_limit"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "jobs",
        sa.Column(
            "min_chapter_index",
            sa.Integer(),
            sa.CheckConstraint("min_chapter_index >= 0"),
            nullable=False,
            server_default="0",
        ),
    )


def downgrade() -> None:
    op.drop_column("jobs", "min_chapter_index")
