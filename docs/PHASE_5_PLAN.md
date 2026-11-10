# Phase 5 Plan: Spoiler-Safe Notes Panel

## Goal and scope

Integrate the existing spoiler-filtered entity, lookup, and recap APIs into
the reader. Readers can find an entity by name or alias, inspect only the facts
and relationships available at their selected reading position, and review a
chronological recap plus the characters introduced so far.

The current interface remains German by default with English available from
the existing language selector. This phase does not change the extraction
pipeline, add model-generated summaries, introduce fuzzy search, or add user
accounts.

## Prerequisites and current-state boundaries

- Phase 4 is merged into `main`. The reader tracks and persists a book-wide
  paragraph position, exposes chapter/paragraph text, and supports language
  selection.
- The backend already provides:
  - `GET /books/{id}/entities?position=&type=`
  - `GET /books/{id}/lookup?q=&position=`
  - `GET /books/{id}/recap?position=`
- The API filters entities, aliases, facts, and relationships on the server
  using inclusive positions. The recap uses stored `event` facts and does not
  send further book text to OpenAI.
- The frontend API client currently covers books, chapters, chapter content,
  and reading progress; query endpoint types and methods need to be added.
- The app is single-owner and has no authentication. Keep it private or behind
  trusted access controls.

## Implementation steps

1. **Typed query API**
   - Add frontend types matching the existing entity-list, lookup, fact,
     relationship, and recap response schemas.
   - Add typed API methods for entities, lookup, and recap. Encode path and
     query parameters safely and use the existing `/api` proxy and error
     handling.
   - Pass an explicit reading position to every query request; do not make a
     request without one or substitute a global/default position.
   - Do not add a backend endpoint or change the existing schema unless
     implementation uncovers a specific contract gap. Any gap must be covered
     by backend API tests and documented in OpenAPI.

2. **Reading-position source**
   - Use the reader's current paragraph position as the default notes
     position. Keep the notes panel synchronized as the reader moves.
   - Add a manual position control for readers using an external reader. It
     supports selecting a chapter and a position within the book or setting a
     percentage, and always clamps no values silently: reject invalid input
     and explain the valid range.
   - Make it explicit in the UI when a manually selected position is active.
     Manual selection controls the notes query position but does not silently
     change the saved in-app reader progress. Resuming in-app reading switches
     notes back to the reader's live position.
   - Preserve the inclusive, zero-based position contract internally. Display
     human-friendly one-based positions and percentages only at the UI
     boundary.

3. **Notes panel and entity lookup**
   - Add a responsive notes panel beside the reader on wide layouts and as an
     accessible collapsible panel or bottom sheet on narrow screens.
   - Provide a search field with submit and clear actions. Submit a canonical
     name, alias, or selected word/phrase to the existing exact-match lookup
     endpoint; do not imply fuzzy search.
   - Display matching entities, aliases known by the current position, their
     supported facts with kind, chapter, source excerpt, and position, and
     spoiler-filtered relationships.
   - Allow selecting text in the reader to prefill the lookup field. The
     selection's paragraph position is used for the lookup; do not send the
     selected passage or additional book text outside the existing endpoint
     contract.
   - Do not render model- or book-supplied strings as HTML. Preserve
     deterministic API ordering.

4. **Known characters and recap**
   - Show characters known by the active reading position using the existing
     entity-list endpoint with `type=person`.
   - Show a "What has happened so far" view from the recap endpoint, ordered
     chronologically and containing only supported event facts and their
     chapter/source references.
   - Keep aliases, characters, facts, and relationships hidden until allowed
     by their introduction or fact position. Do not derive counts, previews,
     or search suggestions from unfiltered future data.

5. **Async state and accessibility**
   - Provide distinct loading, empty, no-match, and error states with retry
     actions. Keep the reader usable if a notes request fails.
   - Debounce live position-driven entity/recap refreshes where appropriate.
     Cancel obsolete requests or ignore stale responses when the selected
     book, reading position, search term, or language changes.
   - Avoid issuing duplicate requests for the same book, position, and query
     while a request is already in flight.
   - Label search, position, tabs, and panel controls; support keyboard-only
     operation, visible focus, and appropriate live-region announcements.
   - Translate every new user-facing string into German and English, keeping
     German as the default.

6. **Documentation and acceptance**
   - Update the README and project specification with notes panel behavior,
     exact-match semantics, position controls, and API examples.
   - Keep Phase 3's server-side spoiler boundary as the authoritative filter.
     The UI must always send its active position; it must not attempt to
     retrieve all data and filter locally.
   - Run backend tests and Ruff if backend/API behavior changes. Run frontend
     tests, lint, and production build for the notes UI and API client.

## Acceptance criteria

- Searching a canonical name or an introduced alias displays matching
  entities and only facts/relationships permitted at the active position.
- Characters and recap update when reader position changes or the user selects
  a manual position.
- Selecting text prefills lookup, and the request uses the position of the
  selected paragraph.
- No request omits the position; no response from an older request overwrites
  results for a newer position, query, book, or language.
- Empty results, unavailable extraction data, loading, and failures are
  distinguishable and recoverable without losing reader state.
- Data from later positions never appears through aliases, counts, previews,
  relationships, search results, or recap. Existing backend per-position
  spoiler-filter tests continue to pass.
- Book and model-provided text is rendered as text, not executable HTML.
- German is the default UI language, English translations are available, and
  the existing language preference persists.
- Frontend tests, lint, and production build pass; backend tests and Ruff pass
  if backend files change.

## Planned tests

- API client passes encoded search terms and explicit positions to each
  endpoint and surfaces structured errors.
- At each tested reader position, requests include the matching inclusive
  position and rendered results contain no later entity, alias, fact, or
  relationship.
- A delayed earlier lookup/recap response cannot replace newer query results.
- Manual chapter, paragraph, and percentage selection produce correct
  book-wide positions without modifying saved reader progress.
- Selected text lookup uses the selection's paragraph position and sends only
  the search term.
- Search empty state, no matches, loading, error/retry, and keyboard-accessible
  panel behavior work in German and English.
- Existing backend spoiler-filter tests remain green; no network or OpenAI key
  is required.

## Explicitly deferred

- Fuzzy search, automatic entity merging, and model-generated summaries.
- Manual entity editing or correction.
- Changes to extraction prompts, model output, or database query semantics
  without a separately tested requirement.
- PWA, offline notes, export, authentication, and multi-user support (Phase 6
  or later).
