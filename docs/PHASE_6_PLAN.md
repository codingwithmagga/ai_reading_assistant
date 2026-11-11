# Phase 6 Plan: PWA and Polish

## Goal and scope

Make the reader installable as a Progressive Web App, usable as an offline
application shell, comfortable in light and dark themes, and able to export
spoiler-filtered notes. Improve loading, offline, and error feedback across
the existing library and reader workflows.

Offline support in this phase covers the application shell only. Book content,
notes, and API responses are not cached or available offline. E2E tests,
authentication, multi-user support, and public deployment are out of scope.

## Current-state boundaries

- The frontend is a React/TypeScript Vite app served by Nginx; API calls use
  the same-origin `/api` proxy.
- The app already supports German and English, reader-position persistence,
  position-aware notes, and loading/error states in key workflows.
- The Vite configuration does not currently register a PWA plugin or service
  worker. The HTML has a theme color but no web app manifest or install icons.
- Existing entity, lookup, and recap APIs filter data by an explicit position.
  There is no endpoint to export all notes for a book at a selected position.
- Access remains single-owner and unauthenticated. Keep the app private or
  behind trusted access controls.

## Implementation steps

1. **Installable app shell**
   - Add and configure the Vite PWA integration with a web app manifest,
     application name, standalone display mode, theme/background colors, and
     suitable icons.
   - Register a service worker that precaches only versioned application-shell
     assets and provides a useful offline shell/fallback.
   - Never cache `/api/` requests, book content, notes, uploads, or other
     private/user data. Make the offline UI state explicit and explain that
     library and reader data still require the backend.
   - Handle service-worker updates deliberately so an update does not
     unexpectedly interrupt reading. Keep development behavior predictable
     and avoid registering a production worker during tests.
   - Document installation and the HTTPS/localhost requirement. The local
     Compose deployment remains unchanged.

2. **Theme preference and dark mode**
   - Define shared color tokens for light and dark themes and apply them to
     the library, reader, notes panel, controls, dialogs, loading states, and
     errors.
   - Follow the operating-system preference until the user chooses a theme;
     persist an explicit light/dark choice across reloads.
   - Add an accessible theme control with German and English labels. Preserve
     sufficient text, control, focus, and error contrast in both themes.

3. **Loading, offline, and error polish**
   - Review library, upload, reader, progress-save, notes, and export flows for
     distinct loading, empty, offline, success, and error states.
   - Keep existing data visible and the reader usable when a secondary notes
     request fails. Provide retry actions for recoverable failures and avoid
     replacing detailed errors with generic success-shaped states.
   - Ensure controls remain keyboard accessible, focus remains visible, and
     dynamic status changes are announced appropriately.
   - Verify all new user-facing text in German and English and at narrow
     viewport widths.

4. **Position-bounded notes export**
   - Add a read-only backend export contract for one book and an explicit
     inclusive position. It returns only entities and aliases introduced by
     that position, facts and relationships at or before it, and spoiler-safe
     recap events. Do not include full chapter or paragraph text.
   - Enforce the position boundary in backend queries, not in export
     formatting code. Reject invalid positions using the established API error
     shape and return no future-derived metadata.
   - Add JSON and Markdown download options in the frontend. Use the active
     notes position by default, display the selected cutoff clearly, and allow
     the user to select a different valid position without silently changing
     saved reader progress.
   - Escape Markdown-sensitive book/model-provided strings; generate safe,
     predictable filenames; include book metadata, export position, fact
     positions, chapter references, and source excerpts. Never export EPUB
     contents or secrets.

5. **Documentation and acceptance**
   - Update the README and project specification with install, offline, theme,
     privacy/caching, and export behavior.
   - Update architecture notes if the PWA/service-worker or export API adds a
     lasting system boundary.
   - Keep backend and frontend behavior aligned; validate export response JSON
     at the frontend API boundary if a new API response is introduced.

## Planned tests

- Manifest metadata, icon references, service-worker registration, and
  production build output are valid.
- The service worker caches only app-shell assets and never caches API
  responses or user/book data. Offline UI clearly identifies unavailable
  backend-dependent features.
- Theme defaults to the system preference, honors a saved user choice, and
  renders accessible controls in both themes.
- Loading, retry, offline, and API-error states are distinguishable and
  preserve reader usability where possible.
- Export endpoint returns only information allowed at positions before, at,
  and after entity, alias, fact, relationship, and recap introductions.
- Invalid positions and unknown books return documented errors; export does
  not disclose chapter text or future-derived counts/previews.
- JSON and Markdown downloads preserve Unicode, identify their cutoff, escape
  untrusted text appropriately, and do not change saved reader progress.
- Run backend pytest and Ruff for backend changes; run frontend tests, lint,
  and production build. Use focused unit/component and integration tests; E2E
  tests remain deferred.
- Manually verify installation/update and responsive behavior on a supported
  phone/browser over HTTPS, plus the offline app shell with the backend
  unavailable.

## Acceptance criteria

- The application can be installed from a supported browser and opens in
  standalone mode with its name and icons.
- Previously loaded application-shell assets open when offline, while
  backend-dependent actions clearly report that the service is unavailable.
- No book content, notes, uploads, or API responses are stored by the service
  worker cache.
- Light/dark themes cover all major views, default to the system preference,
  and respect a persisted user override.
- Loading, empty, offline, and recoverable error states are clear, translated,
  accessible, and do not unnecessarily block reading.
- JSON and Markdown exports contain only notes allowed up to the explicitly
  displayed inclusive position; saved reader progress is unchanged.
- Backend tests and Ruff pass when backend code changes; frontend tests, lint,
  and production build pass.
- No E2E framework, offline book-content support, authentication, or public
  deployment is introduced as part of this phase.

## Explicitly deferred

- Offline reading, offline notes, API-response caching, and background sync.
- E2E test infrastructure.
- Authentication, multi-user support, and public deployment.
- Model-generated summaries, manual note editing, and changes to extraction
  semantics.

## Step 1 status

- Added the installable manifest and scalable app icon, plus the production
  service worker and offline app-shell fallback.
- Precaching is limited to built CSS, HTML, JavaScript, and SVG assets;
  `/api/` navigations are excluded and no runtime API caching is configured.
- The UI explains the offline limitation, and service-worker updates wait for
  the reader to accept them.
- Documented HTTPS/localhost installation and the app-shell-only offline
  boundary in the README and architecture overview.
