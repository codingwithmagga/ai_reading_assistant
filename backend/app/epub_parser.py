import logging
import posixpath
import re
import xml.etree.ElementTree as ET
from dataclasses import dataclass
from io import BytesIO
from urllib.parse import unquote, urlsplit
from zipfile import BadZipFile, ZipFile

from bs4 import BeautifulSoup, Comment, NavigableString, Tag
from ebooklib import ITEM_DOCUMENT, epub
from ebooklib.exceptions import EpubException

logger = logging.getLogger(__name__)

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


@dataclass(frozen=True)
class _NavigationEntry:
    href: str
    title: str


@dataclass(frozen=True)
class _NavigationCandidate:
    source: str
    path: str
    package_directory: str
    entries: tuple[_NavigationEntry, ...]


@dataclass(frozen=True)
class _SpineDocument:
    path: str
    title: str
    paragraphs: tuple[str, ...]
    anchors: dict[str, tuple[int, ...]]


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

    navigation_candidates: tuple[_NavigationCandidate, ...] = ()
    navigation_failure = "navigation_missing"
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
            navigation_candidates, navigation_failure = _read_navigation_candidates(
                archive,
                package_root,
            )
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

    spine_documents: list[_SpineDocument] = []

    for idref, _linear in book.spine:
        item = book.get_item_with_id(idref)
        if item is None or item.get_type() != ITEM_DOCUMENT:
            continue

        soup = BeautifulSoup(item.get_content(), "lxml")
        body = soup.body or soup
        paragraphs, anchors = _extract_paragraphs_and_anchors(body)
        if not paragraphs:
            continue

        spine_documents.append(
            _SpineDocument(
                path=posixpath.normpath(unquote(item.get_name())),
                title=_bounded_metadata(_chapter_title(body, item.get_name()), 500) or "",
                paragraphs=tuple(paragraphs),
                anchors={name: tuple(positions) for name, positions in anchors.items()},
            )
        )

    if not spine_documents:
        raise EpubParsingError("Die EPUB-Datei enthält keine lesbaren Kapitel.")

    parsed_chapters: list[ParsedChapter] | None = None
    last_navigation_failure = navigation_failure
    for candidate in navigation_candidates:
        parsed_chapters, last_navigation_failure = _chapters_from_navigation(
            spine_documents,
            candidate,
        )
        if parsed_chapters is not None:
            logger.info("EPUB navigation applied (source=%s)", candidate.source)
            break
    if parsed_chapters is None:
        logger.info(
            "EPUB navigation unavailable; using spine-based chapter parsing (reason=%s)",
            last_navigation_failure,
        )
        parsed_chapters = _chapters_from_spine(spine_documents)

    return ParsedBook(
        title=_bounded_metadata(title, 500) or "Unbekannter Titel",
        author=author,
        language=_bounded_metadata(language, 32),
        chapters=tuple(parsed_chapters),
    )


def _read_navigation_candidates(
    archive: ZipFile,
    container_root: ET.Element,
) -> tuple[tuple[_NavigationCandidate, ...], str]:
    rootfile = next(
        (
            element
            for element in container_root.iter()
            if _local_name(element.tag) == "rootfile"
        ),
        None,
    )
    package_path = (
        _normalize_archive_path(rootfile.attrib.get("full-path", ""))
        if rootfile is not None
        else None
    )
    if package_path is None:
        return (), "package_path_unresolvable"
    try:
        package_root = ET.fromstring(archive.read(package_path))
    except (BadZipFile, KeyError, ET.ParseError, OSError, RuntimeError):
        return (), "package_unreadable"
    if _local_name(package_root.tag) != "package":
        return (), "package_invalid"

    manifest: dict[str, tuple[str, str, set[str]]] = {}
    manifest_paths: set[str] = set()
    for element in package_root.iter():
        if _local_name(element.tag) != "item":
            continue
        item_id = element.attrib.get("id")
        href = element.attrib.get("href")
        if not item_id or not href:
            continue
        path = _resolve_epub_reference(package_path, href)
        if path is None:
            continue
        if item_id in manifest or path[0] in manifest_paths:
            return (), "manifest_reference_ambiguous"
        manifest_paths.add(path[0])
        manifest[item_id] = (
            path[0],
            element.attrib.get("media-type", ""),
            set(element.attrib.get("properties", "").split()),
        )

    candidates: list[_NavigationCandidate] = []
    failure = "navigation_missing"
    for path, _media_type, properties in manifest.values():
        if "nav" not in properties:
            continue
        try:
            entries = _epub3_navigation_entries(archive.read(path))
        except (BadZipFile, ET.ParseError, KeyError, OSError, RuntimeError):
            entries = None
        if entries:
            candidates.append(
                _NavigationCandidate(
                    "epub3",
                    path,
                    posixpath.dirname(package_path),
                    tuple(entries),
                )
            )
        else:
            failure = "epub3_navigation_empty_or_invalid"

    toc_id = next(
        (
            element.attrib.get("toc")
            for element in package_root.iter()
            if _local_name(element.tag) == "spine"
        ),
        None,
    )
    ncx_path = manifest.get(toc_id, (None, "", set()))[0] if toc_id else None
    if ncx_path is None:
        ncx_path = next(
            (
                path
                for path, media_type, _properties in manifest.values()
                if media_type == "application/x-dtbncx+xml"
            ),
            None,
        )
    if ncx_path is not None:
        try:
            entries = _ncx_navigation_entries(archive.read(ncx_path))
        except (BadZipFile, ET.ParseError, KeyError, OSError, RuntimeError):
            entries = None
        if entries:
            candidates.append(
                _NavigationCandidate(
                    "ncx",
                    ncx_path,
                    posixpath.dirname(package_path),
                    tuple(entries),
                )
            )
        elif not candidates:
            failure = "ncx_navigation_empty_or_invalid"

    return tuple(candidates), failure


