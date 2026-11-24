import type { Book, UploadedBook } from "../apiTypes";
import {
  isArrayOf,
  isBook,
  isUploadedBook,
  isRecord,
} from "./apiValidation";
import { requestJson, responseError } from "./apiRequest";

export function getBooks(): Promise<Book[]> {
  return requestJson("/books", (value): value is Book[] => isArrayOf(value, isBook));
}

export async function deleteBook(bookId: string): Promise<void> {
  const response = await fetch(`/api/books/${encodeURIComponent(bookId)}`, { method: "DELETE" });
  if (!response.ok) {
    let payload: unknown;
    try { payload = await response.json(); } catch { throw responseError(undefined, response.status); }
    throw responseError(payload, response.status);
  }
}

export function uploadBook(file: File, retryFailed = false): Promise<UploadedBook> {
  const body = new FormData();
  body.append("file", file);
  body.append("retry_failed", String(retryFailed));
  return requestJson("/books", isUploadedBook, { method: "POST", body });
}

export async function getBackup(): Promise<Blob> {
  const response = await fetch("/api/backup");
  if (!response.ok) {
    let payload: unknown;
    try { payload = await response.json(); } catch { throw responseError(undefined, response.status); }
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
      isRecord(value) && typeof value.restored === "number" &&
      Number.isSafeInteger(value.restored) && value.restored >= 0,
    { method: "POST", body },
  );
}
