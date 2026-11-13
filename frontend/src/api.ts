export interface Book {
  id: string;
  title: string;
  author: string | null;
  language: string | null;
  created_at: string;
  status: string;
}

export interface UploadedBook extends Book {
  source_hash: string;
  reused: boolean;
  error: string | null;
}

export type ExtractionJobStatus = "pending" | "running" | "completed" | "error";

export interface ExtractionJob {
  id: string;
  book_id: string;
  type: string;
  status: ExtractionJobStatus;
  progress: number;
  max_chapter_index: number | null;
  last_completed_chapter_index: number | null;
  last_completed_block_index: number | null;
  error_code: string | null;
  error: string | null;
  input_tokens: number;
  output_tokens: number;
  created_at: string;
}

export interface Chapter {
  id: string;
  book_id: string;
  index: number;
  title: string | null;
  start_position: number;
  end_position: number;
}

export interface Paragraph {
  id: string;
  chapter_id: string;
  position: number;
  text: string;
}

export interface ChapterContent extends Chapter {
  paragraphs: Paragraph[];
}

export interface ReadingProgress {
  book_id: string;
  current_position: number | null;
}

export type EntityType = "person" | "place" | "group" | "object" | "concept";
export type FactKind = "description" | "relationship" | "event" | "motivation";

export interface EntityAlias {
  alias: string;
  first_position: number;
}

export interface EntityListItem {
  id: string;
  type: EntityType;
  canonical_name: string;
  first_position: number;
  aliases: EntityAlias[];
}

export interface LookupEntitySummary {
  id: string;
  type: EntityType;
  canonical_name: string;
  first_position: number;
}

export interface LookupFact {
  id: string;
  text: string;
  kind: FactKind;
  position: number;
  chapter_id: string;
  chapter_index: number;
  chapter_title: string | null;
  source_excerpt: string;
}

export interface LookupRelationship {
  id: string;
  entity_a: LookupEntitySummary;
  entity_b: LookupEntitySummary;
  label: string;
  position: number;
}

export interface EntityLookupMatch {
  entity: LookupEntitySummary;
  aliases: EntityAlias[];
  facts: LookupFact[];
  relationships: LookupRelationship[];
}

export interface EntityLookupResponse {
  query: string;
  position: number;
  matches: EntityLookupMatch[];
}

export interface RecapEvent {
  id: string;
  text: string;
  position: number;
  chapter_id: string;
  chapter_index: number;
  chapter_title: string | null;
  source_excerpt: string;
  entity: LookupEntitySummary;
}

export interface RecapResponse {
  position: number;
  events: RecapEvent[];
  characters: EntityListItem[];
}

export interface NotesExportEntity extends LookupEntitySummary {
  aliases: EntityAlias[];
  facts: LookupFact[];
}

export interface NotesExportResponse {
  book_id: string;
  title: string;
  author: string | null;
  language: string | null;
  position: number;
  entities: NotesExportEntity[];
  relationships: LookupRelationship[];
  events: RecapEvent[];
}

interface ApiErrorDetail {
  code?: string;
  message?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function isNullableString(value: unknown): value is string | null {
  return value === null || isString(value);
}

function isNonNegativeInteger(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= 0
  );
}

function isNullableNonNegativeInteger(value: unknown): value is number | null {
  return value === null || isNonNegativeInteger(value);
}

function isArrayOf<T>(
  value: unknown,
  isItem: (item: unknown) => item is T,
): value is T[] {
  return Array.isArray(value) && value.every(isItem);
}

function isBook(value: unknown): value is Book & Record<string, unknown> {
  return (
    isRecord(value) &&
    isString(value.id) &&
    isString(value.title) &&
    isNullableString(value.author) &&
    isNullableString(value.language) &&
    isString(value.created_at) &&
    isString(value.status)
  );
}

function isUploadedBook(value: unknown): value is UploadedBook {
  return (
    isBook(value) &&
    isString(value.source_hash) &&
    typeof value.reused === "boolean" &&
    isNullableString(value.error)
  );
}

