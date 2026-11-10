# Phase 4 Plan: Frontend Foundation

## Goal and scope

Provide a usable library, EPUB upload flow, and in-app reader. The reader loads
the chapters and paragraphs already stored by the backend and restores the
reader's last position after a reload.

The interface defaults to German and supports English through the language
selector. This phase does not implement entity lookup or the notes panel
(Phase 5), multi-user accounts, a PWA, or authentication. Keep the service
private or behind trusted access controls.

## Current-state boundaries

- The backend already exposes book listing, EPUB upload, chapter listing, and
  chapter-content endpoints.
- The backend does not yet expose a reading-progress endpoint or persist a
  current reading position.
- The original EPUB is intentionally not stored; the reader must use the
  chapter and paragraph text returned by the API. An `epub.js` reader would
  require a separate decision to retain source EPUB files.
- The frontend is currently a small React/Vite shell with no API client or
  application views.

## Implementation steps

1. **Reading progress persistence**
   - Add a nullable `current_position` to the book record in an Alembic
     migration. A single position per book matches the current single-owner
     product scope; user-specific progress is out of scope.
   - Add `GET /books/{id}/progress` and `PUT /books/{id}/progress`.
   - The GET response returns the saved position or `null` when the reader has
     not saved one yet.
   - The PUT request accepts a book-wide paragraph position, validates that it
     belongs to the book's stored position range, persists it, and returns the
     saved value. Unknown books return the existing 404 error shape; invalid
     positions return a documented 422 response.
   - Add API and migration tests for an empty progress value, successful
     updates, reload-equivalent reads, invalid boundaries, unknown books, and
     database persistence.

2. **API access and library**
   - Add a small typed frontend API module for book listing, upload, chapter
     listing, and chapter-content retrieval. Keep the API base URL consistent
     with the existing same-origin Nginx `/api` proxy.
   - Build a responsive library view that lists each book's title, author when
     available, and parsing/extraction status.
   - Add EPUB upload with file selection, upload progress or a clear pending
     state, success feedback, and readable error states. Refresh the library
     after a successful upload and handle the existing duplicate-upload
     response without showing a false failure.
   - Allow selecting a book to open its reader. Keep the selected book
     navigable back to the library.

3. **Reader and position tracking**
   - Load chapters in API order and fetch chapter content only as needed.
   - Render chapter titles and stored paragraphs as readable, accessible text;
     do not render untrusted book text as HTML.
   - Provide chapter navigation and a clear current-position indicator.
   - Track the paragraph currently being read as the reader moves through the
     text. Restore the saved position on open, loading the chapter that
     contains it and bringing that paragraph into view. If there is no saved
     position, start at the first stored paragraph.
   - Persist position changes through the progress API. Prevent stale,
     out-of-order requests from replacing a newer position, and surface
     persistence failures with a retryable error state.
   - Keep reading position book-wide and inclusive, matching the backend's
     existing paragraph positions.

4. **Language and responsive behavior**
   - Preserve German as the default interface language and persist the user's
     German/English selection across reloads.
   - Provide translations for all new interface strings in both languages;
     keep the translation structure extendable to further locales.
   - Support keyboard navigation, visible focus, semantic labels, loading and
     empty states, and narrow mobile layouts.

5. **Documentation and acceptance**
   - Document the reader behavior and progress API in the README and OpenAPI
     schemas.
   - Verify existing frontend behavior and backend contracts remain intact.
   - Run backend tests and Ruff, plus frontend tests, lint, and production
     build.

## Acceptance criteria

- A user can upload a DRM-free EPUB, see it in the library, and open it.
- Library and reader states distinguish loading, empty, success, and API error
  outcomes; duplicate uploads are handled as successful reuse.
- The reader shows the stored book text in chapter order without rendering
  untrusted HTML.
- The current paragraph and chapter are represented by the correct global
  position.
- Reopening or reloading a book restores its saved paragraph, including after
  backend restart.
- Invalid or out-of-range progress cannot be persisted; spoiler-sensitive
  APIs continue to receive only the current book position when introduced in
  Phase 5.
- German is the default UI language, English can be selected, and the choice
  persists across reloads.
- Backend tests and Ruff pass; frontend tests, lint, and build pass.

## Explicitly deferred

- Search, entity details, facts, recaps, and selected-text lookup (Phase 5).
- Original EPUB retention and `epub.js` rendering.
- Multi-user or per-device reading progress.
- PWA installation, offline book content, dark mode, and export (Phase 6).
- Authentication and public deployment.
