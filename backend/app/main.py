import asyncio
import tempfile
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from sqlalchemy.orm import sessionmaker

from app.backup import router as backup_router
from app.book_queries import router as book_queries_router
from app.books import router as books_router
from app.books import run_extraction_job_background
from app.config import get_settings
from app.database import SessionLocal
from app.extraction_jobs import recover_interrupted_extraction_jobs


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    upload_temp_dir = get_settings().upload_temp_dir
    upload_temp_dir.mkdir(parents=True, exist_ok=True)
    previous_temp_dir = tempfile.tempdir
    tempfile.tempdir = str(upload_temp_dir)
    recovery_tasks: set[asyncio.Task[None]] = set()
    app.state.extraction_recovery_tasks = recovery_tasks
    test_engine = getattr(app.state, "test_engine", None)
    startup_session_factory = (
        sessionmaker(bind=test_engine, autoflush=False, expire_on_commit=False)
        if test_engine is not None
        else SessionLocal
    )
    with startup_session_factory() as session:
        interrupted_jobs = recover_interrupted_extraction_jobs(session)
    for job in interrupted_jobs:
        task = asyncio.create_task(
            asyncio.to_thread(run_extraction_job_background, job.id)
        )
        recovery_tasks.add(task)
        task.add_done_callback(recovery_tasks.discard)
    try:
        yield
    finally:
        for task in list(recovery_tasks):
            task.cancel()
        if recovery_tasks:
            await asyncio.gather(*recovery_tasks, return_exceptions=True)
        tempfile.tempdir = previous_temp_dir


app = FastAPI(
    title="Spoilerfreier Lesebegleiter",
    lifespan=lifespan,
    root_path="/api",
)
app.include_router(backup_router)
app.include_router(books_router)
app.include_router(book_queries_router)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
