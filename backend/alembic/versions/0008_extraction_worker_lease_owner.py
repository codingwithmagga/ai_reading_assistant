"""Track the worker that owns an extraction lease."""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0008_extraction_worker_lease_owner"
down_revision: str | None = "0007_extraction_start_chapter"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("jobs", sa.Column("worker_id", sa.String(length=36), nullable=True))


def downgrade() -> None:
    op.drop_column("jobs", "worker_id")
