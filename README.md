# Spoilerfreier Lesebegleiter

Eine lokale Web-App als Lesebegleiter für DRM-freie EPUBs. Sie erstellt
KI-gestützte Notizen zu Figuren, Orten, Gruppen, Objekten und Begriffen und
zeigt beim Nachschlagen ausschließlich Wissen bis zur aktuellen Leseposition.
Die Spoilerfreiheit wird durch positionsgebundene Daten und serverseitige
Filterung gewährleistet.

## Projektstand

Das Repository ist ein Monorepo mit Python-Backend und React-Frontend. Die
vollständige Produktbeschreibung, Architektur, Datenmodelle, API, Risiken und
Phasen-Abnahmekriterien stehen in [docs/PROJECT_SPEC.md](docs/PROJECT_SPEC.md).
Arbeitsregeln für KI-gestützte Änderungen sind in
[.github/copilot-instructions.md](.github/copilot-instructions.md) festgehalten.

## Starten mit Docker Compose

Voraussetzung ist Docker mit Docker Compose. Optional kann `.env` aus
`.env.example` angelegt und mit einem OpenAI-API-Key befüllt werden. Die
Extraktion benötigt einen Key und überträgt für die jeweilige Anfrage nur die
an den Extraktor übergebenen Textabsätze sowie den bekannten Entitätskontext
an die OpenAI Responses API, nicht die EPUB-Datei. Modell, Ausgabesprache,
Timeout und Anzahl der Validierungsversuche sind über `.env` konfigurierbar.

```bash
docker compose up --build
```

Die App ist anschließend unter <http://localhost:8080> erreichbar. Die
Backend-Health-Prüfung und OpenAPI-Dokumentation laufen über
<http://localhost:8080/api/health> und <http://localhost:8080/api/docs>.
Mit `APP_PORT` in `.env` lässt sich der lokale Port ändern. Buchdaten liegen
im persistenten Docker-Volume `reading-data`. Datenbankmigrationen werden
beim Start des Backend-Containers automatisch angewendet. Für eine lokale
Backend-Installation: `cd backend && alembic upgrade head`.

**Serverbetrieb:** Die aktuelle App hat noch keine Anmeldung. Der veröffentlichte
Compose-Port ist daher nicht für eine direkte Freigabe ins Internet geeignet.
Für den persönlichen Serverzugriff zuerst VPN und Host-Firewall verwenden;
öffentlichen Zugriff erst mit TLS und einer vorgeschalteten Anmeldung einrichten.

Die EPUB-Grenzwerte lassen sich in `.env` konfigurieren:

| Variable | Standard | Zulässiger Bereich |
|---|---:|---:|
| `EPUB_MAX_UPLOAD_MB` | 50 MB | 1–500 MB |
| `EPUB_MAX_UNCOMPRESSED_MB` | 250 MB | 1–2000 MB |
| `EPUB_MAX_ARCHIVE_ENTRIES` | 5000 | 1–50000 Einträge |
| `EXTRACTION_MAX_PARAGRAPHS_PER_BLOCK` | 25 | 1–200 Absätze |
| `EXTRACTION_MAX_BLOCK_CHARACTERS` | 20000 | 500–100000 Zeichen |
| `UPLOAD_TEMP_DIR` | `/tmp/reading-assistant-uploads` | beschreibbares temporäres Verzeichnis |

Das Uploadlimit wird gemeinsam für Backend und Nginx-Proxy verwendet. Uploads
werden durch Starlette begrenzt im Speicher gehalten und bei Bedarf im
konfigurierten temporären Verzeichnis zwischengespeichert; die Quelldatei wird
nach Abschluss des Requests verworfen und nicht dauerhaft abgelegt. Der Parser
akzeptiert EPUB-Dateien mit lesbarem OPF und Spine, lehnt beschädigte Archive
und DRM-Verschlüsselung ab. Ein konfigurierbarer Parser-Timeout ist noch nicht
implementiert.

DRM-freie EPUBs lassen sich über `POST /api/books` hochladen, zum Beispiel:

```bash
curl -F "file=@/pfad/zum/buch.epub" http://localhost:8080/api/books
```

