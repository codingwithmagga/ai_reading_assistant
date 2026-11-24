import type {
  Book,
  UploadedBook,
  ExtractionJob,
  Chapter,
  ChapterContent,
  Paragraph,
  ReadingProgress,
  EntityType,
  FactKind,
  EntityAlias,
  EntityListItem,
  LookupEntitySummary,
  LookupFact,
  LookupRelationship,
  EntityLookupMatch,
  EntityLookupResponse,
  RecapEvent,
  RecapResponse,
  NotesExportEntity,
  NotesExportResponse,
} from "../apiTypes";

export interface ApiErrorDetail {
  code?: string;
  message?: string;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
function isString(value: unknown): value is string {
  return typeof value === "string";
}
function isNullableString(value: unknown): value is string | null {
  return value === null || isString(value);
}
function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}
function isNullableNonNegativeInteger(value: unknown): value is number | null {
  return value === null || isNonNegativeInteger(value);
}
export function isArrayOf<T>(
  value: unknown,
  isItem: (item: unknown) => item is T,
): value is T[] {
  return Array.isArray(value) && value.every(isItem);
}

export function isBook(value: unknown): value is Book & Record<string, unknown> {
  return isRecord(value) && isString(value.id) && isString(value.title) &&
    isNullableString(value.author) && isNullableString(value.language) &&
    isString(value.created_at) && isString(value.status);
}
export function isUploadedBook(value: unknown): value is UploadedBook {
  return isBook(value) && isString(value.source_hash) &&
    typeof value.reused === "boolean" && isNullableString(value.error);
}
export function isExtractionJob(value: unknown): value is ExtractionJob {
  return isRecord(value) && isString(value.id) && isString(value.book_id) &&
    isString(value.type) &&
    (value.status === "pending" || value.status === "running" ||
      value.status === "completed" || value.status === "error") &&
    isNonNegativeInteger(value.progress) && value.progress <= 100 &&
    isNonNegativeInteger(value.min_chapter_index) &&
    (value.max_chapter_index === null || isNonNegativeInteger(value.max_chapter_index)) &&
    isNullableNonNegativeInteger(value.last_completed_chapter_index) &&
    isNullableNonNegativeInteger(value.last_completed_block_index) &&
    isNullableString(value.error_code) && isNullableString(value.error) &&
    isNonNegativeInteger(value.input_tokens) &&
    isNonNegativeInteger(value.output_tokens) && isString(value.created_at);
}
export function isChapter(value: unknown): value is Chapter & Record<string, unknown> {
  return isRecord(value) && isString(value.id) && isString(value.book_id) &&
    isNonNegativeInteger(value.index) && isNullableString(value.title) &&
    isNonNegativeInteger(value.start_position) &&
    isNonNegativeInteger(value.end_position) &&
    value.start_position <= value.end_position;
}
export function isParagraph(value: unknown): value is Paragraph {
  return isRecord(value) && isString(value.id) && isString(value.chapter_id) &&
    isNonNegativeInteger(value.position) && isString(value.text);
}
export function isChapterContent(value: unknown): value is ChapterContent {
  return isChapter(value) && isArrayOf(value.paragraphs, isParagraph) &&
    value.paragraphs.every((paragraph) =>
      paragraph.chapter_id === value.id &&
      paragraph.position >= value.start_position &&
      paragraph.position <= value.end_position);
}
export function isReadingProgress(value: unknown): value is ReadingProgress {
  return isRecord(value) && isString(value.book_id) &&
    (value.current_position === null || isNonNegativeInteger(value.current_position));
}
function isEntityType(value: unknown): value is EntityType {
  return value === "person" || value === "place" || value === "group" ||
    value === "object" || value === "concept";
}
function isFactKind(value: unknown): value is FactKind {
  return value === "description" || value === "relationship" ||
    value === "event" || value === "motivation";
}
function isEntityAlias(value: unknown): value is EntityAlias {
  return isRecord(value) && isString(value.alias) &&
    isNonNegativeInteger(value.first_position);
}
export function isEntityListItem(value: unknown): value is EntityListItem {
  return isRecord(value) && isString(value.id) && isEntityType(value.type) &&
    isString(value.canonical_name) &&
    isNonNegativeInteger(value.first_position) &&
    isArrayOf(value.aliases, isEntityAlias);
}
function isLookupEntitySummary(value: unknown): value is LookupEntitySummary {
  return isRecord(value) && isString(value.id) && isEntityType(value.type) &&
    isString(value.canonical_name) && isNonNegativeInteger(value.first_position);
}
function isLookupFact(value: unknown): value is LookupFact {
  return isRecord(value) && isString(value.id) && isString(value.text) &&
    isFactKind(value.kind) && isNonNegativeInteger(value.position) &&
    isString(value.chapter_id) && isNonNegativeInteger(value.chapter_index) &&
    isNullableString(value.chapter_title) && isString(value.source_excerpt);
}
function isLookupRelationship(value: unknown): value is LookupRelationship {
  return isRecord(value) && isString(value.id) &&
    isLookupEntitySummary(value.entity_a) && isLookupEntitySummary(value.entity_b) &&
    isString(value.label) && isNonNegativeInteger(value.position);
}
function isEntityLookupMatch(value: unknown): value is EntityLookupMatch {
  return isRecord(value) && isLookupEntitySummary(value.entity) &&
    isArrayOf(value.aliases, isEntityAlias) &&
    isArrayOf(value.facts, isLookupFact) &&
    isArrayOf(value.relationships, isLookupRelationship);
}
export function isEntityLookupResponse(value: unknown): value is EntityLookupResponse {
  return isRecord(value) && isString(value.query) &&
    isNonNegativeInteger(value.position) &&
    isArrayOf(value.matches, isEntityLookupMatch);
}
function isRecapEvent(value: unknown): value is RecapEvent {
  return isRecord(value) && isString(value.id) && isString(value.text) &&
    isNonNegativeInteger(value.position) && isString(value.chapter_id) &&
    isNonNegativeInteger(value.chapter_index) &&
    isNullableString(value.chapter_title) && isString(value.source_excerpt) &&
    isLookupEntitySummary(value.entity);
}
export function isRecapResponse(value: unknown): value is RecapResponse {
  return isRecord(value) && isNonNegativeInteger(value.position) &&
    isArrayOf(value.events, isRecapEvent) &&
    isArrayOf(value.characters, isEntityListItem);
}
export function isNotesExportResponse(value: unknown): value is NotesExportResponse {
  function isNotesExportEntity(entity: unknown): entity is NotesExportEntity {
    return isRecord(entity) &&
      isLookupEntitySummary(entity) &&
      isArrayOf(entity.aliases, isEntityAlias) &&
      isArrayOf(entity.facts, isLookupFact);
  }

  return isRecord(value) && isString(value.book_id) && isString(value.title) &&
    isNullableString(value.author) && isNullableString(value.language) &&
    isNonNegativeInteger(value.position) &&
    isArrayOf(value.entities, isNotesExportEntity) &&
    isArrayOf(value.relationships, isLookupRelationship) &&
    isArrayOf(value.events, isRecapEvent);
}
