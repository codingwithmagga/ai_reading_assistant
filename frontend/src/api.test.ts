import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ApiError,
  getBookEntities,
  getBookNotesExport,
  getBookRecap,
  getBooks,
  getChapterContent,
  getChapters,
  getReadingProgress,
  lookupBookEntity,
  uploadBook,
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

  it("requests a notes export at the explicit reading position", async () => {
    const exportResponse = {
      book_id: "book-id",
      title: "Book",
      author: null,
      language: "en",
      position: 3,
      entities: [],
      relationships: [],
      events: [],
    };
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(exportResponse), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(getBookNotesExport("book/one", 3)).resolves.toEqual(
      exportResponse,
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/books/book%2Fone/export?position=3",
      undefined,
    );
  });

  it("rejects malformed nested export data", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            book_id: "book-id",
            title: "Book",
            author: null,
            language: null,
            position: 3,
            entities: [
              {
                id: "entity-id",
                type: "person",
                canonical_name: "Marta",
                first_position: 0,
                aliases: [{ alias: "Marta", first_position: "early" }],
                facts: [],
              },
            ],
            relationships: [],
            events: [],
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        ),
      ),
    );

    await expect(getBookNotesExport("book-id", 3)).rejects.toMatchObject({
      message: "The server returned an invalid response.",
    });
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

  it("rejects successful responses that do not match the book response type", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify([{ id: "book-id", title: 42 }]), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );

    const response = getBooks();

    await expect(response).rejects.toBeInstanceOf(ApiError);
    await expect(response).rejects.toMatchObject({
      message: "The server returned an invalid response.",
    });
  });

  it("validates nested recap fields in successful responses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            position: 2,
            events: [],
            characters: [
              {
                id: "entity-id",
                type: "unknown",
                canonical_name: "Marta",
                first_position: 0,
                aliases: [],
              },
            ],
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        ),
      ),
    );

    await expect(getBookRecap("book-id", 2)).rejects.toMatchObject({
      message: "The server returned an invalid response.",
    });
  });

  it("accepts valid library, upload, chapter, and progress response shapes", async () => {
    const responseBodies = [
      JSON.stringify([
        {
          id: "book-id",
          title: "Book",
          author: null,
          language: "en",
          created_at: "2026-11-10T00:00:00Z",
          status: "parsed",
        },
      ]),
      JSON.stringify({
        id: "book-id",
        title: "Book",
        author: null,
        language: "en",
        created_at: "2026-11-10T00:00:00Z",
        status: "parsed",
        source_hash: "hash",
        reused: false,
        error: null,
      }),
      JSON.stringify([
        {
          id: "chapter-id",
          book_id: "book-id",
          index: 0,
          title: null,
          start_position: 0,
          end_position: 0,
        },
      ]),
      JSON.stringify({
        id: "chapter-id",
        book_id: "book-id",
        index: 0,
        title: null,
        start_position: 0,
        end_position: 0,
        paragraphs: [
          {
            id: "paragraph-id",
            chapter_id: "chapter-id",
            position: 0,
            text: "Text",
          },
        ],
      }),
      JSON.stringify({ book_id: "book-id", current_position: null }),
    ];
    let responseIndex = 0;
    const fetchMock = vi.fn().mockImplementation(() =>
      Promise.resolve(
        new Response(responseBodies[responseIndex++], {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const file = new File(["epub"], "book.epub");

    await expect(getBooks()).resolves.toHaveLength(1);
    await expect(uploadBook(file)).resolves.toMatchObject({
      source_hash: "hash",
      reused: false,
      error: null,
    });
    await expect(getChapters("book-id")).resolves.toHaveLength(1);
    await expect(
      getChapterContent("book-id", "chapter-id"),
    ).resolves.toMatchObject({
      paragraphs: [{ text: "Text" }],
    });
    await expect(getReadingProgress("book-id")).resolves.toEqual({
      book_id: "book-id",
      current_position: null,
    });
  });

  it("rejects malformed nested lookup facts in successful responses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            query: "Marta",
            position: 2,
            matches: [
              {
                entity: {
                  id: "entity-id",
                  type: "person",
                  canonical_name: "Marta",
                  first_position: 0,
                },
                aliases: [],
                facts: [
                  {
                    id: "fact-id",
                    text: "A fact",
                    kind: "unrecognized",
                    position: 1,
                    chapter_id: "chapter-id",
                    chapter_index: 0,
                    chapter_title: null,
                    source_excerpt: "Source",
                  },
                ],
                relationships: [],
              },
            ],
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        ),
      ),
    );

    await expect(lookupBookEntity("book-id", "Marta", 2)).rejects.toMatchObject({
      message: "The server returned an invalid response.",
    });
  });
});
