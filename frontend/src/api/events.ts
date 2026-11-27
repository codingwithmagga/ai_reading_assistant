import { TimelineEvent } from "../apiTypes";
import { isArrayOf } from "./apiValidation";
import { requestJson, validateReadingPosition } from "./apiRequest";
import { isTimelineEvent } from "./apiValidation";

export async function getBookEvents(
  bookId: string,
  position: number | null = null,
  limit: number = 50,
  offset: number = 0
): Promise<TimelineEvent[]> {
  if (position !== null) {
    validateReadingPosition(position);
  }

  const params = new URLSearchParams();
  if (position !== null) {
    params.append("position", position.toString());
  }
  params.append("limit", limit.toString());
  params.append("offset", offset.toString());

  const url = `/books/${encodeURIComponent(bookId)}/events?${params.toString()}`;
  return requestJson(
    url,
    (value): value is TimelineEvent[] => isArrayOf(value, isTimelineEvent),
  );
}
