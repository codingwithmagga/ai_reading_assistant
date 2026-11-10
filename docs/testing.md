# Testing and Quality Checks

Use the frameworks and commands already configured in this repository. Add or
update tests alongside behavior changes, and prefer tests of observable
behavior over tests coupled to implementation details.

Keep tests focused, deterministic, and independent of execution order. Avoid
excessive mocking: mock external systems and expensive dependencies, not
internal implementation details.

For bug fixes, first reproduce the problem with a failing regression test,
then fix the bug and verify the regression test and relevant neighboring tests.

## Test-driven development

For behavior changes, follow Red–Green–Refactor whenever practical:

1. Write or update a test that specifies the expected behavior.
2. Run it and confirm it fails for the intended reason.
3. Implement the smallest change that makes it pass.
4. Refactor with the relevant tests still passing.

For work where this cycle is not useful, such as documentation-only changes,
use an appropriate validation method instead.

## Backend

The backend uses pytest and Ruff. From `backend/`:

```bash
python -m pytest
python -m ruff check .
```

Tests live in `backend/tests/`. Prefer plain `assert`, small focused fixtures,
and parametrized tests for equivalent cases. Cover edge cases, expected
failures, and API error responses. For query/API changes, verify the spoiler
boundary at positions before, at, and after the relevant facts or aliases.

### Integration tests

Add integration tests when they verify important behavior across component
boundaries that isolated unit tests cannot establish on their own. Keep them
focused on a user- or API-visible workflow, use the migrated temporary SQLite
database for persistence, and replace external or expensive services with
fakes.

Useful integration-test coverage in this project includes:

- EPUB upload through the API and persisted books, chapters, paragraphs, and
  parsing jobs (`test_books_api.py`).
- Extraction job processing, persistence, and resume behavior using a fake
  extractor; test the API-to-database flow where these boundaries need to be
  verified together (`test_extraction_jobs.py` and
  `test_workflow_integration.py`).
- Entity, alias, fact, relationship, lookup, and recap endpoints with real
  database data and spoiler-boundary positions (`test_lookup_api.py`).
- Frontend user workflows across components; the existing App tests are
  UI-level integration tests and mock the API client.

Keep unit tests for isolated logic and specialized edge cases. A unit test may
be removed only when integration tests fully preserve its behavior and all
relevant edge-case coverage; integration coverage is not a reason by itself to
delete tests or reduce meaningful coverage.

E2E tests are intentionally deferred. Do not add an E2E framework or tests
unless the project explicitly takes up that work.

## Frontend

The frontend uses Vitest, React Testing Library, ESLint, and TypeScript. Node
22 or later is required. From `frontend/`:

```bash
npm test
npm run lint
npm run build
```

Tests live alongside the application in `frontend/src/`. Exercise user-visible
behavior with accessible roles, labels, and text; avoid inspecting component
state or private implementation details.

## API and cross-stack changes

When changing an API contract, update backend tests, backend implementation
and schemas, frontend types/client, and affected frontend tests. Run both
backend and frontend checks for cross-stack changes.
Frontend API-client tests should cover malformed successful responses so
runtime response validation cannot regress.

## CI

GitHub Actions runs the backend and frontend checks on pull requests. The
workflow is defined in `.github/workflows/ci.yml`.
