# Phase 3 Plan: Spoiler-Filtered Query API

## Goal and scope

The API allows clients to look up already extracted entities and facts up to a
reading position supplied by the client. The spoiler boundary is enforced
exclusively in server-side database queries. Names, aliases, facts, or
relationships from later positions must not affect search results or indirect
metadata.

This phase does not implement a reader UI, user accounts, or changes to the
extraction pipeline. The app still has no sign-in; keep it on localhost or
behind protected VPN/reverse-proxy access and never expose it publicly without
protection.

## Prerequisites

- Phase 2 stores entities and aliases with `first_position`, facts and
  relationships with server-calculated `position`, and provides job progress.
- There is no per-chapter summary or recap data yet.
- Chapters and paragraphs have contiguous global positions starting at 0.

## Implementation steps

1. **Write spoiler-filter tests first**
   - Create a synthetic test book with multiple entities, aliases, facts,
     relationships, and chapter boundaries.
   - For every test position, prove that no response contains content whose
     `position` is greater than the query position.
   - An entity must not appear before its first mention; an alias is searchable
     only from its `first_position`.
   - Return a relationship only when the relationship and both entities are
     known at the requested position.
   - Add tests for same-name aliases, unknown books, empty queries, position
     boundaries, and empty extraction results; without extraction, the entity
     list and lookup return empty result lists.

2. **Shared position and resolution logic**
   - Validate a position against the stored book range; reject negative values
     and values beyond the last paragraph position with a defined 422 error,
     rather than silently clamping.
   - Match canonical names and aliases introduced by the requested position
     using normalized exact matching; do not add fuzzy or external model
     resolution.
   - Do not automatically assign ambiguous aliases to an entity. Results may
     show competing entities known by that point or mark the alias ambiguous.

3. **Entity list**
   - `GET /books/{id}/entities?position=...` returns only entities with
     `first_position <= position`, optionally filtered by entity type.
   - Any included alias must satisfy `first_position <= position`.
   - Keep response fields and ordering deterministic; do not reveal future
     fact counts, alias names, or relationships through metadata.

4. **Lookup**
   - `GET /books/{id}/lookup?q=...&position=...` searches canonical names or
     aliases introduced by that point.
   - Return only matching entities, facts, and relationships whose positions
     are less than or equal to the query position.
   - Include each fact's type, chapter reference, source excerpt, and position.
     Positions are for verification, not a way to disclose content beyond the
     boundary.
   - Define consistent 404/422 error codes.

5. **Recap and characters seen so far**
   - `GET /books/{id}/recap?position=...` may use only already
     spoiler-filtered information.
   - The recap is a deterministic, chronological list of `event` facts with
     `position <= position`, including chapter and source excerpt. It uses no
     model and transfers no additional book text.
   - The response also includes characters seen so far, using the same
     spoiler-filtered entity/alias query as `/entities?type=person`.

6. **Documentation and acceptance**
   - Document OpenAPI response schemas, error codes, sorting, and inclusive
     position semantics in the README and project specification.
   - Add lookup/entity/recap examples to the README.
   - Phase 2 must not depend on the lookup API; all backend tests and Ruff
     must pass for Phase 3.

## Acceptance status

- Steps 1–6 are implemented; recap is deterministic and based on `event`
  facts. No additional content is sent to OpenAI.
- API response schemas are available through FastAPI/OpenAPI at `/api/docs`.
- Spoiler-filter tests cover every position in the synthetic sequence, alias
  introductions, ambiguity, relationships, position errors, and empty
  extraction.
- The extraction pipeline and Phase 2 do not import lookup API logic; API
  routes encapsulate query functionality.
- Acceptance verified: Ruff passes; the full backend test suite passes with
  74 tests.

## Planned tests

- At every position in a synthetic sequence, all returned facts and
  relationships have position <= the query position.
- Entity list and lookup hide entities and aliases before their first mention.
- Ambiguous aliases never produce an unsupported single-entity assignment.
- Relationships are returned only when the relationship and both endpoints
  are known without spoilers.
- Positions < 0 and > the last paragraph position produce defined 422
  responses.
- Foreign chapter or book IDs, unknown books, and missing search results
  produce defined error responses.
- Recap receives only pre-filtered facts; no test requires network access or a
  real OpenAI key.

## Explicitly deferred

- Fuzzy search and automatic alias/entity merging.
- Public deployment without sign-in; access protection remains a separate
  server/authentication task.
- Chapter summaries generated from unfiltered text, reader integration, and
  persisted reading progress.