Identische Uploads werden anhand des SHA-256-Hashes wiedererkannt und liefern
den bestehenden Bucheintrag zurück. Die EPUB-Quelldatei wird nach dem Parsing
nicht dauerhaft gespeichert; gespeichert werden Metadaten und extrahierter
Text. Die API enthält außerdem `GET /api/books`, `GET /api/books/{id}`,
`GET /api/books/{id}/chapters` und
`GET /api/books/{id}/content/{chapter_id}`. Eine Extraktion startet mit
`POST /api/books/{id}/extraction-jobs` (HTTP 202); Status, sichere Fehlermeldung
und Tokenzähler liefert `GET /api/books/{id}/jobs`. Ein bereits aktiver Job
führt zu HTTP 409. OpenAPI-Schemas und interaktive Dokumentation sind unter
<http://localhost:8080/api/docs> verfügbar.

Die Abfrage-Endpunkte erzwingen die Leseposition serverseitig. Zum Beispiel
liefert der Recap nur belegte Ereignis-Fakten bis einschließlich Position 42
und die bis dahin aufgetretenen Figuren:

```bash
curl "http://localhost:8080/api/books/BOOK_ID/recap?position=42"
curl "http://localhost:8080/api/books/BOOK_ID/entities?position=42&type=person"
curl "http://localhost:8080/api/books/BOOK_ID/lookup?q=Marta&position=42"
```

Das Recap ist eine deterministische, chronologische Ereignisliste aus den
bereits extrahierten `event`-Fakten. Es verwendet kein Modell und überträgt
keinen zusätzlichen Buchtext.

Die Leseposition ist inklusiv und muss innerhalb der gespeicherten
Absatzpositionen des Buchs liegen. `entities` unterstützt die Typen `person`,
`place`, `group`, `object` und `concept`; Entitäten und Aliase werden
deterministisch sortiert und erst ab ihrer jeweiligen Einführungsposition
angezeigt. Der Lookup verwendet normalisierte exakte Namen und Aliase (keine
Teilstringsuche) und gibt Fakten samt Typ, Position, Kapitelreferenz und
Quellauszug zurück. Beziehungen erscheinen nur, wenn Beziehung und beide
Entitäten bis zur Position bekannt sind.

Unbekannte Bücher liefern HTTP 404 (`book_not_found`); ungültige oder für ein
leeres Buch nicht prüfbare Lesepositionen liefern HTTP 422
(`invalid_reading_position`). Ein leerer Lookup-Begriff liefert HTTP 422
(`empty_lookup_query`). Fehlende oder ungültige Query-Parameter nutzen
FastAPIs Standard-422-Validierung; nicht gefundene Entitäten und Bücher ohne
Extraktion liefern erfolgreiche Antworten mit leeren Listen. Die
Antwortschemas sind in der automatisch erzeugten OpenAPI-Dokumentation unter
`/api/docs` beschrieben.

Container im Hintergrund starten und stoppen:

```bash
docker compose up --build -d
docker compose down
```

## Qualitätsprüfungen

### Backend

```bash
cd backend
python -m pytest
python -m ruff check .
```

### Frontend

```bash
cd frontend
npm test
npm run lint
npm run build
```

### Docker Compose

```bash
docker compose up --build -d
curl http://localhost:8080/api/health
docker compose down
```

## Konfiguration und Datenschutz

Lege lokale Einstellungen in `.env` an; `.env` wird nicht versioniert.
`.env.example` enthält ausschließlich nicht geheime Beispielwerte. Bücher
und daraus extrahierte Inhalte sind für private Nutzung mit einer eigenen
Kopie vorgesehen und sollen nicht öffentlich bereitgestellt werden. Der
selbst gehostete MVP hat keine Benutzeranmeldung; siehe die Anforderungen zum
Zugriff im [Projektkonzept](./docs/PROJECT_SPEC.md). Für die
KI-Extraktion werden jeweils nur die an den Extraktor übergebenen Textabsätze
und der dazu übergebene Entitätskontext an OpenAI gesendet; die EPUB-Datei
selbst wird nicht übertragen. Ohne `OPENAI_API_KEY` kann die Anwendung
starten, Extraktionsanfragen schlagen jedoch mit einem Konfigurationsfehler
fehl.
