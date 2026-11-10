# AI-Assisted Development Guidelines

- Before implementation, read the relevant specification in
  [../docs/PROJECT_SPEC.md](../docs/PROJECT_SPEC.md). Work phase by phase and
  do not implement later phases prematurely.
- Treat spoiler protection as a core requirement: every text passage and fact
  has a fixed book position; queries may return only data with
  `position <= current_position`. Aliases may be found only from their
  `first_position`.
- Process extraction chapters strictly in reading order. A model may see only
  the supplied text and previously known entities, never later chapters.
  Do not trust model-provided positions; calculate them server-side from
  validated paragraph references.
- During extraction and summarization, use only supported information from
  the allowed input. Facts require a short source excerpt and chapter
  reference; omit uncertain facts.
- Positions are the only authoritative reading coordinate. Page numbers vary
  by edition and are only approximate.
- Keep configuration values and model names in configuration. Never put keys,
  book text, or other secrets in the repository.
- Keep internal documentation and code comments in English. Keep the UI and
  generated notes German by default; preserve the UI language selector and
  `APP_OUTPUT_LANGUAGE` setting for choosing another language.
- Before completing a phase, verify its acceptance criteria with tests.
  Preserve existing tests and behavior.
- EPUB content is intended for private use with a personally owned copy.
  Do not implement public book-text uploads or distribution.
