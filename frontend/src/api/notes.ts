import type {
  EntityListItem,
  EntityLookupResponse,
  EntityType,
  NotesExportResponse,
  RecapResponse,
} from "../apiTypes";
import {
  isArrayOf,
  isEntityListItem,
  isEntityLookupResponse,
  isNotesExportResponse,
  isRecapResponse,
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