def _epub3_navigation_entries(content: bytes) -> list[_NavigationEntry] | None:
    root = ET.fromstring(content)
    toc = next(
        (
            element
            for element in root.iter()
            if _local_name(element.tag) == "nav"
            and "toc" in element.attrib.get(
                "{http://www.idpf.org/2007/ops}type",
                "",
            ).split()
        ),
        None,
    )
    if toc is None:
        return None

    entries = []
    for link in toc.iter():
        if _local_name(link.tag) != "a":
            continue
        href = link.attrib.get("href", "").strip()
        title = _normalize_text(" ".join(link.itertext()))
        if not href or not title:
            return None
        entries.append(_NavigationEntry(href=href, title=title))
    return entries or None


def _ncx_navigation_entries(content: bytes) -> list[_NavigationEntry] | None:
    root = ET.fromstring(content)
    if _local_name(root.tag) != "ncx":
        return None
    entries = []
    for nav_point in root.iter():
        if _local_name(nav_point.tag) != "navPoint":
            continue
        content_element = next(
            (
                child
                for child in nav_point
                if _local_name(child.tag) == "content"
            ),
            None,
        )
        label = next(
            (
                child
                for child in nav_point
                if _local_name(child.tag) == "navLabel"
            ),
            None,
        )
        href = content_element.attrib.get("src", "").strip() if content_element is not None else ""
        title = _normalize_text(" ".join(label.itertext())) if label is not None else ""
        if not href or not title:
            return None
        entries.append(_NavigationEntry(href=href, title=title))
    return entries or None


def _chapters_from_navigation(
    spine_documents: list[_SpineDocument],
    candidate: _NavigationCandidate,
) -> tuple[list[ParsedChapter] | None, str]:
    documents_by_path: dict[str, list[int]] = {}
    for index, document in enumerate(spine_documents):
        document_path = posixpath.normpath(
            posixpath.join(candidate.package_directory, document.path)
        )
        documents_by_path.setdefault(document_path, []).append(index)

    targets: list[tuple[int, int, str, bool]] = []
    for entry in candidate.entries:
        reference = _resolve_epub_reference(candidate.path, entry.href)
        if reference is None:
            return None, "unresolvable_target"
        path, fragment = reference
        matching_documents = documents_by_path.get(path, [])
        if len(matching_documents) != 1:
            return None, "unresolvable_target"
        document_index = matching_documents[0]
        document = spine_documents[document_index]
        if fragment:
            positions = document.anchors.get(fragment)
            if not positions:
                return None, "unresolvable_fragment"
            if len(positions) != 1:
                return None, "ambiguous_fragment"
            paragraph_index = positions[0]
        else:
            paragraph_index = 0
        if paragraph_index >= len(document.paragraphs):
            return None, "empty_target_section"
        if targets and (document_index, paragraph_index) < targets[-1][:2]:
            return None, "navigation_out_of_order"
        targets.append((document_index, paragraph_index, entry.title, bool(fragment)))

    targets_by_document: dict[int, list[tuple[int, str, bool]]] = {}
    for document_index, paragraph_index, title, has_fragment in targets:
        document_targets = targets_by_document.setdefault(document_index, [])
        if document_targets and document_targets[-1][0] == paragraph_index:
            previous_index, _previous_title, previous_has_fragment = document_targets[-1]
            if has_fragment and not previous_has_fragment:
                document_targets[-1] = (previous_index, title, has_fragment)
            continue
        document_targets.append((paragraph_index, title, has_fragment))

    chapters: list[ParsedChapter] = []
    next_position = 0
    for document_index, document in enumerate(spine_documents):
        document_targets = targets_by_document.get(document_index)
        sections: list[tuple[int, int, str]] = []
        if not document_targets:
            sections.append((0, len(document.paragraphs), document.title))
        else:
            if document_targets[0][0] > 0:
                sections.append((0, document_targets[0][0], document.title))
            for index, (start, title, _has_fragment) in enumerate(document_targets):
                end = (
                    document_targets[index + 1][0]
                    if index + 1 < len(document_targets)
                    else len(document.paragraphs)
                )
                if end > start:
                    sections.append((start, end, title))

        for start, end, title in sections:
            paragraphs = document.paragraphs[start:end]
            if not paragraphs:
                continue
            chapter_end = next_position + len(paragraphs) - 1
            chapters.append(
                ParsedChapter(
                    index=len(chapters),
                    title=_bounded_metadata(title, 500),
                    start_position=next_position,
                    end_position=chapter_end,
                    paragraphs=paragraphs,
                )
            )
            next_position = chapter_end + 1
    return (chapters, "") if chapters else (None, "navigation_has_no_sections")