function isExtractionJob(value: unknown): value is ExtractionJob {
  return (
    isRecord(value) &&
    isString(value.id) &&
    isString(value.book_id) &&
    isString(value.type) &&
    (value.status === "pending" ||
      value.status === "running" ||
      value.status === "completed" ||
      value.status === "error") &&
    isNonNegativeInteger(value.progress) &&
    value.progress <= 100 &&
    isNullableNonNegativeInteger(value.max_chapter_index) &&
    isNullableNonNegativeInteger(value.last_completed_chapter_index) &&
    isNullableNonNegativeInteger(value.last_completed_block_index) &&
    isNullableString(value.error_code) &&
    isNullableString(value.error) &&
    isNonNegativeInteger(value.input_tokens) &&
    isNonNegativeInteger(value.output_tokens) &&
    isString(value.created_at)
  );
}

function isChapter(value: unknown): value is Chapter & Record<string, unknown> {
  return (
    isRecord(value) &&
    isString(value.id) &&
    isString(value.book_id) &&
    isNonNegativeInteger(value.index) &&
    isNullableString(value.title) &&
    isNonNegativeInteger(value.start_position) &&
    isNonNegativeInteger(value.end_position) &&
    value.start_position <= value.end_position
  );
}

function isParagraph(value: unknown): value is Paragraph {
  return (
    isRecord(value) &&
    isString(value.id) &&
    isString(value.chapter_id) &&
    isNonNegativeInteger(value.position) &&
    isString(value.text)
  );
}

function isChapterContent(value: unknown): value is ChapterContent {
  return (
    isChapter(value) &&
    isArrayOf(value.paragraphs, isParagraph) &&
    value.paragraphs.every(
      (paragraph) =>
        paragraph.chapter_id === value.id &&
        paragraph.position >= value.start_position &&
        paragraph.position <= value.end_position,
    )
  );
}

function isReadingProgress(value: unknown): value is ReadingProgress {
  return (
    isRecord(value) &&
    isString(value.book_id) &&
    (value.current_position === null ||
      isNonNegativeInteger(value.current_position))
  );
}

function isEntityType(value: unknown): value is EntityType {
  return (
    value === "person" ||
    value === "place" ||
    value === "group" ||
    value === "object" ||
    value === "concept"
  );
}

function isFactKind(value: unknown): value is FactKind {
  return (
    value === "description" ||
    value === "relationship" ||
    value === "event" ||
    value === "motivation"
  );
}

function isEntityAlias(value: unknown): value is EntityAlias {
  return (
    isRecord(value) &&
    isString(value.alias) &&
    isNonNegativeInteger(value.first_position)
  );
}

function isEntityListItem(value: unknown): value is EntityListItem {
  return (
    isRecord(value) &&
    isString(value.id) &&
    isEntityType(value.type) &&
    isString(value.canonical_name) &&
    isNonNegativeInteger(value.first_position) &&
    isArrayOf(value.aliases, isEntityAlias)
  );
}

function isLookupEntitySummary(value: unknown): value is LookupEntitySummary {
  return (
    isRecord(value) &&
    isString(value.id) &&
    isEntityType(value.type) &&
    isString(value.canonical_name) &&
    isNonNegativeInteger(value.first_position)
  );
}

function isLookupFact(value: unknown): value is LookupFact {
  return (
    isRecord(value) &&
    isString(value.id) &&
    isString(value.text) &&
    isFactKind(value.kind) &&
    isNonNegativeInteger(value.position) &&
    isString(value.chapter_id) &&
    isNonNegativeInteger(value.chapter_index) &&
    isNullableString(value.chapter_title) &&
    isString(value.source_excerpt)
  );
}

function isLookupRelationship(value: unknown): value is LookupRelationship {
  return (
    isRecord(value) &&
    isString(value.id) &&
    isLookupEntitySummary(value.entity_a) &&
    isLookupEntitySummary(value.entity_b) &&
    isString(value.label) &&
    isNonNegativeInteger(value.position)
  );
}

