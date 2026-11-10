# AI-Assisted Development Guidelines

## Project context

- Read [the project specification](../docs/PROJECT_SPEC.md) for product scope,
  acceptance criteria, and authoritative behavior.
- Read [the architecture overview](../docs/architecture.md) before changing
  system boundaries, data flow, or API behavior.
- Follow [development](../docs/development.md) and
  [testing](../docs/testing.md) guidance for local workflows and validation.
- Use the path-specific instructions in `.github/instructions/` for backend
  and frontend changes.

## Core product requirements

- Treat spoiler protection as a core architectural requirement. Positions are
  the only authoritative reading coordinate, and positions are inclusive:
  responses may contain only facts with `position <= current_position`.
- Filter data in the backend before returning it. Do not fetch later content
  and attempt to hide it in the frontend.
- During extraction, process chapters in reading order. Give the model only
  the supplied chapter text and previously known entities; never expose later
  chapters.
- Calculate positions server-side from validated paragraph references. Do not
  trust model-provided positions.
- Facts must be evidence-based and include a short source excerpt and chapter
  reference. Omit uncertain facts.
- Keep book content private and intended for personal use with a personally
  owned copy. Never add public book-text uploads or distribution.

## Working approach

- Understand the affected code, existing tests, and documented behavior before
  changing files.
- For larger changes, split the work into small, independently verifiable
  steps. Identify affected frontend, backend, API, documentation, and test
  surfaces before implementation. Avoid implementing independent features
  together when they can be handled separately.
- For behavior changes, use test-driven development whenever practical:
  write or update a test that captures the expected behavior, run it to confirm
  it fails for the intended reason, implement the smallest change to pass, and
  refactor while keeping tests green (Red–Green–Refactor). For changes where
  this cycle is not useful, such as documentation-only edits, explain the
  validation that is appropriate instead.
- For bug fixes, first reproduce the bug with a failing regression test, then
  fix it and run that test plus relevant regression checks.
- Add integration tests where they provide meaningful coverage across
  boundaries, such as API, database, extraction, or user-facing workflows.
  Keep focused unit tests for isolated logic and edge cases. A unit test may be
  removed only when an integration test fully preserves its behavior and edge
  case coverage; do not reduce coverage merely to reduce the test count.
- E2E tests are out of scope for now; do not introduce them unless requested.
- Keep changes focused; refactor when it provides a concrete improvement, not
  as unrelated cleanup.
- Preserve existing behavior and public contracts unless a change is requested.
  Do not remove functionality or invent significant product behavior silently.
- Make small assumptions explicit. Ask for clarification when different
  interpretations would materially change the implementation.
- Keep errors explicit; do not hide failures behind broad catches, silent
  defaults, or success-shaped fallbacks.
- Validate API data on both sides of the boundary. In particular, treat parsed
  frontend response JSON as `unknown` and validate its runtime shape before
  using it as a typed value.
- Update relevant tests and documentation with production changes. Review the
  final diff for unrelated edits and run the checks relevant to the change.
- For every task, check whether the relevant project documentation and AI
  instruction files still describe the affected behavior and workflow. Update
  them when the change makes them incomplete or inaccurate; do not change
  unrelated documents.
- Before adding a dependency, check the standard library and existing project
  dependencies, prefer established and maintained packages, and follow the
  existing dependency-management approach.
- Never add secrets, API keys, or private book text to the repository.

## Definition of done

- The requested behavior is implemented, relevant tests exist and pass, and
  appropriate edge cases are covered.
- The code is readable and maintainable, with no unnecessary duplication or
  unrelated changes.
- Run the relevant configured tests, linters, formatters, and type checks;
  fix issues caused by the change and review the final diff.

## Project conventions

- Keep internal documentation and code comments in English. The UI and
  generated notes default to German; preserve language selection and
  `APP_OUTPUT_LANGUAGE`.
- Keep configuration values and model names in configuration rather than
  scattering them through code.
- Prefer descriptive names, small functions and components, early returns,
  clear control flow, and explicit dependencies. Avoid deeply nested
  conditionals, duplicated logic, magic values, dead code, unnecessary
  comments, and speculative abstractions. Comments should explain why, not
  restate what the code does.
- Create a new, task-specific feature branch for every task, based on the
  freshly fetched `origin/main` (for example,
  `feature/MJS/<task-name>`). Create it without tracking `origin/main`, then
  push it with `git push --set-upstream origin <branch-name>` so it tracks its
  own matching `origin/<branch-name>`. Never leave a feature branch tracking
  `origin/main`.
- CI is pull-request-only. Push completed work to its matching feature branch
  and prepare a pull request description; do not merge branches locally or
  push commits directly to `main`. The repository owner merges through the
  GitHub UI after checks pass.
- Verify phase acceptance criteria with tests before starting later phase work.
