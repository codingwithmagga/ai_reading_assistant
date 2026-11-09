import tempfile
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.books import router as books_router
from app.config import get_settings


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    upload_temp_dir = get_settings().upload_temp_dir
    upload_temp_dir.mkdir(parents=True, exist_ok=True)
    previous_temp_dir = tempfile.tempdir
    tempfile.tempdir = str(upload_temp_dir)
    try:
        yield
    finally:
        tempfile.tempdir = previous_temp_dir


app = FastAPI(title="Spoilerfreier Lesebegleiter", lifespan=lifespan)
app.include_router(books_router)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