def _chapters_from_spine(spine_documents: list[_SpineDocument]) -> list[ParsedChapter]:
    chapters = []
    next_position = 0
    for document in spine_documents:
        chapter_end = next_position + len(document.paragraphs) - 1
        chapters.append(
            ParsedChapter(
                index=len(chapters),
                title=document.title,
                start_position=next_position,
                end_position=chapter_end,
                paragraphs=document.paragraphs,
            )
        )
        next_position = chapter_end + 1
    return chapters


def _resolve_epub_reference(base_path: str, href: str) -> tuple[str, str] | None:
    try:
        reference = urlsplit(href.strip())
    except ValueError:
        return None
    if reference.scheme or reference.netloc or reference.path.startswith("/"):
        return None
    relative_path = unquote(reference.path)
    target_path = (
        posixpath.normpath(posixpath.join(posixpath.dirname(base_path), relative_path))
        if relative_path
        else base_path
    )
    if target_path in {"", ".", ".."} or target_path.startswith("../"):
        return None
    return target_path, unquote(reference.fragment)


def _normalize_archive_path(path: str) -> str | None:
    if not path or path.startswith("/"):
        return None
    normalized = posixpath.normpath(unquote(path))
    if normalized in {"", ".", ".."} or normalized.startswith("../"):
        return None
    return normalized


def _local_name(tag: str) -> str:
    return tag.rsplit("}", 1)[-1]


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


def _extract_paragraphs_and_anchors(
    body: Tag | BeautifulSoup,
) -> tuple[list[str], dict[str, list[int]]]:
    paragraphs: list[str] = []
    fragments: list[str] = []
    anchors: dict[str, list[int]] = {}

    def flush() -> None:
        text = _normalize_text(" ".join(fragments))
        if text:
            paragraphs.append(text)
        fragments.clear()

    def record_anchors(element: Tag, paragraph_index: int | None = None) -> None:
        index = len(paragraphs) if paragraph_index is None else paragraph_index
        names = [element.get("id")]
        if element.name == "a":
            names.append(element.get("name"))
        for name in names:
            if isinstance(name, str) and name:
                anchors.setdefault(name, []).append(index)

    def visit(element: Tag | NavigableString) -> None:
        if isinstance(element, Comment):
            return
        if isinstance(element, NavigableString):
            if element.strip():
                fragments.append(str(element).strip())
            return
        if element.name in {"script", "style"}:
            return
        if element.name == "br":
            flush()
            record_anchors(element)
            return
        if element.name in _BLOCK_TAGS:
            flush()
            paragraph_index = len(paragraphs)
            record_anchors(element)
            for descendant in element.find_all(True):
                record_anchors(descendant, paragraph_index)
            text = _normalize_text(element.get_text(" ", strip=True))
            if text:
                paragraphs.append(text)
            return
        if element.name == "div":
            flush()
        record_anchors(element)
        for child in element.children:
            if isinstance(child, (Tag, NavigableString)):
                visit(child)
        if element.name == "div":
            flush()

    visit(body)
    flush()
    return paragraphs, anchors


def _normalize_text(text: str) -> str:
    return _WHITESPACE.sub(" ", text).strip()


def _chapter_title(body: BeautifulSoup, fallback: str) -> str:
    heading = body.find(["h1", "h2", "h3", "title"])
    if heading is not None:
        text = _normalize_text(heading.get_text(" ", strip=True))
        if text:
            return text
    return fallback.rsplit("/", 1)[-1].rsplit(".", 1)[0]
