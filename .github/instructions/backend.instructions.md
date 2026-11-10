---
description: "Use when changing the Python backend, FastAPI routes, database access, EPUB or AI extraction, or backend tests."
applyTo: "backend/**/*.py"
---

# Backend Instructions

- Follow the existing Python 3.12+, FastAPI, Pydantic, and SQLAlchemy patterns.
  Use modern Python features supported by Python 3.12 and add type annotations
  to public functions and important internal APIs.
- Prefer small, single-purpose functions and composition over deep inheritance
  hierarchies. Use dataclasses or the project's typed models where appropriate;
  prefer the existing Pydantic and SQLAlchemy models when they fit the domain.
- Keep route handlers focused on HTTP concerns and validation. Put reusable
  domain behavior in the existing application modules; do not introduce a
  layered architecture or abstraction without a concrete need.
- Validate external input at API boundaries and return explicit, stable error
  responses. Keep response/request schemas in sync with the frontend contract.
- Preserve spoiler protection in database queries: filter by the requested
  position before returning facts, aliases, or relationships. Do not move this
  enforcement into prompts or the frontend.
- Validate model output with the existing schemas. Derive positions from
  validated paragraph references on the server, and include source evidence
  for extracted facts.
- Use the configured pytest framework. Prefer plain `assert`, small focused
  fixtures for shared setup, parametrization for equivalent cases, and tests
  for edge and error cases.
- Avoid broad exception handling, silent defaults, and swallowed errors.
  Handle expected failures explicitly and preserve useful error context.
- Do not add a dependency for trivial functionality. Check the standard
  library and existing dependencies first.
- After backend changes, run `python -m pytest` and `python -m ruff check .`
  from `backend/`. No mypy check is currently configured.
