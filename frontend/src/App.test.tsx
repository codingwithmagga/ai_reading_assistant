import {
  act,
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

const extractionJob: api.ExtractionJob = {
  id: "job-1",
  book_id: book.id,
  type: "extraction",
  status: "pending",
  progress: 0,
  max_chapter_index: null,
  last_completed_chapter_index: null,
  last_completed_block_index: null,
  error_code: null,
  error: null,
  input_tokens: 0,
  output_tokens: 0,
  created_at: "2026-11-11T00:00:00Z",
};

let systemThemeListener: ((event: MediaQueryListEvent) => void) | undefined;

beforeEach(() => {
  window.localStorage.clear();
  systemThemeListener = undefined;
  const themeColor = document.createElement("meta");
  themeColor.name = "theme-color";
  document.head.append(themeColor);
  Object.defineProperty(window.navigator, "onLine", {
    configurable: true,
    value: true,
  });
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => {
      const mediaQuery = {
        matches: false,
        media: "(prefers-color-scheme: dark)",
        onchange: null,
        addEventListener: (
          _type: string,
          listener: (event: MediaQueryListEvent) => void,
        ) => {
          systemThemeListener = listener;
        },
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      };
      return mediaQuery as unknown as MediaQueryList;
    }),
  );
  vi.spyOn(api, "getBooks").mockResolvedValue([]);
  vi.spyOn(api, "getBookJobs").mockResolvedValue([]);
  vi.spyOn(api, "startExtractionJob").mockResolvedValue(extractionJob);
  vi.spyOn(api, "uploadBook").mockResolvedValue({
    ...book,
    source_hash: "test-hash",
    reused: false,
    error: null,
  });
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
  vi.spyOn(api, "getBookNotesExport").mockResolvedValue({
    book_id: book.id,
    title: book.title,
    author: book.author,
    language: book.language,
    position: 0,
    entities: [],
    relationships: [],
    events: [],
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
  document
    .querySelectorAll('meta[name="theme-color"]')
    .forEach((meta) => meta.remove());
  vi.useRealTimers();
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
  it("starts extraction for a parsed book through the selected chapter", async () => {
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
      {
        id: "chapter-2",
        book_id: book.id,
        index: 1,
        title: "Second chapter",
        start_position: 2,
        end_position: 3,
      },
    ]);

    render(<App />);

    const extractionLimit = await screen.findByLabelText("Extraktion bis");
    fireEvent.change(extractionLimit, { target: { value: "1" } });
    fireEvent.click(screen.getByRole("button", { name: "Extraktion starten" }));

    await waitFor(() => {
      expect(api.startExtractionJob).toHaveBeenCalledWith(book.id, 1);
    });
    expect(await screen.findByText(/Wartet/)).toBeInTheDocument();
    expect(
      screen.getByRole("progressbar", { name: "Extraktionsfortschritt" }),
    ).toHaveAttribute("value", "0");
    expect(
      screen.queryByRole("button", { name: "Extraktion starten" }),
    ).not.toBeInTheDocument();
  });

  it("shows active extraction status and progress without another start action", async () => {
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
    vi.mocked(api.getBookJobs).mockResolvedValue([
      { ...extractionJob, status: "running", progress: 35 },
    ]);

    render(<App />);

    expect(await screen.findByText(/Läuft/)).toBeInTheDocument();
    expect(
      screen.getByRole("progressbar", { name: "Extraktionsfortschritt" }),
    ).toHaveAttribute("value", "35");
    expect(screen.queryByLabelText("Extraktion bis")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Extraktion starten" }),
    ).not.toBeInTheDocument();
  });

  it("explains an extraction error and retries the failed chapter limit", async () => {
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
    vi.mocked(api.getBookJobs).mockResolvedValue([
      {
        ...extractionJob,
        status: "error",
        max_chapter_index: 0,
        error_code: "OpenAIError",
        error: "Internal provider detail",
      },
    ]);
    vi.mocked(api.startExtractionJob).mockResolvedValue({
      ...extractionJob,
      max_chapter_index: 0,
    });

    render(<App />);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Die KI-Extraktion ist fehlgeschlagen.",
    );
    expect(screen.getByRole("alert")).not.toHaveTextContent(
      "Internal provider detail",
    );
    fireEvent.click(screen.getByRole("button", { name: "Extraktion erneut versuchen" }));

    await waitFor(() => {
      expect(api.startExtractionJob).toHaveBeenCalledWith(book.id, 0);
    });
  });

  it("does not offer extraction for a book that has not been parsed", async () => {
    vi.mocked(api.getBooks).mockResolvedValue([{ ...book, status: "parsing" }]);
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

    render(<App />);

    expect(await screen.findByRole("heading", { name: "Test Book" })).toBeVisible();
    expect(screen.queryByLabelText("Extraktion bis")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Extraktion starten" }),
    ).not.toBeInTheDocument();
  });

  it("translates extraction controls into English", async () => {
    window.localStorage.setItem("ui-language", "en");
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

    render(<App />);

    expect(await screen.findByLabelText("Extract through")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Start extraction" }),
    ).toBeInTheDocument();
  });

  it("shows a first-load error without showing an empty-library state, then recovers", async () => {
    vi.mocked(api.getBooks)
      .mockReset()
      .mockRejectedValueOnce(new Error("server unavailable"))
      .mockResolvedValueOnce([]);

    render(<App />);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Die Anfrage ist fehlgeschlagen.",
    );
    expect(screen.queryByText(/Noch keine Bücher/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Erneut versuchen" }));

    expect(await screen.findByText(/Noch keine Bücher/)).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(api.getBooks).toHaveBeenCalledTimes(2);
  });

  it("keeps an upload retryable after a server error", async () => {
    vi.mocked(api.uploadBook).mockRejectedValueOnce(
      new Error("server unavailable"),
    );

    render(<App />);
    await screen.findByText(/Noch keine Bücher/);
    const file = new File(["epub"], "retry.epub", {
      type: "application/epub+zip",
    });
    fireEvent.change(screen.getByLabelText("EPUB-Datei auswählen"), {
      target: { files: [file] },
    });
    fireEvent.click(screen.getByRole("button", { name: "EPUB hochladen" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Das Buch konnte nicht hochgeladen werden.",
    );
    expect(screen.getByLabelText("EPUB-Datei auswählen")).toBeEnabled();

    fireEvent.click(screen.getByRole("button", { name: "EPUB hochladen" }));

    expect(await screen.findByRole("status")).toHaveTextContent(
      "Buch wurde hochgeladen.",
    );
  });

  it("offers a retry when the reader cannot load chapters", async () => {
    vi.mocked(api.getBooks).mockResolvedValue([book]);
    vi.mocked(api.getChapters)
      .mockResolvedValueOnce([])
      .mockRejectedValueOnce(new Error("server unavailable"))
      .mockResolvedValueOnce([]);

    render(<App />);
    await screen.findByRole("heading", { name: "Test Book" });
    fireEvent.click(screen.getByRole("button", { name: "Lesen" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Die Anfrage ist fehlgeschlagen.",
    );
    fireEvent.click(screen.getByRole("button", { name: "Erneut versuchen" }));

    expect(await screen.findByText(/keine lesbaren Kapitel/)).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(api.getChapters).toHaveBeenCalledTimes(3);
  });

  it("follows the system theme until a user choice is saved", () => {
    const { unmount } = render(<App />);
    const themePicker = screen.getByRole("combobox", { name: "Darstellung" });

    expect(themePicker).toHaveValue("system");
    expect(document.documentElement.dataset.theme).toBe("light");

    act(() => systemThemeListener?.({ matches: true } as MediaQueryListEvent));
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(
      document.querySelector('meta[name="theme-color"]'),
    ).toHaveAttribute("content", "#171915");

    fireEvent.change(themePicker, { target: { value: "light" } });
    expect(window.localStorage.getItem("ui-theme")).toBe("light");
    expect(document.documentElement.dataset.theme).toBe("light");

    act(() => systemThemeListener?.({ matches: true } as MediaQueryListEvent));
    expect(document.documentElement.dataset.theme).toBe("light");

    unmount();
    render(<App />);
    expect(screen.getByRole("combobox", { name: "Darstellung" })).toHaveValue(
      "light",
    );
    expect(document.documentElement.dataset.theme).toBe("light");
  });

  it("uses a saved dark theme on startup", () => {
    window.localStorage.setItem("ui-theme", "dark");

    render(<App />);

    expect(screen.getByRole("combobox", { name: "Darstellung" })).toHaveValue(
      "dark",
    );
    expect(document.documentElement.dataset.theme).toBe("dark");
  });

  it("explains that library data requires a server connection while offline", () => {
    vi.mocked(api.getBooks)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([book]);
    Object.defineProperty(window.navigator, "onLine", {
      configurable: true,
      value: false,
    });

    render(<App />);

    expect(
      screen.getByText(/Du bist offline/),
    ).toBeInTheDocument();

    Object.defineProperty(window.navigator, "onLine", {
      configurable: true,
      value: true,
    });
    act(() => window.dispatchEvent(new Event("online")));

    expect(screen.queryByText(/Du bist offline/)).not.toBeInTheDocument();
    return waitFor(() => {
      expect(screen.getByRole("heading", { name: "Test Book" })).toBeVisible();
      expect(api.getBooks).toHaveBeenCalledTimes(2);
    });
  });

  it("keeps the existing library visible when a refresh fails and retries", async () => {
    vi.mocked(api.getBooks)
      .mockReset()
      .mockResolvedValueOnce([book])
      .mockRejectedValueOnce(new Error("server unavailable"))
      .mockResolvedValueOnce([book]);

    render(<App />);
    expect(await screen.findByRole("heading", { name: "Test Book" })).toBeVisible();

    fireEvent.change(screen.getByRole("combobox", { name: "Sprache" }), {
      target: { value: "en" },
    });

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "The request failed.",
    );
    expect(screen.getByRole("heading", { name: "Test Book" })).toBeVisible();
    expect(screen.queryByText(/No books yet/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Try again" }));

    await waitFor(() => {
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });
    expect(screen.getByRole("heading", { name: "Test Book" })).toBeVisible();
    expect(api.getBooks).toHaveBeenCalledTimes(3);
  });

  it("waits for the reader to accept a service-worker update", () => {
    const updateServiceWorker = vi.fn().mockResolvedValue(undefined);
    render(<App updateServiceWorker={updateServiceWorker} />);

    act(() => window.dispatchEvent(new Event("pwa-update-available")));
    expect(screen.getByText("Ein App-Update ist verfügbar.")).toBeInTheDocument();
    expect(updateServiceWorker).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Jetzt aktualisieren" }));
    expect(updateServiceWorker).toHaveBeenCalledOnce();
  });

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
    vi.useFakeTimers();

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
    await act(async () => {
      await vi.advanceTimersByTimeAsync(600);
    });
    expect(api.saveReadingProgress).not.toHaveBeenCalled();
    vi.useRealTimers();

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
    const lookupResponse: api.EntityLookupResponse = {
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
    };
    let resolveLookup!: (response: api.EntityLookupResponse) => void;
    vi.spyOn(api, "lookupBookEntity").mockReturnValue(
      new Promise((resolve) => {
        resolveLookup = resolve;
      }),
    );

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
    fireEvent.submit(
      screen.getByLabelText("Figur, Ort oder Begriff").closest("form")!,
    );
    expect(api.lookupBookEntity).toHaveBeenCalledTimes(1);
    resolveLookup(lookupResponse);

    expect(
      await screen.findByRole("heading", { name: "Liora" }),
    ).toBeInTheDocument();
    expect(api.lookupBookEntity).toHaveBeenCalledWith(book.id, "Liora", 1);
    expect(screen.getByText("<script>not executable</script>")).toBeInTheDocument();
    expect(
      screen.getByText("<img src=x onerror=alert(1)>"),
    ).toBeInTheDocument();
    expect(document.querySelector("script, img")).toBeNull();
  });

  it("exports notes at the active notes position in JSON and Markdown", async () => {
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
      paragraphs: [],
    });
    vi.mocked(api.getBookNotesExport).mockResolvedValue({
      book_id: book.id,
      title: "<Test Book>",
      author: "Test Author",
      language: "en",
      position: 1,
      entities: [
        {
          id: "entity-1",
          type: "person",
          canonical_name: "<Liora>",
          first_position: 0,
          aliases: [{ alias: "*Traveler*", first_position: 1 }],
          facts: [
            {
              id: "fact-1",
              text: "Finds a key.",
              kind: "event",
              position: 1,
              chapter_id: "chapter-1",
              chapter_index: 0,
              chapter_title: "First chapter",
              source_excerpt: "<img src=x onerror=alert(1)>",
            },
          ],
        },
      ],
      relationships: [],
      events: [],
    });
    const downloads: string[] = [];
    const createdBlobs: Blob[] = [];
    vi.stubGlobal("URL", {
      createObjectURL: vi.fn((blob: Blob) => {
        createdBlobs.push(blob);
        return "blob:test";
      }),
      revokeObjectURL: vi.fn(),
    });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      downloads.push(this.download);
    });

    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "Lesen" }));
    await screen.findByText("Folgt der aktuellen Leseposition im Reader.");
    fireEvent.change(screen.getByLabelText("Absatz im Kapitel"), {
      target: { value: "2" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Position übernehmen" }));

    fireEvent.click(screen.getByRole("button", { name: "JSON herunterladen" }));
    await waitFor(() => {
      expect(api.getBookNotesExport).toHaveBeenCalledWith(book.id, 1);
    });
    fireEvent.click(screen.getByRole("button", { name: "Markdown herunterladen" }));
    await waitFor(() => {
      expect(api.getBookNotesExport).toHaveBeenCalledTimes(2);
    });

    expect(downloads).toEqual(["test-book-notes.json", "test-book-notes.md"]);
    expect(createdBlobs).toHaveLength(2);
    expect(createdBlobs[0].type).toBe("application/json;charset=utf-8");
    expect(createdBlobs[1].type).toBe("text/markdown;charset=utf-8");
    const markdown = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.readAsText(createdBlobs[1]);
    });
    expect(markdown).toContain("# &lt;Test Book&gt;");
    expect(markdown).toContain("### &lt;Liora&gt;");
    expect(markdown).toContain("\\*Traveler\\*");
    expect(markdown).toContain("&lt;img src=x onerror=alert\\(1\\)&gt;");
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

  it("keeps the reader usable and retries when a notes request fails", async () => {
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
      paragraphs: [
        {
          id: "paragraph-0",
          chapter_id: "chapter-1",
          position: 0,
          text: "The reader remains available.",
        },
      ],
    });
    vi.mocked(api.getBookEntities)
      .mockRejectedValueOnce(new Error("network down"))
      .mockResolvedValue([]);

    render(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "Lesen" }));

    expect(await screen.findByText("The reader remains available.")).toBeInTheDocument();
    expect(
      await screen.findByText(/Notizen konnten nicht geladen/),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Erneut versuchen" }));

    expect(
      await screen.findByText(/Bis zu dieser Position sind keine Figuren bekannt/),
    ).toBeInTheDocument();
    expect(api.getBookEntities).toHaveBeenCalledTimes(2);
    expect(screen.getByText("The reader remains available.")).toBeInTheDocument();
  });
});
