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

    expect(screen.getByRole("status")).toHaveTextContent(
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
    expect(screen.getByRole("status")).toHaveTextContent(
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
});
