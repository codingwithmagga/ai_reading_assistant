"""Add resumable extraction checkpoints and token accounting.

Revision ID: 0004_extraction_checkpoints
Revises: 0003_extraction_entities_and_facts
Create Date: 2026-11-09

"""
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0004_extraction_checkpoints"
down_revision: str | None = "0003_extraction_entities_and_facts"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table("jobs", recreate="always") as batch_op:
        batch_op.add_column(sa.Column("error_code", sa.String(length=100), nullable=True))
        batch_op.add_column(
            sa.Column("last_completed_chapter_index", sa.Integer(), nullable=True),
        )
        batch_op.add_column(
            sa.Column("last_completed_block_index", sa.Integer(), nullable=True),
        )
        batch_op.add_column(
            sa.Column("input_tokens", sa.Integer(), server_default="0", nullable=False),
        )
        batch_op.add_column(
            sa.Column("output_tokens", sa.Integer(), server_default="0", nullable=False),
        )
        batch_op.add_column(
            sa.Column("lease_expires_at", sa.DateTime(timezone=True), nullable=True),
        )
        batch_op.create_check_constraint(
            "ck_jobs_token_counts_nonnegative",
            "input_tokens >= 0 AND output_tokens >= 0",
        )
    op.create_index(
        "uq_jobs_active_extraction_book",
        "jobs",
        ["book_id"],
        unique=True,
        sqlite_where=sa.text("type = 'extraction' AND status IN ('pending', 'running')"),
        postgresql_where=sa.text("type = 'extraction' AND status IN ('pending', 'running')"),
    )
    op.create_table(
        "extraction_checkpoints",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("job_id", sa.String(length=36), nullable=False),
        sa.Column("chapter_index", sa.Integer(), nullable=False),
        sa.Column("block_index", sa.Integer(), nullable=False),
        sa.Column("first_paragraph_position", sa.Integer(), nullable=False),
        sa.Column("paragraph_count", sa.Integer(), nullable=False),
        sa.Column("result_json", sa.Text(), nullable=False),
        sa.Column("input_tokens", sa.Integer(), nullable=False),
        sa.Column("output_tokens", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "chapter_index >= 0",
            name="ck_extraction_checkpoints_chapter_nonnegative",
        ),
        sa.CheckConstraint(
            "block_index >= 0",
            name="ck_extraction_checkpoints_block_nonnegative",
        ),
        sa.CheckConstraint(
            "first_paragraph_position >= 0",
            name="ck_extraction_checkpoints_position_nonnegative",
        ),
        sa.CheckConstraint(
            "paragraph_count > 0",
            name="ck_extraction_checkpoints_paragraph_count_positive",
        ),
        sa.CheckConstraint(
            "input_tokens >= 0 AND output_tokens >= 0",
            name="ck_extraction_checkpoints_tokens_nonnegative",
        ),
        sa.ForeignKeyConstraint(["job_id"], ["jobs.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "job_id",
            "chapter_index",
            "block_index",
            name="uq_extraction_checkpoints_job_chapter_block",
        ),
    )
    op.create_index(
        "ix_extraction_checkpoints_job_order",
        "extraction_checkpoints",
        ["job_id", "chapter_index", "block_index"],
    )


def downgrade() -> None:
    op.drop_index("ix_extraction_checkpoints_job_order", table_name="extraction_checkpoints")
    op.drop_table("extraction_checkpoints")
    op.drop_index("uq_jobs_active_extraction_book", table_name="jobs")
    with op.batch_alter_table("jobs", recreate="always") as batch_op:
        batch_op.drop_constraint("ck_jobs_token_counts_nonnegative", type_="check")
        batch_op.drop_column("lease_expires_at")
        batch_op.drop_column("output_tokens")
        batch_op.drop_column("input_tokens")
        batch_op.drop_column("last_completed_block_index")
        batch_op.drop_column("last_completed_chapter_index")
        batch_op.drop_column("error_code")
