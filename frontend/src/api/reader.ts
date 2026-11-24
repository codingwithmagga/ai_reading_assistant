import type { ChapterContent, ReadingProgress } from "../apiTypes";
import { isChapterContent, isReadingProgress } from "./apiValidation";
import { requestJson } from "./apiRequest";

export function getChapterContent(bookId: string, chapterId: string): Promise<ChapterContent> {
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

export function saveReadingProgress(bookId: string, position: number): Promise<ReadingProgress> {
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
