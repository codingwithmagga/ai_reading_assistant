import re
import xml.etree.ElementTree as ET
from dataclasses import dataclass
from io import BytesIO
from zipfile import BadZipFile, ZipFile

from bs4 import BeautifulSoup
from ebooklib import ITEM_DOCUMENT, epub
from ebooklib.exceptions import EpubException

MAX_UPLOAD_BYTES = 50 * 1024 * 1024
MAX_UNCOMPRESSED_BYTES = 250 * 1024 * 1024
MAX_ARCHIVE_ENTRIES = 5_000
_FONT_OBFUSCATION_ALGORITHMS = {
    "http://www.idpf.org/2008/embedding",
    "http://ns.adobe.com/pdf/enc#RC",
}
_BLOCK_TAGS = {"p", "h1", "h2", "h3", "h4", "h5", "h6", "blockquote", "pre", "li"}
_WHITESPACE = re.compile(r"\s+")


class EpubParsingError(ValueError):
    """Raised when an EPUB cannot be safely parsed."""


@dataclass(frozen=True)
class ParsedChapter:
    index: int
    title: str | None
    start_position: int
    end_position: int
    paragraphs: tuple[str, ...]


@dataclass(frozen=True)
class ParsedBook:
    title: str
    author: str | None
    language: str | None
    chapters: tuple[ParsedChapter, ...]

    @property
    def paragraph_count(self) -> int:
        return sum(len(chapter.paragraphs) for chapter in self.chapters)


def parse_epub(
    content: bytes,
    *,
    max_upload_bytes: int = MAX_UPLOAD_BYTES,
    max_uncompressed_bytes: int = MAX_UNCOMPRESSED_BYTES,
    max_archive_entries: int = MAX_ARCHIVE_ENTRIES,
) -> ParsedBook:
    if not content:
        raise EpubParsingError("Die EPUB-Datei ist leer.")
    if len(content) > max_upload_bytes:
        raise EpubParsingError("Die EPUB-Datei überschreitet die erlaubte Upload-Größe.")

    try:
        with ZipFile(BytesIO(content)) as archive:
            _validate_archive(
                archive,
                max_uncompressed_bytes=max_uncompressed_bytes,
                max_archive_entries=max_archive_entries,
            )
            package_data = archive.read("META-INF/container.xml")
            package_root = ET.fromstring(package_data)
            encryption_info = archive.read("META-INF/encryption.xml") if (
                "META-INF/encryption.xml" in archive.namelist()
            ) else None
            _reject_drm_encryption(encryption_info)
    except EpubParsingError:
        raise
    except (BadZipFile, KeyError, ET.ParseError, OSError, RuntimeError) as error:
        raise EpubParsingError("Die Datei ist kein gültiges, lesbares EPUB.") from error

    if not package_root.tag.endswith("container"):
        raise EpubParsingError("Die EPUB-Datei enthält keine gültige Container-Beschreibung.")

    try:
        book = epub.read_epub(BytesIO(content), options={"ignore_ncx": True})
    except (
        BadZipFile,
        EpubException,
        KeyError,
        ET.ParseError,
        OSError,
        RuntimeError,
        ValueError,
    ) as error:
        raise EpubParsingError("Die EPUB-Datei konnte nicht gelesen werden.") from error

    title = _metadata_value(book, "title") or "Unbekannter Titel"
    author_values = book.get_metadata("DC", "creator")
    author = _bounded_metadata(", ".join(value for value, _ in author_values), 500)
    language = _metadata_value(book, "language")

    parsed_chapters: list[ParsedChapter] = []
    next_position = 0

    for idref, _linear in book.spine:
        item = book.get_item_with_id(idref)
        if item is None or item.get_type() != ITEM_DOCUMENT:
            continue

        soup = BeautifulSoup(item.get_content(), "lxml")
        body = soup.body or soup
        paragraphs = _extract_paragraphs(body)
        if not paragraphs:
            continue

        chapter_title = _chapter_title(body, item.get_name())
        start_position = next_position
        next_position += len(paragraphs)
        parsed_chapters.append(
            ParsedChapter(
                index=len(parsed_chapters),
                title=_bounded_metadata(chapter_title, 500),
                start_position=start_position,
                end_position=next_position - 1,
                paragraphs=tuple(paragraphs),
            )
        )

    if not parsed_chapters:
        raise EpubParsingError("Die EPUB-Datei enthält keine lesbaren Kapitel.")

    return ParsedBook(
        title=_bounded_metadata(title, 500) or "Unbekannter Titel",
        author=author,
        language=_bounded_metadata(language, 32),
        chapters=tuple(parsed_chapters),
    )


