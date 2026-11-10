import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "./api";
import { App } from "./App";

const book: api.Book = {
  id: "book-1",
  title: "Test Book",
  author: "Test Author",
  language: "en",
  created_at: "2026-11-10T00:00:00Z",
  status: "parsed",
};

beforeEach(() => {
  window.localStorage.clear();
  vi.spyOn(api, "getBooks").mockResolvedValue([]);
  vi.spyOn(api, "uploadBook").mockResolvedValue({ ...book, reused: false });
  vi.spyOn(api, "getChapters").mockResolvedValue([]);
  vi.spyOn(api, "getReadingProgress").mockResolvedValue({
    book_id: book.id,
    current_position: null,
  });
  vi.spyOn(api, "getBookEntities").mockResolvedValue([]);
  vi.spyOn(api, "getBookRecap").mockResolvedValue({
    position: 0,
    events: [],
    characters: [],
  });
  vi.spyOn(api, "getChapterContent").mockResolvedValue({
    id: "chapter-1",
    book_id: book.id,
    index: 0,
    title: "Chapter",
    start_position: 0,
    end_position: 0,
    paragraphs: [],
  });
  vi.spyOn(api, "saveReadingProgress").mockResolvedValue({
    book_id: book.id,
    current_position: 0,
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

class TestIntersectionObserver {
  static latest: TestIntersectionObserver;
  root: Element | Document | null = null;
  rootMargin = "0px";
  thresholds: ReadonlyArray<number> = [];

  constructor(
    private readonly callback: IntersectionObserverCallback,
  ) {
    TestIntersectionObserver.latest = this;
  }

  observe() {}

  disconnect() {}

  unobserve() {}

  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }

  trigger(target: Element) {
    const entry = {
      boundingClientRect: target.getBoundingClientRect(),
      intersectionRatio: 1,
      intersectionRect: target.getBoundingClientRect(),
      isIntersecting: true,
      rootBounds: null,
      target,
      time: 0,
    } as IntersectionObserverEntry;
    this.callback([entry], this as unknown as IntersectionObserver);
  }
}

describe("App", () => {
  it("defaults to German and persists the selected interface language", () => {
    const { unmount } = render(<App />);

    expect(
      screen.getByRole("heading", { name: "Spoilerfreier Lesebegleiter" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/aktuellen Leseposition/)).toBeInTheDocument();

    fireEvent.change(screen.getByRole("combobox", { name: "Sprache" }), {
      target: { value: "en" },
    });

    expect(
      screen.getByRole("heading", { name: "Spoiler-Free Reading Assistant" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/current reading position/)).toBeInTheDocument();
    expect(window.localStorage.getItem("ui-language")).toBe("en");

    unmount();
    render(<App />);
    expect(
      screen.getByRole("heading", { name: "Spoiler-Free Reading Assistant" }),
    ).toBeInTheDocument();
  });

  it("uploads a book and restores the reader to its saved paragraph", async () => {
    vi.stubGlobal("IntersectionObserver", TestIntersectionObserver);
    vi.mocked(api.getBooks)
      .mockResolvedValueOnce([])
      .mockResolvedValue([book]);
    vi.mocked(api.getChapters).mockResolvedValue([
      {
        id: "chapter-1",
        book_id: book.id,
        index: 0,
        title: "First chapter",
        start_position: 0,
        end_position: 1,
      },
      {
        id: "chapter-2",
        book_id: book.id,
        index: 1,
        title: "Second chapter",
        start_position: 2,
        end_position: 3,
      },
    ]);
    vi.mocked(api.getReadingProgress).mockResolvedValue({
      book_id: book.id,
      current_position: 3,
    });
    vi.mocked(api.getChapterContent).mockResolvedValue({
      id: "chapter-2",
      book_id: book.id,
      index: 1,
      title: "Second chapter",
      start_position: 2,
      end_position: 3,
      paragraphs: [
        {
          id: "paragraph-2",
          chapter_id: "chapter-2",
          position: 2,
          text: "A paragraph.",
        },
        {
          id: "paragraph-3",
          chapter_id: "chapter-2",
          position: 3,
          text: "The restored paragraph.",
        },
      ],
    });

    render(<App />);
    await screen.findByText(/Noch keine Bücher/);

    const file = new File(["epub"], "test.epub", {
      type: "application/epub+zip",
    });
    fireEvent.change(screen.getByLabelText("EPUB-Datei auswählen"), {
      target: { files: [file] },
    });
    fireEvent.click(screen.getByRole("button", { name: "EPUB hochladen" }));

    await screen.findByRole("heading", { name: "Test Book" });
    expect(api.uploadBook).toHaveBeenCalledWith(file);
    fireEvent.click(screen.getByRole("button", { name: "Lesen" }));

    expect(await screen.findByText("The restored paragraph.")).toBeInTheDocument();
    expect(screen.getByText(/Leseposition:/)).toHaveTextContent("4 von 4");
    expect(api.getChapterContent).toHaveBeenCalledWith(book.id, "chapter-2");

    await waitFor(() => {
      expect(api.saveReadingProgress).toHaveBeenCalledWith(book.id, 3);
    });
    vi.mocked(api.saveReadingProgress).mockClear();

    fireEvent.change(screen.getByLabelText("Kapitel für Notizen"), {
      target: { value: "chapter-1" },
    });
    fireEvent.change(screen.getByLabelText("Absatz im Kapitel"), {
      target: { value: "2" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Position übernehmen" }));

    expect(screen.getByText(/Manuelle Position aktiv/)).toHaveTextContent(
      "Manuelle Position aktiv",
    );
    expect(screen.getByText("2 von 4")).toBeInTheDocument();
    expect(screen.getByText(/Leseposition:/)).toHaveTextContent("4 von 4");
    await new Promise((resolve) => window.setTimeout(resolve, 600));
    expect(api.saveReadingProgress).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText("Eingabemethode"), {
      target: { value: "percentage" },
    });
    fireEvent.change(screen.getByLabelText("Fortschritt in Prozent"), {
      target: { value: "101" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Position übernehmen" }));
    expect(screen.getByRole("alert")).toHaveTextContent("zwischen 0 und 100");

    fireEvent.change(screen.getByLabelText("Fortschritt in Prozent"), {
      target: { value: "50" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Position übernehmen" }));
    expect(screen.getByText("3 von 4")).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Reader-Position verwenden" }),
    );
    expect(screen.getByText(/Folgt der aktuellen Leseposition/)).toHaveTextContent(
      "Folgt der aktuellen Leseposition",
    );
    expect(screen.getByText("4 von 4")).toBeInTheDocument();

    const readerScroll = document.querySelector(".reader-scroll");
    const firstParagraph = screen.getByText("A paragraph.");
    expect(readerScroll).not.toBeNull();
    vi.spyOn(readerScroll as HTMLDivElement, "getBoundingClientRect").mockReturnValue(
      { top: 0, bottom: 100 } as DOMRect,
    );
    vi.spyOn(firstParagraph, "getBoundingClientRect").mockReturnValue({
      top: 10,
      bottom: 40,
    } as DOMRect);
    TestIntersectionObserver.latest.trigger(firstParagraph);

    await waitFor(() => {
      expect(api.saveReadingProgress).toHaveBeenCalledWith(book.id, 2);
    });
  });

  it("looks up the entered term at the manual position and renders result data as text", async () => {
    vi.stubGlobal("IntersectionObserver", TestIntersectionObserver);
    vi.mocked(api.getBooks).mockResolvedValue([book]);
    vi.mocked(api.getChapters).mockResolvedValue([
      {
        id: "chapter-1",
        book_id: book.id,
        index: 0,
        title: "First chapter",
        start_position: 0,
        end_position: 1,
      },
    ]);
    vi.mocked(api.getReadingProgress).mockResolvedValue({
      book_id: book.id,
      current_position: 0,
    });
    vi.mocked(api.getChapterContent).mockResolvedValue({
      id: "chapter-1",
      book_id: book.id,
      index: 0,
      title: "First chapter",
      start_position: 0,
      end_position: 1,
      paragraphs: [
        {
          id: "paragraph-0",
          chapter_id: "chapter-1",
          position: 0,
          text: "Liora enters the room.",
        },
        {
          id: "paragraph-1",
          chapter_id: "chapter-1",
          position: 1,
          text: "She notices a map.",
        },
      ],
    });
    vi.spyOn(api, "lookupBookEntity").mockResolvedValue({
      query: "Liora",
      position: 1,
      matches: [
        {
          entity: {
            id: "entity-1",
            type: "person",
            canonical_name: "Liora",
            first_position: 0,
          },
          aliases: [{ alias: "the traveler", first_position: 1 }],
          facts: [
            {
              id: "fact-1",
              text: "<script>not executable</script>",
              kind: "description",
              position: 1,
              chapter_id: "chapter-1",
              chapter_index: 0,
              chapter_title: "First chapter",
              source_excerpt: "<img src=x onerror=alert(1)>",
            },
          ],
          relationships: [],
        },
      ],
    });

    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "Lesen" }));
    await screen.findByText("She notices a map.");

    fireEvent.change(screen.getByLabelText("Absatz im Kapitel"), {
      target: { value: "2" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Position übernehmen" }));
    fireEvent.change(screen.getByLabelText("Figur, Ort oder Begriff"), {
      target: { value: "Liora" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Suchen" }));

    expect(await screen.findByRole("heading", { name: "Liora" })).toBeInTheDocument();
    expect(api.lookupBookEntity).toHaveBeenCalledWith(book.id, "Liora", 1);
    expect(screen.getByText("<script>not executable</script>")).toBeInTheDocument();
    expect(
      screen.getByText("<img src=x onerror=alert(1)>"),
    ).toBeInTheDocument();
    expect(document.querySelector("script, img")).toBeNull();
  });

  it("prefills selected text and searches using the selected paragraph position", async () => {
    vi.stubGlobal("IntersectionObserver", TestIntersectionObserver);
    vi.mocked(api.getBooks).mockResolvedValue([book]);
    vi.mocked(api.getChapters).mockResolvedValue([
      {
        id: "chapter-1",
        book_id: book.id,
        index: 0,
        title: "First chapter",
        start_position: 0,
        end_position: 1,
      },
    ]);
    vi.mocked(api.getReadingProgress).mockResolvedValue({
      book_id: book.id,
      current_position: 0,
    });
    vi.mocked(api.getChapterContent).mockResolvedValue({
      id: "chapter-1",
      book_id: book.id,
      index: 0,
      title: "First chapter",
      start_position: 0,
      end_position: 1,
      paragraphs: [
        {
          id: "paragraph-0",
          chapter_id: "chapter-1",
          position: 0,
          text: "Liora enters the room.",
        },
        {
          id: "paragraph-1",
          chapter_id: "chapter-1",
          position: 1,
          text: "She notices a map.",
        },
      ],
    });
    vi.spyOn(api, "lookupBookEntity").mockResolvedValue({
      query: "notices a map",
      position: 1,
      matches: [],
    });

    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "Lesen" }));
    const paragraph = await screen.findByText("She notices a map.");
    const range = document.createRange();
    range.selectNodeContents(paragraph);
    window.getSelection()?.removeAllRanges();
    window.getSelection()?.addRange(range);
    fireEvent.mouseUp(screen.getByLabelText("Buchtext"));

    expect(screen.getByLabelText("Figur, Ort oder Begriff")).toHaveValue(
      "She notices a map.",
    );
    expect(screen.getByText(/Markierter Text wird an Position 2 gesucht/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Suchen" }));

    expect(await screen.findByText(/Keine passenden Einträge/)).toBeInTheDocument();
    expect(api.lookupBookEntity).toHaveBeenCalledWith(
      book.id,
      "She notices a map.",
      1,
    );
  });

  it("shows a localized error when the entity lookup fails", async () => {
    vi.stubGlobal("IntersectionObserver", TestIntersectionObserver);
    vi.mocked(api.getBooks).mockResolvedValue([book]);
    vi.mocked(api.getChapters).mockResolvedValue([
      {
        id: "chapter-1",
        book_id: book.id,
        index: 0,
        title: "First chapter",
        start_position: 0,
        end_position: 0,
      },
    ]);
    vi.mocked(api.getReadingProgress).mockResolvedValue({
      book_id: book.id,
      current_position: 0,
    });
    vi.mocked(api.getChapterContent).mockResolvedValue({
      id: "chapter-1",
      book_id: book.id,
      index: 0,
      title: "First chapter",
      start_position: 0,
      end_position: 0,
      paragraphs: [],
    });
    vi.spyOn(api, "lookupBookEntity").mockRejectedValue(new Error("network down"));

    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "Lesen" }));
    await screen.findByLabelText("Figur, Ort oder Begriff");
    fireEvent.change(screen.getByLabelText("Figur, Ort oder Begriff"), {
      target: { value: "Liora" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Suchen" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Die Suche ist fehlgeschlagen. Die Anfrage ist fehlgeschlagen.",
    );
  });

  it("loads known characters and chronological recap at the active notes position", async () => {
    vi.stubGlobal("IntersectionObserver", TestIntersectionObserver);
    vi.mocked(api.getBooks).mockResolvedValue([book]);
    vi.mocked(api.getChapters).mockResolvedValue([
      {
        id: "chapter-1",
        book_id: book.id,
        index: 0,
        title: "First chapter",
        start_position: 0,
        end_position: 1,
      },
    ]);
    vi.mocked(api.getReadingProgress).mockResolvedValue({
      book_id: book.id,
      current_position: 0,
    });
    vi.mocked(api.getChapterContent).mockResolvedValue({
      id: "chapter-1",
      book_id: book.id,
      index: 0,
      title: "First chapter",
      start_position: 0,
      end_position: 1,
      paragraphs: [
        {
          id: "paragraph-0",
          chapter_id: "chapter-1",
          position: 0,
          text: "Liora enters.",
        },
        {
          id: "paragraph-1",
          chapter_id: "chapter-1",
          position: 1,
          text: "Liora finds the key.",
        },
      ],
    });
    vi.mocked(api.getBookEntities).mockResolvedValue([
      {
        id: "liora",
        type: "person",
        canonical_name: "Liora",
        first_position: 0,
        aliases: [{ alias: "the traveler", first_position: 1 }],
      },
    ]);
    vi.mocked(api.getBookRecap).mockResolvedValue({
      position: 1,
      characters: [],
      events: [
        {
          id: "event-1",
          text: "Liora finds a key.",
          position: 1,
          chapter_id: "chapter-1",
          chapter_index: 0,
          chapter_title: "First chapter",
          source_excerpt: "She found a small key.",
          entity: {
            id: "liora",
            type: "person",
            canonical_name: "Liora",
            first_position: 0,
          },
        },
      ],
    });

    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "Lesen" }));
    await screen.findByText("Liora");
    expect(api.getBookEntities).toHaveBeenLastCalledWith(book.id, 0, "person");
    expect(api.getBookRecap).toHaveBeenLastCalledWith(book.id, 0);

    fireEvent.change(screen.getByLabelText("Absatz im Kapitel"), {
      target: { value: "2" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Position übernehmen" }));

    expect(await screen.findByText("Liora finds a key.")).toBeInTheDocument();
    expect(screen.getByText("Liora").closest("li")).toHaveTextContent(
      "the traveler",
    );
    expect(screen.getByText("She found a small key.")).toBeInTheDocument();
    await waitFor(() => {
      expect(api.getBookEntities).toHaveBeenLastCalledWith(
        book.id,
        1,
        "person",
      );
      expect(api.getBookRecap).toHaveBeenLastCalledWith(book.id, 1);
    });

    vi.mocked(api.getBookEntities).mockImplementation(
      () => new Promise<api.EntityListItem[]>(() => {}),
    );
    vi.mocked(api.getBookRecap).mockImplementation(
      () => new Promise<api.RecapResponse>(() => {}),
    );
    fireEvent.change(screen.getByLabelText("Absatz im Kapitel"), {
      target: { value: "1" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Position übernehmen" }));

    expect(await screen.findByText("Figuren werden geladen …")).toBeInTheDocument();
    expect(screen.queryByText("Liora", { selector: "strong" })).toBeNull();
    expect(screen.queryByText("Liora finds a key.")).toBeNull();
  });
});
