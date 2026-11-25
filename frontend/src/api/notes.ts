import type {
  EntityListItem,
  EntityLookupResponse,
  EntityType,
  NotesExportResponse,
  RecapResponse,
  ChapterOverviewResponse,
} from "../apiTypes";
import {
  isArrayOf,
  isEntityListItem,
  isEntityLookupResponse,
  isNotesExportResponse,
  isRecapResponse,
  isChapterOverviewResponse,
} from "./apiValidation";
import { requestJson, validateReadingPosition } from "./apiRequest";

export function getBookEntities(
  bookId: string,
  position: number,
  entityType?: EntityType,
): Promise<EntityListItem[]> {
  validateReadingPosition(position);
  const params = new URLSearchParams({ position: String(position) });
  if (entityType) params.set("type", entityType);
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
  const params = new URLSearchParams({ q: query, position: String(position) });
  return requestJson(
    `/books/${encodeURIComponent(bookId)}/lookup?${params.toString()}`,
    isEntityLookupResponse,
  );
}

export function getBookRecap(bookId: string, position: number): Promise<RecapResponse> {
  validateReadingPosition(position);
  const params = new URLSearchParams({ position: String(position) });
  return requestJson(
    `/books/${encodeURIComponent(bookId)}/recap?${params.toString()}`,
    isRecapResponse,
  );
}

export function getChapterOverview(
  bookId: string,
  position: number,
): Promise<ChapterOverviewResponse> {
  validateReadingPosition(position);
  const params = new URLSearchParams({ position: String(position) });
  return requestJson(
    `/books/${encodeURIComponent(bookId)}/chapter-overview?${params.toString()}`,
    isChapterOverviewResponse,
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
