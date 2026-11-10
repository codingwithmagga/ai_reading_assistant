# Phase 2 Plan: Chapter-by-Chapter Extraction Pipeline

## Goal and scope

An already parsed book is processed sequentially using its stored chapters and
paragraphs. The pipeline extracts entities, time-bound aliases, supported
facts, and relationships, stores validated results, and allows failed jobs to
resume.

This phase does **not** implement the lookup/spoiler-filter API (Phase 3), a
reader or notes frontend (Phases 4–5), or a PWA. Only entities and facts from
the current book are produced. Model output is untrusted: order, position
assignment, evidence, and spoiler boundaries are controlled server-side.

## Prerequisites and current-state boundaries

- Books, chapters, paragraphs, and jobs from Phase 1 exist; a fully parsed
  book has status `parsed`.
- The `entities`, `entity_aliases`, `facts`, and `relationships` tables do not
  yet exist and must be added by an Alembic migration.
- Upload currently parses synchronously. Initially, extraction is a separate,
  explicitly started backend job; upload and extraction must not be coupled
  before job state supports resumption.
- Before sending a request to the model, ensure that the job passes only
  chapters up to and including the chapter being processed. Later chapters
  must not appear in the prompt or any supporting context.

## Implementation steps

1. **Data model and migration**
   - Add SQLAlchemy models and an Alembic migration for `entities`,
     `entity_aliases`, `facts`, and `relationships`.
   - `entities`: book FK, type (`person|place|group|object|concept`), canonical
     name, first known position.
   - `entity_aliases`: entity FK, alias, first known position; aliases are
     usable only from this position onward.
   - `facts`: book and entity FKs, text, server-calculated position, chapter
     FK, source excerpt (max. 200 characters), and type
     (`description|relationship|event|motivation`).
   - `relationships`: book FK, both entity FKs, label, and position.
   - Positions must be nonnegative. Unique constraints protect against
     duplicate aliases and identical extraction results; add indexes at least
     on `(book_id, position)`, `(book_id, canonical_name)`, and
     `(entity_id, first_position)`.
   - Test migration and downgrade on SQLite; foreign keys must remain enabled.

2. **Extraction schema and prompt**
   - Define Pydantic schemas for chapter results and their entities, aliases,
     facts, and relationships. Model fields contain a chapter/paragraph
     reference only, never a global position.
   - Assign unique numbered references to chapter inputs and paragraph IDs or
     indexes; the server validates every response against exactly those
     allowed references.
   - Source excerpts must come from the referenced paragraph. Reject or omit
     facts without sufficient evidence, with an unknown reference, with empty
     content, or with a source excerpt longer than 200 characters, according
     to the defined validation rule.
   - Keep the prompt and JSON output schema in separate files. Instruct the
     model to use only supplied text, not guess, and not rely on prior
     knowledge of the book. Prompting is an additional safeguard, not a
     spoiler-protection mechanism.
   - Read the extraction language from the existing `APP_OUTPUT_LANGUAGE`
     setting.

3. **OpenAI client and configuration**
   - Wrap the official OpenAI Python client behind a narrow, injectable
     interface so tests run without network access or an API key.
   - The API key remains optional when starting the app, but is explicitly
     required to start an extraction job; if absent, return a clear
     configuration error and do not mark the job successful.
   - Read model name, maximum response/retry count, and any timeout from
     configuration. Never log prompts or API keys.
   - Use the OpenAI Responses API with structured output/JSON Schema and still
     validate every response with Pydantic. Retry invalid output a limited
     number of times with validation-related correction instructions; then
     mark the job as failed.
   - Send OpenAI only the currently allowed chapter/paragraph blocks and
     permitted entity context; document the data transfer transparently. Do
     not send the complete EPUB file to the provider.

4. **Sequential processing, resumption, and cost**
   - Allow at most one active extraction job per book.
   - Process chapters strictly by `chapters.index`. The model receives only
     paragraphs from the current chapter and the entity/alias set saved up to
     the preceding chapter.
   - For long chapters, process paragraphs in contiguous, ordered blocks; the
     prompt and entity context must not include later blocks.
   - Extend `jobs` with information needed to resume (for example, the last
     completed chapter, token usage, and error code). Save each chapter result,
     progress, and checkpoint atomically.
   - Cancellation or failure must not duplicate already confirmed chapter
     results. A restart continues from the first incomplete chapter or block.
   - Track input/output tokens per model call and total them on the job;
     update progress monotonically. Do not parallelize model calls.

5. **Entity resolution and server-side position assignment**
   - Initially match names by normalized exact comparison against canonical
     names and known aliases for this book. New entities get deterministic
     IDs and `first_position` based on their first supported mention.
   - Accept an explicit model reference to an existing entity only if that
     entity is included in the permitted context. Automatic fuzzy/LLM
     merging is out of scope for this phase; store and document ambiguous
     cases as separate or unresolved.
   - Calculate global positions exclusively from validated paragraphs in the
     current chapter; positions must fall within that chapter's range.
   - Relationship endpoints must belong to the same book. Do not expose facts,
     aliases, or relationships before their first supported position.

6. **Job control and API**
   - Add an explicit endpoint to start extraction for a parsed book, such as
     `POST /books/{id}/extraction-jobs`; reuse a running job or return a
     consistent conflict status.
   - `GET /books/{id}/jobs` returns job type, status, percentage progress, last
     completed chapter, safe error message, and token counts.
   - Successful extraction changes the book status to `ready`; failures
     retain `error` and a resumable job state. `parsed` remains the status
     before successful extraction.
   - Allow a job to run locally without OpenAI access by using test doubles;
     do not add a public lookup route.

## Planned tests

- Migration creates all four tables, foreign keys, unique constraints, and
  indexes; Alembic detects no model differences afterward.
- Pydantic rejects invalid entity/fact types, missing fields, invalid
  paragraph references, and overly long source excerpts.
- The prompt input for chapter N contains no paragraphs from N+1 and no future
  entities or aliases.
- Given a model response with a valid paragraph reference, the server
  calculates the exact global database position. Model-supplied positions
  are neither accepted nor trusted.
- No fact, alias, or relationship may reference a paragraph outside the
  current chapter. Every source excerpt is contained in the referenced
  paragraph text.
- Sequential mock execution verifies chapter order and bounded block order.
  The OpenAI client is called with the validated prompt and JSON Schema.
- Model transport errors, invalid JSON, validation failures, or a missing API
  key are visibly recorded as job failures; no failure is disguised as
  success.
- Cancellation after a chapter/block and subsequent resumption process only
  unfinished work and create no duplicate facts or entities.
- Job progress remains monotonic; token counters sum reported usage.
- No test requires a real OpenAI key or network access.

## Acceptance criteria

- Migration succeeds on an empty SQLite database and matches the models.
- A synthetic multi-chapter test book produces entities, aliases, facts, and
  relationships at correct global positions with a mock model.
- Tests prove that later book text is absent from model input while a chapter
  is being processed.
- All stored facts and relationships have a valid paragraph reference and a
  position within the book; source excerpts are verifiable and no longer than
  200 characters.
- Automated tests cover job progress, token usage, failure state, and
  resumption.
- Backend tests and Ruff pass locally and in pull-request CI.
- The phase ends before implementation of the Phase 3 lookup/recap API.

## Explicitly deferred

- Automatic fuzzy or LLM-assisted merging of ambiguous entities; do not
  perform risky automatic merges initially.
- Lookup, recap, and spoiler-filter API; these have their own Phase 3 tests.
- UI for manual correction or merging of entities.
- Batch/parallel processing of multiple chapters, background queues outside
  the existing job model, and automatic re-parsing.
