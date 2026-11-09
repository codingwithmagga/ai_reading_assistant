from fastapi import FastAPI

app = FastAPI(title="Spoilerfreier Lesebegleiter")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