def _validate_archive(
    archive: ZipFile,
    *,
    max_uncompressed_bytes: int,
    max_archive_entries: int,
) -> None:
    entries = archive.infolist()
    if len(entries) > max_archive_entries:
        raise EpubParsingError("Die EPUB-Datei enthält zu viele Archiveinträge.")
    if sum(entry.file_size for entry in entries) > max_uncompressed_bytes:
        raise EpubParsingError("Die entpackte EPUB-Datei überschreitet die erlaubte Größe.")
    if any(entry.flag_bits & 0x1 for entry in entries):
        raise EpubParsingError(
            "Verschlüsselte oder DRM-geschützte EPUB-Dateien werden nicht unterstützt."
        )
    if "mimetype" not in archive.namelist() or "META-INF/container.xml" not in archive.namelist():
        raise EpubParsingError("Die Datei hat nicht die erforderliche EPUB-Struktur.")
    if archive.read("mimetype").decode("ascii", errors="replace").strip() != "application/epub+zip":
        raise EpubParsingError("Die Datei ist kein gültiges EPUB.")


def _reject_drm_encryption(encryption_data: bytes | None) -> None:
    if encryption_data is None:
        return

    try:
        root = ET.fromstring(encryption_data)
    except ET.ParseError as error:
        raise EpubParsingError("Die EPUB-Verschlüsselungsinformationen sind ungültig.") from error

    for encrypted_data in root.iter():
        if encrypted_data.tag.endswith("EncryptionMethod"):
            algorithm = encrypted_data.attrib.get("Algorithm", "")
            if algorithm not in _FONT_OBFUSCATION_ALGORITHMS:
                raise EpubParsingError(
                    "Verschlüsselte oder DRM-geschützte EPUB-Dateien werden nicht unterstützt."
                )


def _metadata_value(book: epub.EpubBook, name: str) -> str | None:
    values = book.get_metadata("DC", name)
    if not values:
        return None
    return _bounded_metadata(values[0][0], 500)


def _bounded_metadata(value: str | None, limit: int) -> str | None:
    if value is None:
        return None
    normalized = _WHITESPACE.sub(" ", value).strip()
    return normalized[:limit] or None


def _extract_paragraphs(body: BeautifulSoup) -> list[str]:
    paragraphs: list[str] = []
    for element in body.find_all(_BLOCK_TAGS):
        if any(parent.name in _BLOCK_TAGS for parent in element.parents if parent is not body):
            continue
        text = _normalize_text(element.get_text(" ", strip=True))
        if text:
            paragraphs.append(text)

    if paragraphs:
        return paragraphs

    for element in body.find_all("div"):
        if element.find("div") is None:
            text = _normalize_text(element.get_text(" ", strip=True))
            if text:
                paragraphs.append(text)
    return paragraphs


def _normalize_text(text: str) -> str:
    return _WHITESPACE.sub(" ", text).strip()


def _chapter_title(body: BeautifulSoup, fallback: str) -> str:
    heading = body.find(["h1", "h2", "h3", "title"])
    if heading is not None:
        text = _normalize_text(heading.get_text(" ", strip=True))
        if text:
            return text
    return fallback.rsplit("/", 1)[-1].rsplit(".", 1)[0]
