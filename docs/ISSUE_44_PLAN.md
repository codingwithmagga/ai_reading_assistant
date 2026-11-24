# Issue 44 Plan: Safe Extraction Positions

## Scope

Fix spoiler leaks caused by assigning block-start positions to entities, aliases,
facts, and relationships. Keep paragraph positions as the only authoritative
reading coordinate.

## Implementation steps

1. Require paragraph-reference fields in the OpenAI structured JSON schema.
2. Resolve all references against supplied block paragraphs in the backend.
3. Persist each item at a unique server-derived position:
   - entity: earliest unique evidence for the canonical name;
   - alias: paragraph containing unique alias evidence;
   - fact: paragraph containing the exact source excerpt or fact text;
   - relationship: paragraph containing both relationship endpoints.
4. Omit items with missing or ambiguous evidence instead of guessing.
5. Reduce the default extraction block size from 25 to 10 paragraphs.
6. Keep checkpoint settings compatible: completed jobs remain portable, while
   resumable jobs with incompatible block boundaries remain rejected.
7. Tighten backup validation so fact excerpts must occur in the persisted fact
   paragraph; document that old, potentially block-positioned data is not
   silently normalized.
8. Add fake-extractor regression coverage for paragraph 24 and every relevant
   query/export boundary.

## Acceptance

- A fact, alias, or relationship from paragraph 24 is not visible before its
  paragraph position and is visible at and after that position.
- Lookup, entity list, recap, and export use the corrected positions.
- Ambiguous or unsupported evidence is omitted.
- Existing checkpoint and backup compatibility rules remain explicit.
