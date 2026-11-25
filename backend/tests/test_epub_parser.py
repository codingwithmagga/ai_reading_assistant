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


def rewrite_epub(content: bytes, replacements: dict[str, bytes]) -> bytes:
    output = BytesIO()
    with ZipFile(BytesIO(content)) as source, ZipFile(
        output,
        mode="w",
        compression=ZIP_DEFLATED,
    ) as target:
        for item in source.infolist():
            target.writestr(
                item.filename,
                replacements.get(item.filename, source.read(item.filename)),
            )
    return output.getvalue()


def build_navigation_epub(
    *,
    navigation: bytes | None = None,
    ncx: bytes | None = None,
) -> bytes:
    chapter = b"""<?xml version="1.0" encoding="utf-8"?>
    <html xmlns="http://www.w3.org/1999/xhtml">
      <body>
        <h1>Dokumenttitel</h1>
        <p>Auftakt.</p>
        <h2><span id="first">Erster Abschnitt</span></h2>
        <p>Text eins.</p>
        <h2 id="second">Zweiter Abschnitt</h2>
        <p>Text zwei.</p>
      </body>
    </html>"""
    replacements = {"EPUB/Text/zwei.xhtml": chapter}
    if navigation is not None:
        replacements["EPUB/nav.xhtml"] = navigation
    if ncx is not None:
        replacements["EPUB/toc.ncx"] = ncx
    return rewrite_epub(build_epub(), replacements)


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


def test_parser_extracts_only_bounded_inline_formatting() -> None:
    parsed = parse_epub(build_epub())
    chapter = parsed.chapters[0]

    assert chapter.rich_text is not None
    assert chapter.rich_text[0] is None
    assert chapter.rich_text[1] is None
    assert chapter.rich_text[2] == [
        {"text": "Ein Satz "},
        {"text": "mit Formatierung.", "italic": True},
    ]


def test_parser_uses_nested_epub_navigation_and_splits_spine_documents() -> None:
    navigation = b"""<?xml version="1.0" encoding="utf-8"?>
    <html xmlns="http://www.w3.org/1999/xhtml"
          xmlns:epub="http://www.idpf.org/2007/ops">
      <body><nav epub:type="toc"><ol>
        <li><a href="Text/zwei.xhtml">Erster Teil</a><ol>
          <li><a href="Text/zwei.xhtml#first">Abschnitt Eins</a></li>
          <li><a href="Text/zwei.xhtml#second">Abschnitt Zwei</a></li>
        </ol></li>
        <li><a href="Text/eins.xhtml">Schluss</a></li>
      </ol></nav></body>
    </html>"""

    parsed = parse_epub(build_navigation_epub(navigation=navigation))

    assert [
        (chapter.title, chapter.start_position, chapter.end_position)
        for chapter in parsed.chapters
    ] == [
        ("Erster Teil", 0, 1),
        ("Abschnitt Eins", 2, 3),
        ("Abschnitt Zwei", 4, 5),
        ("Schluss", 6, 7),
    ]
    assert [paragraph for chapter in parsed.chapters for paragraph in chapter.paragraphs] == [
        "Dokumenttitel",
        "Auftakt.",
        "Erster Abschnitt",
        "Text eins.",
        "Zweiter Abschnitt",
        "Text zwei.",
        "Erstes Kapitel",
        "Verschachtelter Absatz.",
    ]


def test_parser_reads_epub2_ncx_when_epub3_navigation_is_unavailable() -> None:
    ncx = b"""<?xml version="1.0" encoding="utf-8"?>
    <ncx xmlns="http://www.daisy.org/z3986/2005/ncx/">
      <navMap>
        <navPoint><navLabel><text>Teil Eins</text></navLabel>
          <content src="Text/zwei.xhtml"/>
          <navPoint><navLabel><text>Kapitel Eins</text></navLabel>
            <content src="Text/zwei.xhtml#first"/>
          </navPoint>
        </navPoint>
      </navMap>
    </ncx>"""
    with ZipFile(BytesIO(build_epub())) as archive:
        package = archive.read("EPUB/content.opf").replace(b' properties="nav"', b"")
    content = build_navigation_epub(ncx=ncx)
    content = rewrite_epub(content, {"EPUB/content.opf": package})

    parsed = parse_epub(content)

    assert [
        (chapter.title, chapter.start_position, chapter.end_position)
        for chapter in parsed.chapters
    ] == [
        ("Teil Eins", 0, 1),
        ("Kapitel Eins", 2, 5),
        ("Erstes Kapitel", 6, 7),
    ]


def test_parser_falls_back_to_spine_when_navigation_target_is_unresolvable(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    navigation = b"""<?xml version="1.0" encoding="utf-8"?>
    <html xmlns="http://www.w3.org/1999/xhtml"
          xmlns:epub="http://www.idpf.org/2007/ops">
      <body><nav epub:type="toc"><ol>
        <li><a href="Text/zwei.xhtml#missing">Nicht aufloesbar</a></li>
      </ol></nav></body>
    </html>"""

    messages = []
    monkeypatch.setattr(
        "app.epub_parser.logger.info",
        lambda message, *args: messages.append(message % args),
    )
    parsed = parse_epub(build_navigation_epub(navigation=navigation))

    assert [chapter.title for chapter in parsed.chapters] == [
        "Dokumenttitel",
        "Erstes Kapitel",
    ]
    assert any("unresolvable_fragment" in message for message in messages)


def test_parser_falls_back_to_spine_when_navigation_fragment_is_ambiguous(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    navigation = b"""<html xmlns:epub="http://www.idpf.org/2007/ops">
      <body><nav epub:type="toc"><ol>
        <li><a href="Text/zwei.xhtml#first">Abschnitt</a></li>
      </ol></nav></body>
    </html>"""
    content = build_navigation_epub(navigation=navigation)
    with ZipFile(BytesIO(content)) as archive:
        chapter = archive.read("EPUB/Text/zwei.xhtml").replace(
            b'id="second"',
            b'id="first"',
        )
    content = rewrite_epub(content, {"EPUB/Text/zwei.xhtml": chapter})

    messages = []
    monkeypatch.setattr(
        "app.epub_parser.logger.info",
        lambda message, *args: messages.append(message % args),
    )
    parsed = parse_epub(content)

    assert [chapter.title for chapter in parsed.chapters] == [
        "Dokumenttitel",
        "Erstes Kapitel",
    ]
    assert any("ambiguous_fragment" in message for message in messages)


def test_parser_falls_back_to_spine_when_ncx_is_malformed() -> None:
    with ZipFile(BytesIO(build_epub())) as archive:
        package = archive.read("EPUB/content.opf").replace(b' properties="nav"', b"")
    content = build_navigation_epub(ncx=b"<ncx")
    content = rewrite_epub(content, {"EPUB/content.opf": package})

    parsed = parse_epub(content)

    assert [chapter.title for chapter in parsed.chapters] == [
        "Dokumenttitel",
        "Erstes Kapitel",
    ]


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
