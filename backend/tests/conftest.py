from collections.abc import Generator
from pathlib import Path

import pytest
from alembic.config import Config
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session, sessionmaker

from alembic import command
from app.config import get_settings
from app.database import create_database_engine, get_session
from app.main import app

BACKEND_DIR = Path(__file__).resolve().parents[1]


@pytest.fixture
def client(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Generator[TestClient, None, None]:
    database_path = (tmp_path / "books.db").as_posix()
    database_url = f"sqlite:///{database_path}"
    monkeypatch.setenv("DATABASE_URL", database_url)
    get_settings.cache_clear()
    config = Config(str(BACKEND_DIR / "alembic.ini"))
    config.set_main_option("script_location", str(BACKEND_DIR / "alembic"))
    command.upgrade(config, "head")

    engine = create_database_engine(database_url)
    app.state.test_engine = engine
    test_session = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)

    def override_get_session() -> Generator[Session, None, None]:
        with test_session() as session:
            yield session

    app.dependency_overrides[get_session] = override_get_session
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()
    del app.state.test_engine
    engine.dispose()
    get_settings.cache_clear()
