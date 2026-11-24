import type { Chapter, ExtractionJob } from "../apiTypes";
import { isArrayOf, isChapter, isExtractionJob } from "./apiValidation";
import { requestJson } from "./apiRequest";

export function getBookJobs(bookId: string): Promise<ExtractionJob[]> {
  return requestJson(
    `/books/${encodeURIComponent(bookId)}/jobs`,
    (value): value is ExtractionJob[] => isArrayOf(value, isExtractionJob),
  );
}

export function startExtractionJob(
  bookId: string,
  maxChapterIndex: number | null,
  minChapterIndex = 0,
): Promise<ExtractionJob> {
  if (
    !Number.isSafeInteger(minChapterIndex) || minChapterIndex < 0 ||
    (maxChapterIndex !== null &&
      (!Number.isSafeInteger(maxChapterIndex) || maxChapterIndex < minChapterIndex))
  ) {
    throw new RangeError("Chapter index must be a non-negative safe integer.");
  }
  return requestJson(
    `/books/${encodeURIComponent(bookId)}/extraction-jobs`,
    isExtractionJob,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ min_chapter_index: minChapterIndex, max_chapter_index: maxChapterIndex }),
    },
  );
}

export function getChapters(bookId: string): Promise<Chapter[]> {
  return requestJson(
    `/books/${encodeURIComponent(bookId)}/chapters`,
    (value): value is Chapter[] => isArrayOf(value, isChapter),
  );
}
