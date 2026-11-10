# Spoiler-Free Reading Assistant

A local web app that assists with DRM-free EPUBs. It creates AI-generated notes
about characters, places, groups, objects, and concepts, and shows only
information available up to the reader's current position. Spoiler protection
is enforced through position-aware data and server-side filtering.

## Project status

This monorepo contains a Python backend and a React frontend. The complete
product description, architecture, data model, API, risks, and phase acceptance
criteria are in [docs/PROJECT_SPEC.md](docs/PROJECT_SPEC.md). AI-assisted
development guidelines are in
[.github/copilot-instructions.md](.github/copilot-instructions.md).

## Start with Docker Compose

Docker and Docker Compose are required. Optionally, copy `.env.example` to
`.env` and add an OpenAI API key. Extraction requires a key and sends only the
text paragraphs and known-entity context supplied to the extractor for each
request to the OpenAI Responses API, not the EPUB file. The model, output
language, timeout, and number of validation attempts are configurable in `.env`.
The AI output language defaults to German and can be changed with
`APP_OUTPUT_LANGUAGE` (for example, `APP_OUTPUT_LANGUAGE=en`). The interface
also defaults to German; use its language selector to switch to English. Its
translation map is designed to accommodate additional languages.

The web app provides a library, EPUB upload, and an in-app reader. Reading
progress is stored per book and restored when the book is reopened. The reader
renders extracted paragraph text as text, not as executable HTML.

```bash
docker compose up --build
```

The app is available at <http://localhost:8080>. Backend health and interactive
OpenAPI documentation are at <http://localhost:8080/api/health> and
<http://localhost:8080/api/docs>. Set `APP_PORT` in `.env` to change the local
port. Book data is stored in the persistent Docker volume `reading-data`.
Database migrations run automatically when the backend container starts. For a
local backend installation, run `cd backend && alembic upgrade head`.

**Server deployment:** The current app has no authentication. Do not expose
the published Compose port directly to the internet. Use a VPN and host
firewall for personal server access; public access requires TLS and trusted
authentication in front of the app.

EPUB limits can be configured in `.env`:

| Variable | Default | Allowed range |
|---|---:|---:|
| `EPUB_MAX_UPLOAD_MB` | 50 MB | 1–500 MB |
| `EPUB_MAX_UNCOMPRESSED_MB` | 250 MB | 1–2000 MB |
| `EPUB_MAX_ARCHIVE_ENTRIES` | 5000 | 1–50000 entries |
| `EXTRACTION_MAX_PARAGRAPHS_PER_BLOCK` | 25 | 1–200 paragraphs |
| `EXTRACTION_MAX_BLOCK_CHARACTERS` | 20000 | 500–100000 characters |
| `UPLOAD_TEMP_DIR` | `/tmp/reading-assistant-uploads` | Writable temporary directory |

The upload limit is shared by the backend and Nginx proxy. Starlette keeps
uploads in memory up to its configured threshold and spools them to the
configured temporary directory when needed. The uploaded source file is
discarded after the request and is not stored permanently. The parser accepts
EPUBs with a readable OPF and spine, and rejects damaged archives and DRM
encryption. A configurable parser timeout is not implemented yet.

Upload a DRM-free EPUB through `POST /api/books`:

```bash
curl -F "file=@/path/to/book.epub" http://localhost:8080/api/books
```

Identical uploads are detected by SHA-256 and return the existing book record.
The source EPUB is not stored permanently after parsing; metadata and extracted
text are stored. The API also provides `GET /api/books`, `GET /api/books/{id}`,
`GET /api/books/{id}/chapters`, and
`GET /api/books/{id}/content/{chapter_id}`. Start extraction with
`POST /api/books/{id}/extraction-jobs` (HTTP 202); status, safe error details,
and token counts are available from `GET /api/books/{id}/jobs`. Starting a
second active job returns HTTP 409. OpenAPI schemas and interactive
documentation are available at <http://localhost:8080/api/docs>.

Query endpoints enforce the reading position on the server. For example, the
recap returns supported event facts and characters introduced through position
42:

```bash
curl "http://localhost:8080/api/books/BOOK_ID/recap?position=42"
curl "http://localhost:8080/api/books/BOOK_ID/entities?position=42&type=person"
curl "http://localhost:8080/api/books/BOOK_ID/lookup?q=Marta&position=42"
```

The recap is a deterministic chronological list of already extracted `event`
facts. It does not use a model or transmit additional book text.

Reading positions are inclusive and must fall within the book's stored
paragraph positions. `entities` supports `person`, `place`, `group`, `object`,
and `concept`; entities and aliases are sorted deterministically and shown
only from their respective introduction positions onward. Lookup uses
normalized exact names and aliases (no substring matching) and returns facts
with their kind, position, chapter reference, and source excerpt. A
relationship is returned only when the relationship and both entities are
known by that position.

The reader's current position is available through
`GET /api/books/{id}/progress` and can be updated with
`PUT /api/books/{id}/progress`. The GET response has a nullable
`current_position` until the reader saves its first position. Updates must
refer to an existing paragraph position; invalid values return HTTP 422 with
`invalid_reading_position`.

```bash
curl http://localhost:8080/api/books/BOOK_ID/progress
curl -X PUT http://localhost:8080/api/books/BOOK_ID/progress \
  -H "Content-Type: application/json" \
  -d '{"position":42}'
```

The reader also includes an optional notes panel for spoiler-safe lookup and a
manual position selector when the user is reading the book outside the in-app
reader. The notes panel uses the current reader position by default; if the user
chooses a manual chapter or percentage value, that position is used only for
notes and recap queries, not for the saved in-app progress. Search requests use
normalized exact names or aliases and send the active position with every call.
Selected text from the reader is prefilled into the lookup field and the lookup
uses the selection's paragraph position, never the selected passage text itself.

```bash
curl "http://localhost:8080/api/books/BOOK_ID/entities?position=42&type=person"
curl "http://localhost:8080/api/books/BOOK_ID/lookup?q=Marta&position=42"
curl "http://localhost:8080/api/books/BOOK_ID/recap?position=42"
```

Unknown books return HTTP 404 (`book_not_found`). Invalid positions, including
positions for books with no readable paragraphs, return HTTP 422
(`invalid_reading_position`). An empty lookup query returns HTTP 422
(`empty_lookup_query`). Missing or invalid query parameters use FastAPI's
standard HTTP 422 validation response. No matches and books without extracted
data return successful responses with empty lists. Response schemas are
documented in the automatically generated OpenAPI documentation at `/api/docs`.

Start and stop the containers in the background:

```bash
docker compose up --build -d
docker compose down
```

## Quality checks

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

## Configuration and privacy

Store local settings in `.env`; `.env` is not versioned. `.env.example`
contains only non-secret sample values. Books and extracted content are
intended for private use with a personally owned copy and must not be made
public. The self-hosted MVP has no authentication; see the access requirements
in the [project specification](./docs/PROJECT_SPEC.md). For AI extraction,
only the text paragraphs and entity context supplied to the extractor are sent
to OpenAI; the EPUB file itself is not transmitted. The app can start without
`OPENAI_API_KEY`, but extraction requests fail with a configuration error.
