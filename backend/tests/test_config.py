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


@pytest.mark.parametrize(
    ("name", "value"),
    [
        ("EPUB_MAX_UPLOAD_MB", "0"),
        ("EPUB_MAX_UPLOAD_MB", "501"),
        ("EPUB_MAX_UNCOMPRESSED_MB", "-1"),
        ("EPUB_MAX_ARCHIVE_ENTRIES", "0"),
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
