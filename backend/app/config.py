from functools import lru_cache
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

PROJECT_ROOT = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=PROJECT_ROOT / ".env", extra="ignore")

    database_url: str = "sqlite:///./reading_assistant.db"
    upload_temp_dir: Path = Path("/tmp/reading-assistant-uploads")
    epub_max_upload_mb: int = Field(default=50, ge=1, le=500)
    epub_max_uncompressed_mb: int = Field(default=250, ge=1, le=2_000)
    epub_max_archive_entries: int = Field(default=5_000, ge=1, le=50_000)

    @property
    def epub_max_upload_bytes(self) -> int:
        return self.epub_max_upload_mb * 1024 * 1024

    @property
    def epub_max_uncompressed_bytes(self) -> int:
        return self.epub_max_uncompressed_mb * 1024 * 1024


@lru_cache
def get_settings() -> Settings:
    return Settings()
