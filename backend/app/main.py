from fastapi import FastAPI

from app.books import router as books_router

app = FastAPI(title="Spoilerfreier Lesebegleiter")
app.include_router(books_router)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
