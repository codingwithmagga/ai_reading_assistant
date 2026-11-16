from io import BytesIO
from zipfile import ZIP_DEFLATED, ZipFile

import pytest
from ebooklib import epub

from app.epub_parser import EpubParsingError, parse_epub


def build_epub() -> bytes:
    book = epub.EpubBook()
    book.set_identifier("synthetic-test-book")
    book.set_title("  Test   Buch ")
    book.set_language("de")
    book.add_author("Ada Beispiel")

    chapter_two = epub.EpubHtml(
        uid="chapter-two",
        file_name="Text/zwei.xhtml",
        title="Zweites Kapitel",
        content=(
            "<html><body><h1>Zweites Kapitel</h1>"
            "<p>Ein &amp; zwei.</p><p><span>Ein Satz</span> <em>mit Formatierung.</em></p>"
            "</body></html>"
        ),
    )
    empty_chapter = epub.EpubHtml(
        uid="empty-chapter",
        file_name="Text/leer.xhtml",
        title="Leeres Kapitel",
        content="<html><body><p> &nbsp; </p></body></html>",
    )
    chapter_one = epub.EpubHtml(
        uid="chapter-one",
        file_name="Text/eins.xhtml",
        title="Erstes Kapitel",
        content=(
            "<html><body><h1>Erstes Kapitel</h1>"
            "<div><p>Verschachtelter Absatz.</p></div>"
            "</body></html>"
        ),
    )
    for chapter in (chapter_one, empty_chapter, chapter_two):
        book.add_item(chapter)
    book.spine = ["chapter-two", "empty-chapter", "chapter-one"]
    book.add_item(epub.EpubNcx())
    book.add_item(epub.EpubNav())

    output = BytesIO()
    epub.write_epub(output, book)
    return output.getvalue()


def add_encryption_metadata(content: bytes) -> bytes:
    output = BytesIO()
    with ZipFile(BytesIO(content)) as source, ZipFile(
        output,
        mode="w",
        compression=ZIP_DEFLATED,
    ) as target:
        for item in source.infolist():
            target.writestr(item.filename, source.read(item.filename))
        target.writestr(
            "META-INF/encryption.xml",
            b"""<encryption xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
              <EncryptedData><EncryptionMethod Algorithm="urn:example:drm"/></EncryptedData>
            </encryption>""",
        )
    return output.getvalue()


def test_parser_follows_spine_and_assigns_contiguous_positions() -> None:
    parsed = parse_epub(build_epub())

    assert parsed.title == "Test Buch"
    assert parsed.author == "Ada Beispiel"
    assert parsed.language == "de"
    assert [chapter.title for chapter in parsed.chapters] == [
        "Zweites Kapitel",
        "Erstes Kapitel",
    ]
    assert [chapter.index for chapter in parsed.chapters] == [0, 1]
    assert [(chapter.start_position, chapter.end_position) for chapter in parsed.chapters] == [
        (0, 2),
        (3, 4),
    ]
    paragraphs = [
        (chapter.index, text)
        for chapter in parsed.chapters
        for text in chapter.paragraphs
    ]
    assert paragraphs == [
        (0, "Zweites Kapitel"),
        (0, "Ein & zwei."),
        (0, "Ein Satz mit Formatierung."),
        (1, "Erstes Kapitel"),
        (1, "Verschachtelter Absatz."),
    ]
    assert parsed.paragraph_count == 5


def test_parser_extracts_direct_text_and_breaks_in_reading_order() -> None:
    book = epub.EpubBook()
    book.set_identifier("line-break-book")
    book.set_title("Test")
    book.set_language("de")
    chapter = epub.EpubHtml(
        uid="chapter",
        file_name="chapter.xhtml",
        content=(
            "<html><body><h1>Überschrift</h1>"
            "Erster <i>formatierter</i> Satz.<br/><br/>"
            "Zweiter Satz.<br/>Dritter Satz."
            "<div>Vierter Satz.<br/>Fünfter Satz.</div>"
            "<p>Ein normaler Absatz.</p></body></html>"
        ),
    )
    book.add_item(chapter)
    book.spine = ["chapter"]
    book.add_item(epub.EpubNcx())
    book.add_item(epub.EpubNav())
    output = BytesIO()
    epub.write_epub(output, book)

    parsed = parse_epub(output.getvalue())

    assert parsed.chapters[0].paragraphs == (
        "Überschrift",
        "Erster formatierter Satz.",
        "Zweiter Satz.",
        "Dritter Satz.",
        "Vierter Satz.",
        "Fünfter Satz.",
        "Ein normaler Absatz.",
    )
    assert (parsed.chapters[0].start_position, parsed.chapters[0].end_position) == (0, 6)


def test_parser_rejects_non_epub_and_empty_input() -> None:
    with pytest.raises(EpubParsingError, match="leer"):
        parse_epub(b"")

    with pytest.raises(EpubParsingError, match="kein gültiges, lesbares EPUB"):
        parse_epub(b"not a zip file")


def test_parser_enforces_upload_and_expanded_size_limits() -> None:
    content = build_epub()
    with pytest.raises(EpubParsingError, match="Upload-Größe"):
        parse_epub(content, max_upload_bytes=10)

    with pytest.raises(EpubParsingError, match="entpackte"):
        parse_epub(content, max_uncompressed_bytes=10)

    with pytest.raises(EpubParsingError, match="Archiveinträge"):
        parse_epub(content, max_archive_entries=1)


def test_parser_rejects_drm_encrypted_content() -> None:
    with pytest.raises(EpubParsingError, match="DRM-geschützt"):
        parse_epub(add_encryption_metadata(build_epub()))
