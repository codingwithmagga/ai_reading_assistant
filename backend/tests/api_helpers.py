from io import BytesIO
from zipfile import ZIP_DEFLATED, ZipFile

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models import Book, Chapter, Entity, EntityAlias, Fact, Paragraph, Relationship


def build_test_epub(identifier: str = "api-test") -> bytes:
    files = {
        "mimetype": b"application/epub+zip",
        "META-INF/container.xml": b"""<?xml version="1.0"?>
          <container version="1.0"
            xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
            <rootfiles><rootfile
              full-path="OEBPS/content.opf"
              media-type="application/oebps-package+xml"/></rootfiles>
          </container>""",
        "OEBPS/content.opf": b"""<?xml version="1.0"?>
          <package xmlns="http://www.idpf.org/2007/opf" version="2.0"
            unique-identifier="bookid">
            <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
              <dc:identifier id="bookid">api-test</dc:identifier>
              <dc:title>API Testbuch</dc:title>
              <dc:creator>Test Autor</dc:creator>
              <dc:language>de</dc:language>
            </metadata>
            <manifest><item id="chapter" href="chapter.xhtml"
              media-type="application/xhtml+xml"/>
              <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
            </manifest>
            <spine toc="ncx"><itemref idref="chapter"/></spine>
          </package>""",
        "OEBPS/toc.ncx": b"""<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/">
          <head/><docTitle><text>API Testbuch</text></docTitle><navMap/>
          </ncx>""",
        "OEBPS/chapter.xhtml": b"""<html xmlns="http://www.w3.org/1999/xhtml">
          <body><h1>Kapitel Eins</h1><p>Erster Absatz.</p><p>Zweiter Absatz.</p></body>
          </html>""",
    }
    output = BytesIO()
    with ZipFile(output, "w") as archive:
        archive.writestr("mimetype", files.pop("mimetype"), compress_type=0)
        for name, content in files.items():
            content = content.replace(b"api-test", identifier.encode())
            archive.writestr(name, content, compress_type=ZIP_DEFLATED)
    return output.getvalue()


def create_lookup_book(client: TestClient, *, with_extraction: bool = True) -> str:
    with Session(client.app.state.test_engine) as session:
        book = Book(
            title="Synthetischer Roman",
            source_hash="c" * 64 if with_extraction else "d" * 64,
            status="ready",
        )
        chapters = [
            Chapter(
                book=book,
                index=0,
                title="Anfang",
                start_position=0,
                end_position=2,
            ),
            Chapter(
                book=book,
                index=1,
                title="Später",
                start_position=3,
                end_position=5,
            ),
        ]
        for position in range(6):
            chapter = chapters[0] if position <= 2 else chapters[1]
            book.paragraphs.append(
                Paragraph(
                    chapter=chapter,
                    position=position,
                    text=f"Absatz {position}",
                )
            )

        if with_extraction:
            marta = Entity(
                book=book,
                type="person",
                canonical_name="Marta",
                first_position=0,
            )
            village = Entity(
                book=book,
                type="place",
                canonical_name="Dorf",
                first_position=1,
            )
            lea = Entity(
                book=book,
                type="person",
                canonical_name="Lea",
                first_position=2,
            )
            secret = Entity(
                book=book,
                type="concept",
                canonical_name="Geheimnis",
                first_position=4,
            )
            marta.aliases.extend(
                [
                    EntityAlias(alias="die Wirtin", first_position=1),
                    EntityAlias(alias="Frau Keller", first_position=4),
                    EntityAlias(alias="die Fremde", first_position=3),
                ]
            )
            lea.aliases.append(EntityAlias(alias="die Fremde", first_position=3))

            book.facts.extend(
                [
                    Fact(
                        entity=marta,
                        chapter=chapters[0],
                        text="Marta erscheint.",
                        position=0,
                        source_excerpt="Marta trat ein.",
                        kind="event",
                    ),
                    Fact(
                        entity=village,
                        chapter=chapters[0],
                        text="Das Dorf liegt am Fluss.",
                        position=1,
                        source_excerpt="Das Dorf lag am Fluss.",
                        kind="description",
                    ),
                    Fact(
                        entity=marta,
                        chapter=chapters[0],
                        text="Marta führt den Laden.",
                        position=2,
                        source_excerpt="Sie führte den Laden.",
                        kind="description",
                    ),
                    Fact(
                        entity=marta,
                        chapter=chapters[1],
                        text="Marta kennt den geheimen Plan.",
                        position=5,
                        source_excerpt="Sie kannte den geheimen Plan.",
                        kind="event",
                    ),
                ]
            )
            book.relationships.extend(
                [
                    Relationship(
                        entity_a=marta,
                        entity_b=village,
                        label="lebt in",
                        position=2,
                    ),
                    Relationship(
                        entity_a=marta,
                        entity_b=secret,
                        label="kennt",
                        position=3,
                    ),
                ]
            )

        session.add(book)
        session.commit()
        return book.id
