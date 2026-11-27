# Development Guide

## Prerequisites

- Git
- Docker with Docker Compose for the recommended full-stack workflow
- For local checks: Python 3.12+, `uv`, and Node.js 22+

## Run the application

The recommended local workflow starts the production-style backend and
frontend through Compose from the repository root:

```bash
docker compose up --build
```

This is the default Compose configuration: it does not bind source directories
and Uvicorn does not use reload mode. The frontend port binds only to loopback
by default. For Python source changes and Uvicorn reload mode, use the explicit
development override:

```bash
docker compose -f compose.yaml -f compose.dev.yaml up --build
```

Do not name the development file `compose.override.yaml`; Compose loads that
file automatically whenever `docker compose` is run. Keeping development opt-in
prevents source mounts and reload mode from being enabled on a server by
accident.

The application is available at <http://localhost:8080>. To stop it:

```bash
docker compose down
```

For environment variables and privacy details, see the root
[README](../README.md) and `.env.example`. Keep local secrets in `.env`, which
must not be committed.

## Backend dependencies

The backend uses `uv` and a committed `uv.lock` lockfile. From `backend/`:

```bash
uv sync --locked --extra dev
uv run pytest
uv run ruff check .
```

After changing runtime or development dependencies in `pyproject.toml`, update
the lockfile and review the resulting dependency changes:

```bash
cd backend
uv lock
git diff --stat uv.lock pyproject.toml
```

Commit `pyproject.toml` and `uv.lock` together. Use `uv lock --check` to verify
that the manifest and lockfile agree. The Docker build and CI install the same
locked resolution; CI does not resolve dependencies from version ranges alone.

## Local checks

See [testing.md](./testing.md) for the configured backend and frontend test,
lint, and build commands.

## Branch and pull request workflow

- Create a new, task-specific feature branch for every task from freshly
  fetched `origin/main` (for example, `feature/MJS/<task-name>`). Create it
  without tracking `origin/main`, then push it with
  `git push --set-upstream origin <branch-name>` so its upstream is its own
  matching `origin/<branch-name>`, not `origin/main`.
- Keep changes on that feature branch; do not merge locally or push directly
  to `main`.
- CI runs backend, frontend, image-build, and Compose-smoke checks for pull
  requests and pushes to `main`. The repository owner merges through the GitHub
  UI after checks pass.
- Describe the purpose, behavior, and relevant test results in the pull
  request.
