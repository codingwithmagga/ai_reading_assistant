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
  known-entity context required for that operation. All Responses API requests
  set `store=False`; provider-side processing and retention remain subject to
  the provider's current terms.

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
  It uses EPUB 3 navigation or EPUB 2 NCX targets for chapter titles and
  boundaries only when they resolve unambiguously to the spine and document
  anchors; otherwise it records a safe fallback to one chapter per readable
  spine document. All spine text and its order are retained, and parsing does
  not call the AI service.
- `app/extraction_jobs.py`, `app/openai_extractor.py`,
  `app/extraction_schemas.py`, and `app/extraction_prompt.py` implement
  extraction orchestration, model interaction, validation, and prompts.
- `app/lookup.py` contains position-aware database queries; `app/models.py`,
  `app/schemas.py`, `app/database.py`, and Alembic migrations define persistence
  and API data structures.

The backend currently uses focused modules rather than a strict
controller/service/repository hierarchy. Keep new code aligned with those
existing boundaries; extract a layer only when it solves a concrete problem.
The upload retry option atomically claims only empty failed-parsing records;
it never re-parses books with existing text, progress, or extraction data.
Text separated by HTML line breaks is also parsed in reading order.
Navigation-derived chapter boundaries apply to newly parsed books. Re-uploading
an identical EPUB reuses its stored book rather than changing existing reading
positions or extraction checkpoints. Backups still require an exact chapter
and paragraph layout match, so restoring across parser versions with different
navigation boundaries is rejected instead of silently remapping saved data.

## Frontend responsibilities

- `src/App.tsx` handles the library, upload, language selection, and view
  selection.
- `src/LibraryView.tsx` renders the library state and book actions.
- `src/UploadSection.tsx` owns EPUB upload state and retry parsing.
- `src/BackupSection.tsx` owns backup download and restore state.
- `src/ExtractionControls.tsx` handles extraction range selection, start/resume
  actions, job status, polling, and safe extraction error display.
- `src/Reader.tsx` handles chapter display, saved/manual reading positions,
  lookup, characters, and recap.
- `src/useManualPosition.ts` owns chapter/percentage position selection and
  position-bounded notes export.
- `src/useReadingProgress.ts` owns intersection tracking, save debouncing,
  queued progress persistence, and restore scrolling.
- `src/useReaderNotes.ts` owns lookup, entity-list, and recap requests for the
  active reading position.
- The reader offers a chapter-overview view. Its backend response is position
  filtered and grouped by chapter; the frontend switches to the source passage
  before jumping to an overview fact.
- `src/apiTypes.ts` holds frontend API data types.
- `src/api/apiRequest.ts`, `src/api/apiValidation.ts`, and the domain modules
  under `src/api/` own HTTP transport, runtime validation, and grouped backend
  requests. `src/api.ts` remains the compatibility barrel.
- `src/api.ts` defines typed backend requests and responses.
- `src/notesExport.ts` formats validated export data as JSON or Markdown and
  triggers local downloads.
- The library provides backup download and confirmed restore, distinct from
  the reader's spoiler-filtered notes export.
- `src/i18n.ts` contains UI translations and localized error helpers.

Keep HTTP details in the API client where practical, and present book text as
text rather than executable HTML.

Parsed books can start extraction through the library. Job progress is polled
while pending or running; jobs use inclusive chapter start and end bounds and
can resume or extend from their saved chapter-block checkpoints. Changing the
start or narrowing the end starts a new job without deleting prior notes or
checkpoints; earlier known entities remain available as extraction context.
The reader retains all parsed sections. Extraction errors are shown using safe,
localized categories; backend logs record job IDs, exception types, and stack
locations without exception messages, model output, or book text.

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
model is not authoritative for positions. Before persistence, extraction
validates entity and alias availability against the supplied paragraph order
and retries invalid responses with reference-specific feedback. Persistence
independently enforces the position boundary.

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

## Extraction crash recovery

Extraction jobs use a lease for exclusive worker ownership and one atomic
checkpoint per text block. The lease is renewed before and after model calls and
is long enough for the configured timeout and retry budget; it must not be
shortened to hide long-running requests. An expired or missing lease is stale
and may be requeued. A live lease blocks a second worker.

The application checks pending and stale extraction jobs during startup and
requeues them for automatic resume. Processing still claims jobs atomically,
each block is persisted together with its checkpoint, and a worker that loses
its lease cannot complete or persist a later block. The API exposes
`lease_expires_at` so clients can distinguish a live running job from an
interrupted job whose lease has expired and offer a resume action.
