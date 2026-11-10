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
