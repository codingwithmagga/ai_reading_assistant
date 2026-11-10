# Project Specification: Spoiler-Free Reading Assistant

This document is the authoritative reference for product scope, architecture,
and phased implementation.

## 1. Goal

A web app, also usable on a phone as a PWA, where users upload an EPUB. The app
generates notes from the book about characters, places, groups, and concepts.
While reading, users can look something up (for example, "Who is Marta?") and
get **only information up to their current reading position**. Spoilers are
prevented by the architecture, not merely by prompt instructions.

Typical use case: A character appears midway through a novel, after last
appearing on page 10. The reader quickly looks them up and continues reading.

## 2. Scope

### In scope (MVP)

- Upload DRM-free EPUB files.
- Split books into chapters and paragraphs with fixed positions.
- Use AI to extract entities (characters, places, groups, objects, concepts)
  and facts, each tagged with a position.
- Provide a built-in browser reader that saves the reading position.
- Provide a lookup view strictly filtered by reading position.
- Allow manual position selection (chapter/paragraph or percentage) as an
  alternative to the reader.
- Support a library containing multiple books.
- Provide a PWA usable in the browser and installable on a phone.

### Out of scope (deliberately deferred)

- Live synchronization with external readers (Kindle, Kobo/KOReader sync).
- Access through the Kindle browser.
- Go backend (the backend is Python).
- Native app shells (iOS/Android), multi-user accounts, or paid features.
- Uploading or distributing copyrighted content to third parties (personal use
  only with the user's own copy).

### Access for self-hosted deployments

- The MVP has no user sign-in or API authorization. The Compose port mapping
  is not suitable for unprotected internet access.
- Before running on a server, restrict access to the owner. A private VPN with
  a host firewall is preferred; public HTTPS access requires at least trusted
  reverse-proxy authentication and TLS.
- Any future in-app sign-in must protect API endpoints and book data, not just
  frontend access.

## 3. Technology stack

| Area | Choice |
|---|---|
| Backend | Python 3.12+, FastAPI, Pydantic |
| Database | SQLite (SQLAlchemy 2.x, Alembic migrations); PostgreSQL may be used later |
| EPUB processing | `ebooklib`, `beautifulsoup4` (lxml) |
| AI | OpenAI API through the official Python SDK, structured JSON output |
| Frontend | React + TypeScript, Vite, PWA (`vite-plugin-pwa`) |
| Reader | `epub.js` or `react-reader` |
| Tests | pytest (backend), Vitest (frontend) |
| Configuration | `.env` (API key, model name); no keys in the repository |

Monorepo structure:

```text
/backend   FastAPI app, pipeline, tests
/frontend  React app (Vite)
/docs      Roadmap, decisions, and project specification
```

## 4. Core principle: spoiler protection by architecture

1. **Every text passage has a fixed, monotonically increasing position** (see
   the position model).
2. **Extraction runs chapter by chapter in reading order.** While processing
   chapter N, the model sees only chapters 1..N and the entities known so far,
   never later chapters.
3. **Every fact has the position at which it becomes known in the book**
   (`position`, sourced from a chapter/paragraph in the text).
4. **Queries are hard-filtered in the database:** only facts with
   `position <= current_position` are returned. Summaries are generated at
   query time from these facts or are themselves versioned by position.
5. As an additional safeguard, instruct the model to use only supplied text
   and not rely on prior knowledge of the book (important for well-known
   novels whose endings may be in the model's training data).

## 5. Position model

- Split the book into `chapters` (in EPUB spine order) and `paragraphs`.
- Give each paragraph a global, contiguous `position` (integer, 0..n).
  Chapter boundaries are ranges within these positions.
- Page numbers vary by edition and are not used as primary keys. Instead:
  - Reader supplies chapter + paragraph → position.
  - Manual "percentage through the book" input → position based on character
    or paragraph share.
  - Optional approximate "page X" input → position based on paragraph share
    (must be labeled approximate).
- Save reading progress per book (`reading_progress`).

## 6. Data model (SQLite)

- `books`: id, title, author, language, created_at, status
  (`uploaded|parsing|extracting|ready|error`), source_hash
- `chapters`: id, book_id, index, title, start_position, end_position
- `paragraphs`: id, book_id, chapter_id, position, text
- `entities`: id, book_id, type
  (`person|place|group|object|concept`), canonical_name, first_position
- `entity_aliases`: id, entity_id, alias, first_position (aliases such as
  "the innkeeper" or "Mrs Keller" are valid only from their introduction)
- `facts`: id, book_id, entity_id, text, position, chapter_id, source_excerpt
  (short excerpt for verification, max. approx. 200 characters), kind
  (`description|relationship|event|motivation`)
- `relationships`: id, book_id, entity_a_id, entity_b_id, label, position
- `reading_progress`: id, book_id, position, updated_at
- `jobs`: id, book_id, type, status, progress, error, created_at
  (background processing)

Important indexes: `(book_id, position)` on `facts`, `paragraphs`, and
`relationships`; `(book_id, canonical_name)` on `entities`; full-text search
(FTS5) on aliases and facts.

## 7. Processing pipeline

1. **Upload and parsing:** Unpack EPUB, read spine, clean HTML into text, and
   store chapters and paragraphs with positions. Reject malformed or
   DRM-protected files with a clear message.
2. **Chapter-by-chapter extraction (sequential):**
   - Model input: chapter text (split into ordered blocks if needed) plus a
     compact list of previously known entities and aliases.
   - Validated JSON output (Pydantic schema): new entities, aliases, facts
     (with paragraph reference and short source excerpt), and relationships.
   - Entity resolution: match new names against existing entities and aliases
     (exact, normalized, then model-assisted decision) to avoid duplicates.
   - Calculate fact positions server-side from paragraph references; never
     accept positions invented by the model. Reject invalid references or
     assign them to the chapter position.
3. **Progress and resumption:** Save job status per chapter so interrupted
   runs can resume.
4. **Quality checks:** Schema validation, retry invalid JSON, and track token
   costs per book.

Extraction prompt rules (in summary): use only the supplied text; do not
speculate about later events; avoid value judgments; keep facts concise and
evidence-based. Output language is configurable (default: German).

## 7a. Query API

- `GET /books/{id}/lookup?q=Marta&position=1234`: finds an entity by
  normalized exact name or alias (only aliases with
  `first_position <= position`) and returns matches ordered by
  `first_position`, canonical name, then ID. Matches include aliases
  introduced up to the position, facts with `position <= position` (type,
  position, chapter ID/index/title, and source excerpt), and relationships
  with `position <= position`. A relationship is included only if both
  entities are also known by that position. Facts and relationships are sorted
  deterministically by position and then type/label and ID; fuzzy search is
  not supported.
- `GET /books/{id}/entities?position=1234&type=person`: returns entities with
  `first_position <= position`; optional types are `person`, `place`, `group`,
  `object`, and `concept`. Aliases are also included only up to their
  `first_position`. Ordering: first position, canonical name, ID; aliases:
  first position, name, ID.
- Optional model-generated short summaries are deferred. If added later, the
  model must receive only already filtered facts.
- Also provide "What has happened so far" as a chronological list of supported
  `event` facts up to the position, each with chapter and source excerpt, plus
  a spoiler-filtered list of characters seen so far. The MVP uses no
  additional model and sends no extra book text to OpenAI. Events are ordered
  by position, entity name, and ID; the character list follows entity-list
  ordering.
- Position is inclusive and must fall within the book's stored paragraph
  positions. An out-of-range position or a book with no readable paragraphs
  returns HTTP 422 with `invalid_reading_position`; an unknown book returns
  HTTP 404 with `book_not_found`. An empty lookup query returns HTTP 422 with
  `empty_lookup_query`. No matches or empty extraction return successful
  responses with empty lists. Missing or syntactically invalid query
  parameters return FastAPI's HTTP 422 validation response.

## 8. API overview (FastAPI)

- `POST /books` (EPUB upload) → starts parsing and extraction as a background
  job.
- `GET /books`, `GET /books/{id}`, `DELETE /books/{id}`
- `GET /books/{id}/jobs` (processing progress)
- `GET /books/{id}/chapters`
- `GET /books/{id}/content/{chapter_id}` (chapter metadata and ordered
  paragraphs; clients render book content as text, not executable HTML)
- `GET /books/{id}/progress` (saved position or `null`)
- `PUT /books/{id}/progress` (persist a position belonging to a stored
  paragraph)
- `GET /books/{id}/entities?position=` (filtered list, optional type filter)
- `GET /books/{id}/lookup?q=&position=`
- `GET /books/{id}/recap?position=` (chronological event facts and
  characters seen so far, strictly filtered by position)
- Error details for book/position/search errors contain `code` and `message`;
  parameter errors use FastAPI's validation format.
- OpenAPI schemas and interactive API documentation are generated
  automatically.

## 9. Frontend

Views:

1. **Library:** books, upload, and processing status.
2. **Reader:** render stored chapter paragraphs as text, navigate chapters,
   track the current paragraph, and persist/restore reading progress.
3. **Notes panel** (sidebar or mobile bottom sheet): search field, list of
   characters/places seen so far, detail view with facts, relationships, and
   chapter references. Selected reader text can be looked up directly. The
   panel mirrors the current reading position by default and falls back to a
   manual chapter/percentage selection if the user is reading outside the app.
4. **Position-selection fallback:** chapter/percentage selector for reading
   outside the app.

Requirements: responsive (mobile-first), PWA manifest, service worker for the
app shell, and dark mode. The UI defaults to German and offers a language
selector; English is supported initially, with translations structured so
additional languages can be added. All new user-facing copy is translated into
German and English, and later languages can be added without changing the
data model.

AI-generated notes default to German. Set `APP_OUTPUT_LANGUAGE` (for example,
to `en`) to request another output language independently of the UI language.

## 10. Roadmap

### Phase 0: Setup

- Monorepo, tooling (ruff, optional mypy, pytest, ESLint, Vitest), `.env.example`,
  README.
- Acceptance: backend and frontend start locally, health endpoint is
  reachable, CI runs tests.

### Phase 1: EPUB parsing and database

- Upload endpoint, parse into chapters/paragraphs, assign positions, add
  migrations.
- Acceptance: a public-domain test EPUB is split correctly; positions are
  contiguous and monotonic; chapter order is correct.

### Phase 2: Extraction pipeline

- Prompting, JSON schema, chapter-by-chapter processing, entity resolution,
  job progress, token-cost tracking.
- Acceptance: a test book produces entities and facts at valid positions;
  interruption and resumption work; character-duplicate rate is acceptable
  (manual spot-check).

### Phase 3: Spoiler-filtered query API

- Lookup, entity list, recap, alias search.
- Acceptance (automated test): at every test position, no response contains a
  fact whose `position` is later than the query position; aliases are not
  found before introduction.

### Phase 4: Frontend foundation

- Library, upload with status, reader with position persistence.
- Acceptance: upload and read a book; position is retained after reload.

### Phase 5: Notes panel

- Search, detail view, look up selected words, manual position selection.
- Acceptance: reader lookup shows only information known at the current
  position; moving forward and backward changes results accordingly.

### Phase 6: PWA and polish

- Installable app, offline shell, error states, loading indicators, dark mode,
  data export (JSON/Markdown notes up to position X).
- Acceptance: phone installation works and the app is usable on a small
  display.

### Phase 7: Quality and evaluation

- Small evaluation set: 1–2 books with manually maintained reference notes;
  measure spoiler protection (required: zero violations), character coverage,
  and error rate.
- Documentation: setup, cost per book, known limitations.

## 11. Risks and mitigations

- **Model knowledge of well-known novels:** may introduce spoilers into facts.
  Mitigation: strict prompt, required source excerpts, spot-check well-known
  books, and omit uncertain facts.
- **External AI service:** approved chapter/text blocks are sent to the OpenAI
  API for extraction. Do not put EPUBs or secrets in the repository; keep the
  API key exclusively in `.env`.
- **Character confusion and duplicates:** alias management and resolution;
  manual merging in the UI may be added later.
- **Cost:** long books require many tokens. Mitigation: chapter-by-chapter
  processing, caching, token tracking, configurable model choice.
- **EPUB diversity:** inconsistent structure (missing chapters, footnotes,
  images). Mitigation: robust cleanup and tests against multiple EPUBs.
- **Copyright:** personal use only with the user's own copy; do not publicly
  serve book text.
- **Hallucinations:** every fact has a source excerpt and chapter reference
  for verification; the UI indicates that entries are AI-generated.

## 12. Implementation notes

- Work phase by phase; complete each phase's acceptance tests before starting
  the next.
- Write spoiler-filter tests first (Phase 3); they are the central quality
  criterion.
- Do not assume page numbers are stable; position is the only source of truth.
- Keep prompts, schemas, and model names in configuration or separate files,
  not scattered throughout the code.
- Never put secrets in the repository; use `.env` for API keys.
- Briefly document decisions in `/docs`.
