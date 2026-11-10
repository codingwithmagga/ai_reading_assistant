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
