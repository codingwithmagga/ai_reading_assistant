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
`.env.example` angelegt und mit einem Anthropic-API-Key befüllt werden.

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

Die EPUB-Grenzwerte lassen sich in `.env` konfigurieren:

| Variable | Standard | Zulässiger Bereich |
|---|---:|---:|
| `EPUB_MAX_UPLOAD_MB` | 50 MB | 1–500 MB |
| `EPUB_MAX_UNCOMPRESSED_MB` | 250 MB | 1–2000 MB |
| `EPUB_MAX_ARCHIVE_ENTRIES` | 5000 | 1–50000 Einträge |
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
`GET /api/books/{id}/content/{chapter_id}`. OpenAPI-Schemas und interaktive
Dokumentation sind unter <http://localhost:8080/api/docs> verfügbar.

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
Kopie vorgesehen und sollen nicht öffentlich bereitgestellt werden.
