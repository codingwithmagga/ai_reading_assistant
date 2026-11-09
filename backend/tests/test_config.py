from pathlib import Path

import pytest
from pydantic import ValidationError

from app.config import Settings


def test_settings_parse_database_and_epub_limits_from_environment(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("DATABASE_URL", "sqlite:////tmp/books.db")
    monkeypatch.setenv("UPLOAD_TEMP_DIR", "/tmp/custom-uploads")
    monkeypatch.setenv("EPUB_MAX_UPLOAD_MB", "12")
    monkeypatch.setenv("EPUB_MAX_UNCOMPRESSED_MB", "80")
    monkeypatch.setenv("EPUB_MAX_ARCHIVE_ENTRIES", "1200")

    settings = Settings(_env_file=None)

    assert settings.database_url == "sqlite:////tmp/books.db"
    assert settings.upload_temp_dir == Path("/tmp/custom-uploads")
    assert settings.epub_max_upload_mb == 12
    assert settings.epub_max_upload_bytes == 12 * 1024 * 1024
    assert settings.epub_max_uncompressed_bytes == 80 * 1024 * 1024
    assert settings.epub_max_archive_entries == 1200


def test_settings_parse_openai_configuration_from_environment(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("OPENAI_API_KEY", "test-secret")
    monkeypatch.setenv("OPENAI_MODEL", "gpt-test")
    monkeypatch.setenv("OPENAI_MAX_ATTEMPTS", "4")
    monkeypatch.setenv("OPENAI_TIMEOUT_SECONDS", "45")
    monkeypatch.setenv("APP_OUTPUT_LANGUAGE", "en")

    settings = Settings(_env_file=None)

    assert settings.openai_api_key is not None
    assert settings.openai_api_key.get_secret_value() == "test-secret"
    assert settings.openai_model == "gpt-test"
    assert settings.openai_max_attempts == 4
    assert settings.openai_timeout_seconds == 45
    assert settings.app_output_language == "en"


@pytest.mark.parametrize(
    ("name", "value"),
    [
        ("EPUB_MAX_UPLOAD_MB", "0"),
        ("EPUB_MAX_UPLOAD_MB", "501"),
        ("EPUB_MAX_UNCOMPRESSED_MB", "-1"),
        ("EPUB_MAX_ARCHIVE_ENTRIES", "0"),
        ("OPENAI_MAX_ATTEMPTS", "0"),
        ("OPENAI_MAX_ATTEMPTS", "6"),
        ("OPENAI_TIMEOUT_SECONDS", "0"),
        ("APP_OUTPUT_LANGUAGE", " "),
        ("OPENAI_MODEL", " "),
    ],
)
def test_settings_reject_out_of_range_epub_limits(
    monkeypatch: pytest.MonkeyPatch,
    name: str,
    value: str,
) -> None:
    monkeypatch.setenv(name, value)

    with pytest.raises(ValidationError):
        Settings(_env_file=None)
