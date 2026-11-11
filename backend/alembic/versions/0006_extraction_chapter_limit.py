"""Allow extraction jobs to stop at a selected chapter.

Revision ID: 0006_extraction_chapter_limit
Revises: 0005_reading_progress
Create Date: 2026-11-11

"""
from collections.abc import Iterator, Sequence
from contextlib import contextmanager

import sqlalchemy as sa

from alembic import op

revision: str = "0006_extraction_chapter_limit"
down_revision: str | None = "0005_reading_progress"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


@contextmanager
def preserve_sqlite_checkpoints() -> Iterator[None]:
    connection = op.get_bind()
    if connection.dialect.name != "sqlite":
        yield
        return

    # Keep the table rebuild and checkpoint restoration atomic with foreign keys enabled.
    with connection.begin_nested():
        op.execute(
            "CREATE TEMPORARY TABLE _migration_0006_checkpoints "
            "AS SELECT * FROM extraction_checkpoints"
        )
        yield
        op.execute(
            "INSERT INTO extraction_checkpoints SELECT * FROM _migration_0006_checkpoints"
        )
        op.execute("DROP TABLE _migration_0006_checkpoints")


def upgrade() -> None:
    with preserve_sqlite_checkpoints():
        with op.batch_alter_table("jobs") as batch_op:
            batch_op.add_column(sa.Column("max_chapter_index", sa.Integer(), nullable=True))
            batch_op.create_check_constraint(
                "ck_jobs_max_chapter_index_nonnegative",
                "max_chapter_index IS NULL OR max_chapter_index >= 0",
            )


def downgrade() -> None:
    with preserve_sqlite_checkpoints():
        with op.batch_alter_table("jobs") as batch_op:
            batch_op.drop_constraint("ck_jobs_max_chapter_index_nonnegative", type_="check")
            batch_op.drop_column("max_chapter_index")
