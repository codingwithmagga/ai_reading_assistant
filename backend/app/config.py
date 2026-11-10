from functools import lru_cache
from pathlib import Path
from typing import Annotated

from pydantic import Field, SecretStr, StringConstraints
from pydantic_settings import BaseSettings, SettingsConfigDict

PROJECT_ROOT = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=PROJECT_ROOT / ".env", extra="ignore")

    database_url: str = "sqlite:///./reading_assistant.db"
    openai_api_key: SecretStr | None = None
    openai_model: Annotated[
        str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100)
    ] = "gpt-4o-mini"
    openai_max_attempts: int = Field(default=3, ge=1, le=5)
    openai_timeout_seconds: float = Field(default=60, gt=0, le=300)
    extraction_max_paragraphs_per_block: int = Field(default=25, ge=1, le=200)
    extraction_max_block_characters: int = Field(default=20_000, ge=500, le=100_000)
    app_output_language: Annotated[
        str, StringConstraints(strip_whitespace=True, min_length=2, max_length=20)
    ] = "de"
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
