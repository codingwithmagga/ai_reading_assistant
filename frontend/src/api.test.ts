import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getBookEntities,
  getBookRecap,
  lookupBookEntity,
} from "./api";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("notes API client", () => {
  it("requests entities with a required position and optional type", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response("[]", {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await getBookEntities("book/one", 4, "person");

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/books/book%2Fone/entities?position=4&type=person",
      undefined,
    );
  });

  it("encodes lookup text and always sends the requested position", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ query: "Marta & Co", position: 15, matches: [] }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await lookupBookEntity("book-id", "Marta & Co", 15);

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/books/book-id/lookup?q=Marta+%26+Co&position=15",
      undefined,
    );
    expect(response).toEqual({ query: "Marta & Co", position: 15, matches: [] });
  });

  it("requests recap with an explicit position", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ position: 0, events: [], characters: [] }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await getBookRecap("book-id", 0);

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/books/book-id/recap?position=0",
      undefined,
    );
  });

  it("rejects invalid positions before issuing a request", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    expect(() => getBookRecap("book-id", -1)).toThrow(RangeError);
    expect(() => getBookEntities("book-id", Number.NaN)).toThrow(RangeError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("preserves structured API errors for query requests", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            detail: {
              code: "invalid_reading_position",
              message: "Invalid position.",
            },
          }),
          {
            status: 422,
            headers: { "Content-Type": "application/json" },
          },
        ),
      ),
    );

    await expect(getBookRecap("book-id", 5)).rejects.toMatchObject({
      code: "invalid_reading_position",
      message: "Invalid position.",
    });
  });
});