function isEntityLookupMatch(value: unknown): value is EntityLookupMatch {
  return (
    isRecord(value) &&
    isLookupEntitySummary(value.entity) &&
    isArrayOf(value.aliases, isEntityAlias) &&
    isArrayOf(value.facts, isLookupFact) &&
    isArrayOf(value.relationships, isLookupRelationship)
  );
}

function isEntityLookupResponse(value: unknown): value is EntityLookupResponse {
  return (
    isRecord(value) &&
    isString(value.query) &&
    isNonNegativeInteger(value.position) &&
    isArrayOf(value.matches, isEntityLookupMatch)
  );
}

function isRecapEvent(value: unknown): value is RecapEvent {
  return (
    isRecord(value) &&
    isString(value.id) &&
    isString(value.text) &&
    isNonNegativeInteger(value.position) &&
    isString(value.chapter_id) &&
    isNonNegativeInteger(value.chapter_index) &&
    isNullableString(value.chapter_title) &&
    isString(value.source_excerpt) &&
    isLookupEntitySummary(value.entity)
  );
}

function isRecapResponse(value: unknown): value is RecapResponse {
  return (
    isRecord(value) &&
    isNonNegativeInteger(value.position) &&
    isArrayOf(value.events, isRecapEvent) &&
    isArrayOf(value.characters, isEntityListItem)
  );
}

function isNotesExportEntity(value: unknown): value is NotesExportEntity {
  if (!isRecord(value)) {
    return false;
  }
  const aliases = value.aliases;
  const facts = value.facts;
  return (
    isLookupEntitySummary(value) &&
    isArrayOf(aliases, isEntityAlias) &&
    isArrayOf(facts, isLookupFact)
  );
}

function isNotesExportResponse(value: unknown): value is NotesExportResponse {
  return (
    isRecord(value) &&
    isString(value.book_id) &&
    isString(value.title) &&
    isNullableString(value.author) &&
    isNullableString(value.language) &&
    isNonNegativeInteger(value.position) &&
    isArrayOf(value.entities, isNotesExportEntity) &&
    isArrayOf(value.relationships, isLookupRelationship) &&
    isArrayOf(value.events, isRecapEvent)
  );
}

export class ApiError extends Error {
  readonly code: string | undefined;

  constructor(message: string, code?: string) {
    super(message);
    this.name = "ApiError";
    this.code = code;
  }
}

function validateReadingPosition(position: number): void {
  if (!Number.isSafeInteger(position) || position < 0) {
    throw new RangeError("Reading position must be a non-negative safe integer.");
  }
}

function responseError(payload: unknown, status: number): ApiError {
  const rawDetail = isRecord(payload) ? payload.detail : undefined;
  const detail: ApiErrorDetail | undefined = isRecord(rawDetail)
    ? {
        code: typeof rawDetail.code === "string" ? rawDetail.code : undefined,
        message: typeof rawDetail.message === "string" ? rawDetail.message : undefined,
      }
    : undefined;
  return new ApiError(
    detail?.message ?? `The request failed with status ${status}.`,
    detail?.code,
  );
}

async function requestJson<T>(
  path: string,
  isResponse: (value: unknown) => value is T,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(`/api${path}`, init);
  const responseText = await response.text();
  let payload: unknown;

  if (responseText) {
    try {
      payload = JSON.parse(responseText);
    } catch {
      throw new ApiError(
        response.ok
          ? "The server returned an invalid response."
          : `The request failed with status ${response.status}.`,
      );
    }
  }

  if (!response.ok) {
    throw responseError(payload, response.status);
  }

  if (payload === undefined) {
    throw new ApiError("The server returned an empty response.");
  }
  if (!isResponse(payload)) {
    throw new ApiError("The server returned an invalid response.");
  }
  return payload;
}

export function getBooks(): Promise<Book[]> {
  return requestJson("/books", (value): value is Book[] =>
    isArrayOf(value, isBook),
  );
}

