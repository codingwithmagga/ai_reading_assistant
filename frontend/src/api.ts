export interface Book {
  id: string;
  title: string;
  author: string | null;
  language: string | null;
  created_at: string;
  status: string;
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

interface ApiErrorDetail {
  code?: string;
  message?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
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

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
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
    const rawDetail = isRecord(payload) ? payload.detail : undefined;
    const detail: ApiErrorDetail | undefined = isRecord(rawDetail)
      ? {
          code: typeof rawDetail.code === "string" ? rawDetail.code : undefined,
          message:
            typeof rawDetail.message === "string" ? rawDetail.message : undefined,
        }
      : undefined;
    throw new ApiError(
      detail?.message ?? `The request failed with status ${response.status}.`,
      detail?.code,
    );
  }

  if (payload === undefined) {
    throw new ApiError("The server returned an empty response.");
  }
  return payload as T;
}

export function getBooks(): Promise<Book[]> {
  return requestJson<Book[]>("/books");
}

export function uploadBook(file: File): Promise<Book & { reused: boolean }> {
  const body = new FormData();
  body.append("file", file);
  return requestJson<Book & { reused: boolean }>("/books", {
    method: "POST",
    body,
  });
}

export function getChapters(bookId: string): Promise<Chapter[]> {
  return requestJson<Chapter[]>(`/books/${encodeURIComponent(bookId)}/chapters`);
}

export function getChapterContent(
  bookId: string,
  chapterId: string,
): Promise<ChapterContent> {
  return requestJson<ChapterContent>(
    `/books/${encodeURIComponent(bookId)}/content/${encodeURIComponent(chapterId)}`,
  );
}

export function getReadingProgress(bookId: string): Promise<ReadingProgress> {
  return requestJson<ReadingProgress>(
    `/books/${encodeURIComponent(bookId)}/progress`,
  );
}

export function saveReadingProgress(
  bookId: string,
  position: number,
): Promise<ReadingProgress> {
  return requestJson<ReadingProgress>(
    `/books/${encodeURIComponent(bookId)}/progress`,
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
  return requestJson<EntityListItem[]>(
    `/books/${encodeURIComponent(bookId)}/entities?${params.toString()}`,
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
  return requestJson<EntityLookupResponse>(
    `/books/${encodeURIComponent(bookId)}/lookup?${params.toString()}`,
  );
}

export function getBookRecap(
  bookId: string,
  position: number,
): Promise<RecapResponse> {
  validateReadingPosition(position);
  const params = new URLSearchParams({ position: String(position) });
  return requestJson<RecapResponse>(
    `/books/${encodeURIComponent(bookId)}/recap?${params.toString()}`,
  );
}
