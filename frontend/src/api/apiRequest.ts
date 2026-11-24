import type {
  ApiErrorDetail,
} from "./apiValidation";
import { isRecord } from "./apiValidation";

export class ApiError extends Error {
  readonly code: string | undefined;

  constructor(message: string, code?: string) {
    super(message);
    this.name = "ApiError";
    this.code = code;
  }
}

export function validateReadingPosition(position: number): void {
  if (!Number.isSafeInteger(position) || position < 0) {
    throw new RangeError("Reading position must be a non-negative safe integer.");
  }
}

export function responseError(payload: unknown, status: number): ApiError {
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

export async function requestJson<T>(
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