export function uploadBook(file: File): Promise<UploadedBook> {
  const body = new FormData();
  body.append("file", file);
  return requestJson("/books", isUploadedBook, { method: "POST", body });
}

export async function getBackup(): Promise<Blob> {
  const response = await fetch("/api/backup");
  if (!response.ok) {
    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw responseError(undefined, response.status);
    }
    throw responseError(payload, response.status);
  }
  return response.blob();
}

export function restoreBackup(file: File): Promise<{ restored: number }> {
  const body = new FormData();
  body.append("file", file);
  return requestJson(
    "/backup",
    (value): value is { restored: number } =>
      isRecord(value) && isNonNegativeInteger(value.restored),
    { method: "POST", body },
  );
}

export function getBookJobs(bookId: string): Promise<ExtractionJob[]> {
  return requestJson(
    `/books/${encodeURIComponent(bookId)}/jobs`,
    (value): value is ExtractionJob[] => isArrayOf(value, isExtractionJob),
  );
}

export function startExtractionJob(
  bookId: string,
  maxChapterIndex: number | null,
): Promise<ExtractionJob> {
  if (
    maxChapterIndex !== null &&
    (!Number.isSafeInteger(maxChapterIndex) || maxChapterIndex < 0)
  ) {
    throw new RangeError("Chapter index must be a non-negative safe integer.");
  }
  return requestJson(
    `/books/${encodeURIComponent(bookId)}/extraction-jobs`,
    isExtractionJob,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ max_chapter_index: maxChapterIndex }),
    },
  );
}

export function getChapters(bookId: string): Promise<Chapter[]> {
  return requestJson(
    `/books/${encodeURIComponent(bookId)}/chapters`,
    (value): value is Chapter[] => isArrayOf(value, isChapter),
  );
}

export function getChapterContent(
  bookId: string,
  chapterId: string,
): Promise<ChapterContent> {
  return requestJson(
    `/books/${encodeURIComponent(bookId)}/content/${encodeURIComponent(chapterId)}`,
    isChapterContent,
  );
}

export function getReadingProgress(bookId: string): Promise<ReadingProgress> {
  return requestJson(
    `/books/${encodeURIComponent(bookId)}/progress`,
    isReadingProgress,
  );
}

export function saveReadingProgress(
  bookId: string,
  position: number,
): Promise<ReadingProgress> {
  return requestJson(
    `/books/${encodeURIComponent(bookId)}/progress`,
    isReadingProgress,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ position }),
    },
  );
}

export function getBookEntities(
  bookId: string,
  position: number,
  entityType?: EntityType,
): Promise<EntityListItem[]> {
  validateReadingPosition(position);
  const params = new URLSearchParams({ position: String(position) });
  if (entityType) {
    params.set("type", entityType);
  }
  return requestJson(
    `/books/${encodeURIComponent(bookId)}/entities?${params.toString()}`,
    (value): value is EntityListItem[] => isArrayOf(value, isEntityListItem),
  );
}

export function lookupBookEntity(
  bookId: string,
  query: string,
  position: number,
): Promise<EntityLookupResponse> {
  validateReadingPosition(position);
  const params = new URLSearchParams({
    q: query,
    position: String(position),
  });
  return requestJson(
    `/books/${encodeURIComponent(bookId)}/lookup?${params.toString()}`,
    isEntityLookupResponse,
  );
}

export function getBookRecap(
  bookId: string,
  position: number,
): Promise<RecapResponse> {
  validateReadingPosition(position);
  const params = new URLSearchParams({ position: String(position) });
  return requestJson(
    `/books/${encodeURIComponent(bookId)}/recap?${params.toString()}`,
    isRecapResponse,
  );
}

export function getBookNotesExport(
  bookId: string,
  position: number,
): Promise<NotesExportResponse> {
  validateReadingPosition(position);
  const params = new URLSearchParams({ position: String(position) });
  return requestJson(
    `/books/${encodeURIComponent(bookId)}/export?${params.toString()}`,
    isNotesExportResponse,
  );
}
