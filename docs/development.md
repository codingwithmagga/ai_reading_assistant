# Development Guide

## Prerequisites

- Git
- Docker with Docker Compose for the recommended full-stack workflow
- For local checks: Python 3.12+ and Node.js 22+

## Run the application

The recommended workflow starts the backend and frontend through Compose from
the repository root:

```bash
docker compose up --build
```

The application is available at <http://localhost:8080>. To stop it:

```bash
docker compose down
```

For environment variables and privacy details, see the root
[README](../README.md) and `.env.example`. Keep local secrets in `.env`, which
must not be committed.

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
- CI is pull-request-only. The repository owner merges through the GitHub UI
  after checks pass.
- Describe the purpose, behavior, and relevant test results in the pull
  request.
