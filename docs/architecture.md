# Architecture Overview

The [project specification](./PROJECT_SPEC.md) is the authoritative reference
for product scope, the data model, API behavior, and spoiler-safety
requirements. This document summarizes the current implementation boundaries
to help contributors navigate the code.

## System components

- **Backend:** Python 3.12+, FastAPI, Pydantic, SQLAlchemy, and SQLite. Alembic
  manages schema migrations.
- **Frontend:** React and TypeScript, built with Vite. `App.tsx` owns the
  library, upload, language, and theme preferences; `Reader.tsx` owns reading
  and notes workflows.
- **PWA shell:** Vite PWA builds and registers a service worker that precaches
  only static frontend assets and falls back to the app shell for offline
  navigation. API requests and book data are not cached.
- **Persistence:** Books, chapters, paragraphs, extracted entities and facts,
  jobs, and reading progress are stored in SQLite.
- **External AI:** The OpenAI client is used for extraction only. The source
  EPUB is parsed locally; extraction sends only the approved text block and
  known-entity context required for that operation.

## Backend responsibilities

- `app/main.py` creates the FastAPI application and mounts the book and query
  routers.
- `app/books.py` provides book, chapter, upload, job, and reading-progress
  endpoints.
- `app/book_queries.py` provides entity, lookup, recap, and position-bounded
  notes-export endpoints.
- `app/backup.py` provides the explicitly unfiltered, private full-library
  backup and atomic restore, validating book hashes, layouts, and references;
  its schemas are in `app/backup_schemas.py`.
- `app/epub_parser.py` parses EPUB input into ordered chapters and paragraphs.
- `app/extraction_jobs.py`, `app/openai_extractor.py`,
  `app/extraction_schemas.py`, and `app/extraction_prompt.py` implement
  extraction orchestration, model interaction, validation, and prompts.
- `app/lookup.py` contains position-aware database queries; `app/models.py`,
  `app/schemas.py`, `app/database.py`, and Alembic migrations define persistence
  and API data structures.

The backend currently uses focused modules rather than a strict
controller/service/repository hierarchy. Keep new code aligned with those
existing boundaries; extract a layer only when it solves a concrete problem.

## Frontend responsibilities

- `src/App.tsx` handles the library, upload, language selection, and view
  selection, including extraction start/resume controls and job progress.
- `src/Reader.tsx` handles chapter display, saved/manual reading positions,
  lookup, characters, and recap.
- `src/api.ts` defines typed backend requests and responses.
- `src/notesExport.ts` formats validated export data as JSON or Markdown and
  triggers local downloads.
- The library provides backup download and confirmed restore, distinct from
  the reader's spoiler-filtered notes export.
- `src/i18n.ts` contains UI translations and localized error helpers.

Keep HTTP details in the API client where practical, and present book text as
text rather than executable HTML.

Parsed books can start extraction through the library. Job progress is polled
while pending or running; chapter-bounded jobs can resume or extend from their
saved chapter-block checkpoints.

## Position and spoiler boundary

Paragraph positions are the single authoritative reading coordinate. They are
monotonically increasing within a book, and the query position is inclusive:
only information with introduction/fact position less than or equal to the
requested position can be returned. Aliases and relationships have their own
position constraints; both entities in a relationship must also be known.

The backend validates the requested position and filters data in database
queries before producing a response. The frontend must send the active
position with each query and must not compensate for an unfiltered backend
response by hiding later information.

Extraction proceeds through chapters in reading order. Model output is
validated, and the server maps paragraph references to stored positions; the
model is not authoritative for positions.

## API changes

Keep API request and response schemas explicit. Validate incoming requests and
backend responses with Pydantic, and validate parsed backend response payloads
in the frontend at runtime before treating them as typed data. Keep frontend
requests aligned with the API contract. An API change should be implemented
and tested across the backend endpoint/schema, frontend runtime validators and
client, and affected UI behavior. The generated OpenAPI documentation is
available from the running backend at `/api/docs`.

The PWA and other roadmap items are governed by the project specification;
do not assume a planned feature is already implemented.
