import {
  FormEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  ApiError,
  Book,
  Chapter,
  ChapterContent,
  EntityListItem,
  EntityLookupResponse,
  RecapResponse,
  getBooks,
  getBookEntities,
  getBookRecap,
  getChapterContent,
  getChapters,
  getReadingProgress,
  lookupBookEntity,
  saveReadingProgress,
  uploadBook,
} from "./api";

const translations = {
  de: {
    heading: "Spoilerfreier Lesebegleiter",
    description:
      "Deine Notizen bleiben auf dem Stand deiner aktuellen Leseposition.",
    language: "Sprache",
    readerContent: "Buchtext",
    library: "Bibliothek",
    upload: "EPUB hochladen",
    chooseFile: "EPUB-Datei auswählen",
    noFile: "Keine Datei ausgewählt",
    uploading: "Wird hochgeladen …",
    uploadSuccess: "Buch wurde hochgeladen.",
    duplicateSuccess: "Dieses Buch war bereits vorhanden.",
    uploadError: "Das Buch konnte nicht hochgeladen werden.",
    loadingBooks: "Bücher werden geladen …",
    retry: "Erneut versuchen",
    emptyLibrary: "Noch keine Bücher. Lade ein DRM-freies EPUB hoch.",
    openBook: "Lesen",
    author: "Autor",
    status: "Status",
    statuses: {
      uploaded: "Hochgeladen",
      parsing: "Wird verarbeitet",
      extracting: "Notizen werden erstellt",
      parsed: "Bereit zum Lesen",
      ready: "Bereit",
      error: "Fehler",
    },
    backToLibrary: "Zurück zur Bibliothek",
    loadingReader: "Leser wird geladen …",
    loadingChapter: "Kapitel wird geladen …",
    noChapters: "Dieses Buch enthält keine lesbaren Kapitel.",
    chapter: "Kapitel",
    selectChapter: "Kapitel auswählen",
    readingPosition: "Leseposition",
    positionOf: "von",
    notesPosition: "Position für Notizen",
    readerPositionActive: "Folgt der aktuellen Leseposition im Reader.",
    manualPositionActive: "Manuelle Position aktiv; der Reader-Fortschritt bleibt unverändert.",
    manualPosition: "Position manuell festlegen",
    positionMethod: "Eingabemethode",
    byChapter: "Kapitel und Absatz",
    byPercentage: "Prozent im Buch",
    positionChapter: "Kapitel für Notizen",
    paragraphInChapter: "Absatz im Kapitel",
    percentage: "Fortschritt in Prozent",
    applyPosition: "Position übernehmen",
    followReader: "Reader-Position verwenden",
    positionRangeError: "Wert muss zwischen {min} und {max} liegen.",
    invalidPositionValue: "Bitte gib eine gültige Zahl im erlaubten Bereich ein.",
    savePending: "Leseposition wird gespeichert …",
    saveFailed: "Leseposition konnte nicht gespeichert werden.",
    apiError: "Die Anfrage ist fehlgeschlagen.",
    invalidPosition: "Diese Leseposition ist für das Buch ungültig.",
    uploadTooLarge: "Die EPUB-Datei überschreitet die erlaubte Größe.",
    invalidEpub: "Die Datei ist kein gültiges, lesbares EPUB.",
    serverBookNotFound: "Das Buch wurde nicht gefunden.",
    notesPanel: "Notizen und Nachschlagen",
    emptySearchQuery: "Bitte gib einen Namen oder Begriff ein.",
    exactMatchHelp: "Suche nach einem exakten Namen oder Alias.",
    searchEntity: "Figur, Ort oder Begriff",
    search: "Suchen",
    clearSearch: "Suche leeren",
    searchLoading: "Suche läuft …",
    noSearchMatches: "Keine passenden Einträge an dieser Leseposition.",
    searchFailed: "Die Suche ist fehlgeschlagen.",
    selectionAtPosition: "Markierter Text wird an Position {position} gesucht.",
    noFacts: "Für diesen Eintrag sind hier noch keine Fakten bekannt.",
    aliases: "Bekannte Namen",
    facts: "Fakten",
    relationships: "Beziehungen",
    source: "Textbeleg",
    positionLabel: "Position",
    chapterLabel: "Kapitel",
    noLookupPosition: "Für die Suche ist keine Leseposition verfügbar.",
    knownCharacters: "Bekannte Figuren",
    noKnownCharacters: "Bis zu dieser Position sind keine Figuren bekannt.",
    loadingCharacters: "Figuren werden geladen …",
    recapTitle: "Was bisher geschah",
    noRecapEvents: "Bis zu dieser Position sind keine Ereignisse bekannt.",
    loadingRecap: "Rückblick wird geladen …",
    notesLoadFailed: "Notizen konnten nicht geladen werden.",
    entityTypes: {
      person: "Person",
      place: "Ort",
      group: "Gruppe",
      object: "Gegenstand",
      concept: "Begriff",
    },
  },
  en: {
    heading: "Spoiler-Free Reading Assistant",
    description:
      "Your notes stay up to date with your current reading position.",
    language: "Language",
    readerContent: "Book text",
    library: "Library",
    upload: "Upload EPUB",
    chooseFile: "Choose an EPUB file",
    noFile: "No file selected",
    uploading: "Uploading …",
    uploadSuccess: "Book uploaded.",
    duplicateSuccess: "This book was already in your library.",
    uploadError: "The book could not be uploaded.",
    loadingBooks: "Loading books …",
    retry: "Try again",
    emptyLibrary: "No books yet. Upload a DRM-free EPUB to get started.",
    openBook: "Read",
    author: "Author",
    status: "Status",
    statuses: {
      uploaded: "Uploaded",
      parsing: "Processing",
      extracting: "Creating notes",
      parsed: "Ready to read",
      ready: "Ready",
      error: "Error",
    },
    backToLibrary: "Back to library",
    loadingReader: "Loading reader …",
    loadingChapter: "Loading chapter …",
    noChapters: "This book has no readable chapters.",
    chapter: "Chapter",
    selectChapter: "Select chapter",
    readingPosition: "Reading position",
    positionOf: "of",
    notesPosition: "Notes position",
    readerPositionActive: "Following the current position in the reader.",
    manualPositionActive: "Manual position active; saved reader progress is unchanged.",
    manualPosition: "Set position manually",
    positionMethod: "Input method",
    byChapter: "Chapter and paragraph",
    byPercentage: "Book percentage",
    positionChapter: "Chapter for notes",
    paragraphInChapter: "Paragraph in chapter",
    percentage: "Book progress in percent",
    applyPosition: "Apply position",
    followReader: "Use reader position",
    positionRangeError: "Value must be between {min} and {max}.",
    invalidPositionValue: "Enter a valid number within the allowed range.",
    savePending: "Saving reading position …",
    saveFailed: "Could not save reading position.",
    apiError: "The request failed.",
    invalidPosition: "This reading position is invalid for the book.",
    uploadTooLarge: "The EPUB file exceeds the allowed size.",
    invalidEpub: "The file is not a valid, readable EPUB.",
    serverBookNotFound: "The book could not be found.",
    notesPanel: "Notes and lookup",
    emptySearchQuery: "Enter a name or concept to search.",
    exactMatchHelp: "Search for an exact name or alias.",
    searchEntity: "Character, place, or concept",
    search: "Search",
    clearSearch: "Clear search",
    searchLoading: "Searching …",
    noSearchMatches: "No matching entries at this reading position.",
    searchFailed: "The search failed.",
    selectionAtPosition: "Selected text will be searched at position {position}.",
    noFacts: "No facts are known for this entry at this position.",
    aliases: "Known names",
    facts: "Facts",
    relationships: "Relationships",
    source: "Source excerpt",
    positionLabel: "Position",
    chapterLabel: "Chapter",
    noLookupPosition: "No reading position is available for lookup.",
    knownCharacters: "Known characters",
    noKnownCharacters: "No characters are known up to this position.",
    loadingCharacters: "Loading characters …",
    recapTitle: "What has happened so far",
    noRecapEvents: "No events are known up to this position.",
    loadingRecap: "Loading recap …",
    notesLoadFailed: "Notes could not be loaded.",
    entityTypes: {
      person: "Person",
      place: "Place",
      group: "Group",
      object: "Object",
      concept: "Concept",
    },
  },
};

type Language = keyof typeof translations;
type Copy = (typeof translations)[Language];

function isLanguage(value: string): value is Language {
  return Object.prototype.hasOwnProperty.call(translations, value);
}

function getErrorMessage(error: unknown, copy: Copy): string {
  if (error instanceof ApiError) {
    switch (error.code) {
      case "invalid_reading_position":
        return copy.invalidPosition;
      case "upload_too_large":
        return copy.uploadTooLarge;
      case "invalid_epub":
        return copy.invalidEpub;
      case "book_not_found":
        return copy.serverBookNotFound;
      default:
        return error.code ? error.message || copy.apiError : copy.apiError;
    }
  }
  return copy.apiError;
}

function getStatusLabel(status: string, copy: Copy): string {
  return Object.entries(copy.statuses).find(([key]) => key === status)?.[1] ?? status;
}

function getEntityTypeLabel(type: string, copy: Copy): string {
  return type in copy.entityTypes
    ? copy.entityTypes[type as keyof Copy["entityTypes"]]
    : type;
}

function getSavedLanguage(): Language {
  const savedLanguage = window.localStorage.getItem("ui-language");
  return savedLanguage && isLanguage(savedLanguage) ? savedLanguage : "de";
}

export function App() {
  const [language, setLanguage] = useState<Language>(getSavedLanguage);
  const [books, setBooks] = useState<Book[]>([]);
  const [selectedBook, setSelectedBook] = useState<Book | null>(null);
  const [booksLoading, setBooksLoading] = useState(true);
  const [booksError, setBooksError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadMessage, setUploadMessage] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const copy = translations[language];

  useEffect(() => {
    window.localStorage.setItem("ui-language", language);
    document.documentElement.lang = language;
    document.title = translations[language].heading;
  }, [language]);

  const refreshBooks = useCallback(async () => {
    setBooksLoading(true);
    setBooksError(null);
    try {
      setBooks(await getBooks());
    } catch (error) {
      setBooksError(getErrorMessage(error, translations[language]));
    } finally {
      setBooksLoading(false);
    }
  }, [language]);

  useEffect(() => {
    void refreshBooks();
  }, [refreshBooks]);

  async function submitUpload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedFile || uploading) {
      return;
    }
    const form = event.currentTarget;
    setUploading(true);
    setUploadError(null);
    setUploadMessage(null);
    try {
      const uploadedBook = await uploadBook(selectedFile);
      setUploadMessage(
        uploadedBook.reused ? copy.duplicateSuccess : copy.uploadSuccess,
      );
      setSelectedFile(null);
      form.reset();
      await refreshBooks();
    } catch (error) {
      setUploadError(getErrorMessage(error, copy));
    } finally {
      setUploading(false);
    }
  }

  return (
    <main className="app-shell" lang={language}>
      <header className="app-header">
        <div>
          <h1>{copy.heading}</h1>
          <p>{copy.description}</p>
        </div>
        <label className="language-picker">
          <span>{copy.language}</span>
          <select
            value={language}
            onChange={(event) => {
              const nextLanguage = event.currentTarget.value;
              if (isLanguage(nextLanguage)) {
                setLanguage(nextLanguage);
              }
            }}
          >
            <option value="de">Deutsch</option>
            <option value="en">English</option>
          </select>
        </label>
      </header>

      {selectedBook ? (
        <Reader
          key={selectedBook.id}
          book={selectedBook}
          copy={copy}
          onBack={() => setSelectedBook(null)}
        />
      ) : (
        <section aria-labelledby="library-heading" className="library">
          <h2 id="library-heading">{copy.library}</h2>
          <form className="upload-form" onSubmit={submitUpload}>
            <label htmlFor="book-file">{copy.chooseFile}</label>
            <input
              id="book-file"
              type="file"
              accept=".epub,application/epub+zip"
              onChange={(event) =>
                setSelectedFile(event.currentTarget.files?.[0] ?? null)
              }
              disabled={uploading}
            />
            <button type="submit" disabled={!selectedFile || uploading}>
              {uploading ? copy.uploading : copy.upload}
            </button>
            <span className="file-name">
              {selectedFile?.name ?? copy.noFile}
            </span>
          </form>

          {uploadError && (
            <p className="message error" role="alert">
              {copy.uploadError} {uploadError}
            </p>
          )}
          {uploadMessage && (
            <p className="message success" role="status">
              {uploadMessage}
            </p>
          )}
          {booksLoading ? (
            <p role="status">{copy.loadingBooks}</p>
          ) : booksError ? (
            <div className="message error" role="alert">
              <p>{booksError}</p>
              <button type="button" onClick={() => void refreshBooks()}>
                {copy.retry}
              </button>
            </div>
          ) : books.length === 0 ? (
            <p className="empty-state">{copy.emptyLibrary}</p>
          ) : (
            <ul className="book-list">
              {books.map((book) => (
                <li className="book-card" key={book.id}>
                  <div className="book-card-copy">
                    <h3>{book.title}</h3>
                    {book.author && (
                      <p>
                        {copy.author}: {book.author}
                      </p>
                    )}
                    <p>
                      {copy.status}:{" "}
                      {getStatusLabel(book.status, copy)}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedBook(book)}
                    disabled={book.status === "error"}
                  >
                    {copy.openBook}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </main>
  );
}

interface ReaderProps {
  book: Book;
  copy: Copy;
  onBack: () => void;
}

function Reader({ book, copy, onBack }: ReaderProps) {
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [selectedChapterId, setSelectedChapterId] = useState<string | null>(
    null,
  );
  const [chapterContent, setChapterContent] =
    useState<ChapterContent | null>(null);
  const [currentPosition, setCurrentPosition] = useState<number | null>(null);
  const [readerLoading, setReaderLoading] = useState(true);
  const [chapterLoading, setChapterLoading] = useState(false);
  const [readerError, setReaderError] = useState<string | null>(null);
  const [progressError, setProgressError] = useState<string | null>(null);
  const [savingProgress, setSavingProgress] = useState(false);
  const [readyToTrack, setReadyToTrack] = useState(false);
  const [restorePosition, setRestorePosition] = useState<number | null>(null);
  const [retrySave, setRetrySave] = useState(0);
  const [retryReader, setRetryReader] = useState(0);
  const [manualPosition, setManualPosition] = useState<number | null>(null);
  const [manualChapterId, setManualChapterId] = useState("");
  const [paragraphInChapter, setParagraphInChapter] = useState("1");
  const [percentage, setPercentage] = useState("0");
  const [positionMethod, setPositionMethod] = useState<"chapter" | "percentage">(
    "chapter",
  );
  const [manualPositionError, setManualPositionError] = useState<string | null>(
    null,
  );
  const [lookupTerm, setLookupTerm] = useState("");
  const [selectedTextPosition, setSelectedTextPosition] = useState<
    number | null
  >(null);
  const [lookupResponse, setLookupResponse] =
    useState<EntityLookupResponse | null>(null);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [characters, setCharacters] = useState<EntityListItem[]>([]);
  const [charactersPosition, setCharactersPosition] = useState<number | null>(
    null,
  );
  const [charactersLoading, setCharactersLoading] = useState(false);
  const [charactersError, setCharactersError] = useState<string | null>(null);
  const [recap, setRecap] = useState<RecapResponse | null>(null);
  const [recapPosition, setRecapPosition] = useState<number | null>(null);
  const [recapLoading, setRecapLoading] = useState(false);
  const [recapError, setRecapError] = useState<string | null>(null);
  const [retryNotes, setRetryNotes] = useState(0);
  const latestPosition = useRef<number | null>(null);
  const lookupRequestId = useRef(0);
  const notesRequestId = useRef(0);
  const activeLookupPositionRef = useRef<number | null>(null);
  const lookupTermRef = useRef("");
  const progressQueue = useRef<Promise<void>>(Promise.resolve());
  const scrollContainer = useRef<HTMLDivElement>(null);
  const copyRef = useRef(copy);
  const activeNotesPosition = manualPosition ?? currentPosition;
  const activeLookupPosition = selectedTextPosition ?? activeNotesPosition;
  activeLookupPositionRef.current = activeLookupPosition;
  const visibleCharacters =
    charactersPosition === activeNotesPosition ? characters : [];
  const visibleRecap =
    recapPosition === activeNotesPosition ? recap : null;

  useEffect(() => {
    copyRef.current = copy;
  }, [copy]);

  useEffect(() => {
    lookupRequestId.current += 1;
    setLookupResponse(null);
    setLookupError(null);
    setLookupLoading(false);
  }, [activeNotesPosition, selectedTextPosition]);

  useEffect(() => {
    setSelectedTextPosition(null);
  }, [activeNotesPosition]);

  useEffect(() => {
    let active = true;
    const requestId = ++notesRequestId.current;
    if (activeNotesPosition === null) {
      setCharacters([]);
      setCharactersPosition(null);
      setRecap(null);
      setRecapPosition(null);
      setCharactersError(null);
      setRecapError(null);
      setCharactersLoading(false);
      setRecapLoading(false);
      return () => {
        active = false;
      };
    }

    const position = activeNotesPosition;
    setCharacters([]);
    setCharactersPosition(null);
    setRecap(null);
    setRecapPosition(null);
    setCharactersLoading(true);
    setRecapLoading(true);
    setCharactersError(null);
    setRecapError(null);

    void Promise.allSettled([
      getBookEntities(book.id, position, "person"),
      getBookRecap(book.id, position),
    ]).then(([charactersResult, recapResult]) => {
      if (!active || requestId !== notesRequestId.current) {
        return;
      }
      if (charactersResult.status === "fulfilled") {
        setCharacters(charactersResult.value);
        setCharactersPosition(position);
      } else {
        setCharactersError(
          getErrorMessage(charactersResult.reason, copyRef.current),
        );
      }
      if (recapResult.status === "fulfilled") {
        setRecap(recapResult.value);
        setRecapPosition(position);
      } else {
        setRecapError(getErrorMessage(recapResult.reason, copyRef.current));
      }
      setCharactersLoading(false);
      setRecapLoading(false);
    });

    return () => {
      active = false;
    };
  }, [activeNotesPosition, book.id, retryNotes]);

  useEffect(() => {
    let active = true;
    async function initializeReader() {
      setReaderLoading(true);
      setReaderError(null);
      try {
        const [loadedChapters, progress] = await Promise.all([
          getChapters(book.id),
          getReadingProgress(book.id),
        ]);
        if (!active) {
          return;
        }
        setChapters(loadedChapters);
        if (loadedChapters.length === 0) {
          setSelectedChapterId(null);
          return;
        }
        const savedPosition = progress.current_position;
        const initialChapter =
          savedPosition === null
            ? loadedChapters[0]
            : loadedChapters.find(
                (chapter) =>
                  savedPosition >= chapter.start_position &&
                  savedPosition <= chapter.end_position,
              );
        if (!initialChapter) {
          throw new ApiError(
            "The saved reading position does not belong to a chapter.",
            "invalid_reading_position",
          );
        }
        const initialPosition = savedPosition ?? initialChapter.start_position;
        setSelectedChapterId(initialChapter.id);
        setManualChapterId(initialChapter.id);
        setParagraphInChapter(
          String(initialPosition - initialChapter.start_position + 1),
        );
        latestPosition.current = initialPosition;
        setCurrentPosition(initialPosition);
        setRestorePosition(initialPosition);
      } catch (error) {
        if (active) {
          setReaderError(getErrorMessage(error, copyRef.current));
        }
      } finally {
        if (active) {
          setReaderLoading(false);
        }
      }
    }
    void initializeReader();
    return () => {
      active = false;
    };
  }, [book.id, retryReader]);

  useEffect(() => {
    if (!selectedChapterId) {
      return;
    }
    let active = true;
    setChapterLoading(true);
    setChapterContent(null);
    setReadyToTrack(false);
    getChapterContent(book.id, selectedChapterId)
      .then((content) => {
        if (active) {
          setChapterContent(content);
        }
      })
      .catch((error: unknown) => {
        if (active) {
          setReaderError(getErrorMessage(error, copyRef.current));
        }
      })
      .finally(() => {
        if (active) {
          setChapterLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [book.id, retryReader, selectedChapterId]);

  useEffect(() => {
    if (!chapterContent || restorePosition === null) {
      return;
    }
    const target = document.getElementById(`paragraph-${restorePosition}`);
    target?.scrollIntoView?.({ block: "start" });
    setRestorePosition(null);
    setReadyToTrack(true);
  }, [chapterContent, restorePosition]);

  useEffect(() => {
    const container = scrollContainer.current;
    if (!container || !chapterContent || !readyToTrack) {
      return;
    }
    const paragraphs = container.querySelectorAll<HTMLElement>(
      "[data-reading-position]",
    );
    if (typeof IntersectionObserver === "undefined") {
      return;
    }
    const observer = new IntersectionObserver(
      () => {
        const containerBounds = container.getBoundingClientRect();
        const visibleParagraphs = Array.from(paragraphs)
          .filter((paragraph) => {
            const bounds = paragraph.getBoundingClientRect();
            return (
              bounds.bottom > containerBounds.top &&
              bounds.top < containerBounds.bottom
            );
          })
          .sort(
            (left, right) =>
              left.getBoundingClientRect().top -
              right.getBoundingClientRect().top,
          );
        const firstVisible = visibleParagraphs[0];
        if (firstVisible instanceof HTMLElement) {
          const position = Number(firstVisible.dataset.readingPosition);
          if (Number.isInteger(position)) {
            latestPosition.current = position;
            setCurrentPosition(position);
          }
        }
      },
      { root: container, threshold: 0.1 },
    );
    paragraphs.forEach((paragraph) => observer.observe(paragraph));
    return () => observer.disconnect();
  }, [chapterContent, readyToTrack]);

  useEffect(() => {
    if (!readyToTrack || currentPosition === null) {
      return;
    }
    const positionToSave = currentPosition;
    const timer = window.setTimeout(() => {
      setSavingProgress(true);
      progressQueue.current = progressQueue.current
        .then(async () => {
          await saveReadingProgress(book.id, positionToSave);
          if (latestPosition.current === positionToSave) {
            setProgressError(null);
            setSavingProgress(false);
          }
        })
        .catch((error: unknown) => {
          if (latestPosition.current === positionToSave) {
            setProgressError(getErrorMessage(error, copyRef.current));
            setSavingProgress(false);
          }
        });
    }, 500);
    return () => window.clearTimeout(timer);
  }, [book.id, currentPosition, readyToTrack, retrySave]);

  function changeChapter(chapter: Chapter) {
    latestPosition.current = chapter.start_position;
    setCurrentPosition(chapter.start_position);
    setRestorePosition(chapter.start_position);
    setSelectedChapterId(chapter.id);
    setManualChapterId(chapter.id);
    setParagraphInChapter("1");
    setReadyToTrack(false);
    setReaderError(null);
  }

  function applyManualPosition(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setManualPositionError(null);
    if (positionMethod === "chapter") {
      const chapter = chapters.find((item) => item.id === manualChapterId);
      const localPosition = Number(paragraphInChapter);
      const paragraphCount = chapter
        ? chapter.end_position - chapter.start_position + 1
        : 0;
      if (
        !chapter ||
        !Number.isInteger(localPosition) ||
        localPosition < 1 ||
        localPosition > paragraphCount
      ) {
        setManualPositionError(
          copy.positionRangeError
            .replace("{min}", "1")
            .replace("{max}", String(paragraphCount)),
        );
        return;
      }
      setManualPosition(chapter.start_position + localPosition - 1);
      return;
    }

    const percent = Number(percentage);
    if (
      percentage.trim() === "" ||
      !Number.isFinite(percent) ||
      percent < 0 ||
      percent > 100
    ) {
      setManualPositionError(
        copy.positionRangeError.replace("{min}", "0").replace("{max}", "100"),
      );
      return;
    }
    const firstPosition = chapters[0].start_position;
    setManualPosition(
      firstPosition +
        Math.round((percent / 100) * (totalPositions - firstPosition)),
    );
  }

  const manualPositionDisplay =
    activeNotesPosition === null ? "—" : activeNotesPosition + 1;

  async function performLookup(query: string, position: number | null) {
    const normalizedQuery = query.trim();
    if (!normalizedQuery) {
      setLookupError(copy.emptySearchQuery);
      setLookupResponse(null);
      return;
    }
    if (position === null) {
      setLookupError(copy.noLookupPosition);
      setLookupResponse(null);
      return;
    }

    const requestId = ++lookupRequestId.current;
    setLookupLoading(true);
    setLookupError(null);
    setLookupResponse(null);
    try {
      const response = await lookupBookEntity(book.id, normalizedQuery, position);
      if (
        requestId === lookupRequestId.current &&
        activeLookupPositionRef.current === position &&
        lookupTermRef.current.trim() === normalizedQuery
      ) {
        setLookupResponse(response);
      }
    } catch (error) {
      if (
        requestId === lookupRequestId.current &&
        activeLookupPositionRef.current === position &&
        lookupTermRef.current.trim() === normalizedQuery
      ) {
        setLookupError(getErrorMessage(error, copyRef.current));
      }
    } finally {
      if (requestId === lookupRequestId.current) {
        setLookupLoading(false);
      }
    }
  }

  function submitLookup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void performLookup(lookupTerm, activeLookupPosition);
  }

  function captureSelectedText() {
    const selection = window.getSelection();
    const selectedText = selection?.toString().trim();
    const focusNode = selection?.focusNode;
    const focusElement =
      focusNode instanceof Element ? focusNode : focusNode?.parentElement;
    const paragraph = focusElement?.closest<HTMLElement>(
      "[data-reading-position]",
    );
    if (
      !selectedText ||
      !paragraph ||
      !scrollContainer.current?.contains(paragraph)
    ) {
      return;
    }

    const position = Number(paragraph.dataset.readingPosition);
    if (!Number.isSafeInteger(position) || position < 0) {
      return;
    }
    lookupRequestId.current += 1;
    lookupTermRef.current = selectedText;
    setLookupTerm(selectedText);
    setSelectedTextPosition(position);
    setLookupResponse(null);
    setLookupError(null);
    setLookupLoading(false);
  }

  function clearLookup() {
    lookupRequestId.current += 1;
    lookupTermRef.current = "";
    setLookupTerm("");
    setSelectedTextPosition(null);
    setLookupResponse(null);
    setLookupError(null);
    setLookupLoading(false);
  }

  if (readerLoading) {
    return <p role="status">{copy.loadingReader}</p>;
  }
  if (readerError) {
    return (
      <section className="reader">
        <button type="button" onClick={onBack}>
          {copy.backToLibrary}
        </button>
        <p className="message error" role="alert">
          {readerError}
        </p>
        <button
          type="button"
          onClick={() => {
            setReaderError(null);
            setRetryReader((attempt) => attempt + 1);
          }}
        >
          {copy.retry}
        </button>
      </section>
    );
  }
  if (chapters.length === 0) {
    return (
      <section className="reader">
        <button type="button" onClick={onBack}>
          {copy.backToLibrary}
        </button>
        <p className="empty-state">{copy.noChapters}</p>
      </section>
    );
  }

  const activeChapter = chapters.find(
    (chapter) => chapter.id === selectedChapterId,
  );
  const totalPositions = chapters[chapters.length - 1]?.end_position ?? 0;
  const manualChapter = chapters.find(
    (chapter) => chapter.id === manualChapterId,
  );
  const manualParagraphCount = manualChapter
    ? manualChapter.end_position - manualChapter.start_position + 1
    : 0;

  return (
    <section className="reader" aria-labelledby="reader-heading">
      <div className="reader-toolbar">
        <button type="button" onClick={onBack}>
          {copy.backToLibrary}
        </button>
        <label>
          <span>{copy.selectChapter}</span>
          <select
            aria-label={copy.selectChapter}
            value={selectedChapterId ?? ""}
            onChange={(event) => {
              const nextChapter = chapters.find(
                (chapter) => chapter.id === event.currentTarget.value,
              );
              if (nextChapter) {
                changeChapter(nextChapter);
              }
            }}
          >
            {chapters.map((chapter) => (
              <option key={chapter.id} value={chapter.id}>
                {chapter.title || `${copy.chapter} ${chapter.index + 1}`}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="reader-heading">
        <h2 id="reader-heading">{book.title}</h2>
        <p>
          {copy.readingPosition}:{" "}
          {currentPosition === null ? "—" : currentPosition + 1} {copy.positionOf}{" "}
          {totalPositions + 1}
        </p>
      </div>
      <section
        className="notes-position"
        aria-labelledby="notes-position-heading"
      >
        <div className="notes-position-status">
          <h3 id="notes-position-heading">{copy.notesPosition}</h3>
          <p role="status">
            {manualPosition === null
              ? copy.readerPositionActive
              : copy.manualPositionActive}
          </p>
          <p>
            {manualPositionDisplay} {copy.positionOf} {totalPositions + 1}
          </p>
          {manualPosition !== null && (
            <button
              type="button"
              onClick={() => {
                setManualPosition(null);
                setManualPositionError(null);
              }}
            >
              {copy.followReader}
            </button>
          )}
        </div>
        <form
          className="manual-position-form"
          noValidate
          onSubmit={applyManualPosition}
        >
          <h4>{copy.manualPosition}</h4>
          <label>
            <span>{copy.positionMethod}</span>
            <select
              value={positionMethod}
              onChange={(event) => {
                if (
                  event.currentTarget.value === "chapter" ||
                  event.currentTarget.value === "percentage"
                ) {
                  setPositionMethod(event.currentTarget.value);
                  setManualPositionError(null);
                }
              }}
            >
              <option value="chapter">{copy.byChapter}</option>
              <option value="percentage">{copy.byPercentage}</option>
            </select>
          </label>
          {positionMethod === "chapter" ? (
            <div className="manual-position-fields">
              <label>
                <span>{copy.positionChapter}</span>
                <select
                  value={manualChapterId}
                  onChange={(event) => {
                    const chapter = chapters.find(
                      (item) => item.id === event.currentTarget.value,
                    );
                    if (chapter) {
                      setManualChapterId(chapter.id);
                      setParagraphInChapter("1");
                    }
                    setManualPositionError(null);
                  }}
                >
                  {chapters.map((chapter) => (
                    <option key={chapter.id} value={chapter.id}>
                      {chapter.title || `${copy.chapter} ${chapter.index + 1}`}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>{copy.paragraphInChapter}</span>
                <input
                  type="number"
                  min={1}
                  max={manualParagraphCount}
                  step={1}
                  value={paragraphInChapter}
                  onChange={(event) => {
                    setParagraphInChapter(event.currentTarget.value);
                    setManualPositionError(null);
                  }}
                />
              </label>
            </div>
          ) : (
            <label>
              <span>{copy.percentage}</span>
              <input
                type="number"
                min={0}
                max={100}
                step="any"
                value={percentage}
                onChange={(event) => {
                  setPercentage(event.currentTarget.value);
                  setManualPositionError(null);
                }}
              />
            </label>
          )}
          {manualPositionError && (
            <p className="message error" role="alert">
              {manualPositionError}
            </p>
          )}
          <button type="submit">{copy.applyPosition}</button>
        </form>
      </section>
      <div className="reader-columns">
        <div className="reader-main">
          {progressError && (
            <div className="message error" role="alert">
              <p>
                {copy.saveFailed} {progressError}
              </p>
              <button
                type="button"
                onClick={() => {
                  setProgressError(null);
                  setRetrySave((attempt) => attempt + 1);
                }}
              >
                {copy.retry}
              </button>
            </div>
          )}
          {!progressError && savingProgress && (
            <p className="save-status" role="status">
              {copy.savePending}
            </p>
          )}
          <div
            className="reader-scroll"
            ref={scrollContainer}
            tabIndex={0}
            aria-label={copy.readerContent}
            onMouseUp={captureSelectedText}
            onKeyUp={captureSelectedText}
          >
            {chapterLoading ? (
              <p role="status">{copy.loadingChapter}</p>
            ) : chapterContent ? (
              <article>
                <h3>
                  {chapterContent.title ||
                    `${copy.chapter} ${chapterContent.index + 1}`}
                </h3>
                {chapterContent.paragraphs.map((paragraph) => (
                  <p
                    key={paragraph.id}
                    id={`paragraph-${paragraph.position}`}
                    data-reading-position={paragraph.position}
                    aria-current={
                      currentPosition === paragraph.position
                        ? "location"
                        : undefined
                    }
                  >
                    {paragraph.text}
                  </p>
                ))}
              </article>
            ) : null}
          </div>
          <p className="chapter-position">
            {activeChapter?.title ||
              `${copy.chapter} ${(activeChapter?.index ?? 0) + 1}`}
          </p>
        </div>
        <aside className="notes-panel" aria-label={copy.notesPanel}>
          <details open>
            <summary>{copy.notesPanel}</summary>
            <form className="lookup-form" onSubmit={submitLookup}>
              <label htmlFor="entity-lookup">{copy.searchEntity}</label>
              <p id="lookup-help" className="help-text">
                {copy.exactMatchHelp}
              </p>
              <input
                id="entity-lookup"
                type="search"
                value={lookupTerm}
                aria-describedby="lookup-help"
                onChange={(event) => {
                  const value = event.currentTarget.value;
                  lookupTermRef.current = value;
                  lookupRequestId.current += 1;
                  setLookupTerm(value);
                  setSelectedTextPosition(null);
                  setLookupResponse(null);
                  setLookupError(null);
                  setLookupLoading(false);
                }}
              />
              {selectedTextPosition !== null && (
                <p className="selection-context" role="status">
                  {copy.selectionAtPosition.replace(
                    "{position}",
                    String(selectedTextPosition + 1),
                  )}
                </p>
              )}
              <div className="lookup-actions">
                <button type="submit" disabled={lookupLoading}>
                  {lookupLoading ? copy.searchLoading : copy.search}
                </button>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={clearLookup}
                  disabled={!lookupTerm && !lookupResponse && !lookupError}
                >
                  {copy.clearSearch}
                </button>
              </div>
            </form>
            {lookupError && (
              <div className="message error" role="alert">
                <p>
                  {copy.searchFailed} {lookupError}
                </p>
                <button
                  type="button"
                  onClick={() =>
                    void performLookup(lookupTerm, activeLookupPosition)
                  }
                  disabled={lookupLoading}
                >
                  {copy.retry}
                </button>
              </div>
            )}
            {lookupLoading && (
              <p role="status">{copy.searchLoading}</p>
            )}
            {lookupResponse && lookupResponse.matches.length === 0 && (
              <p className="empty-state" role="status">
                {copy.noSearchMatches}
              </p>
            )}
            {lookupResponse && lookupResponse.matches.length > 0 && (
              <div className="lookup-results" aria-live="polite">
                {lookupResponse.matches.map((match) => (
                  <article className="lookup-match" key={match.entity.id}>
                    <h3>{match.entity.canonical_name}</h3>
                    <p className="entity-type">
                      {getEntityTypeLabel(match.entity.type, copy)}
                    </p>
                    {match.aliases.length > 0 && (
                      <p>
                        <strong>{copy.aliases}:</strong>{" "}
                        {match.aliases.map((alias) => alias.alias).join(", ")}
                      </p>
                    )}
                    <h4>{copy.facts}</h4>
                    {match.facts.length > 0 ? (
                      <ul className="fact-list">
                        {match.facts.map((fact) => (
                          <li key={fact.id}>
                            <p>{fact.text}</p>
                            <p className="fact-metadata">
                              {fact.kind} · {copy.chapterLabel}{" "}
                              {fact.chapter_title ||
                                fact.chapter_index + 1}{" "}
                              · {copy.positionLabel} {fact.position + 1}
                            </p>
                            <blockquote>
                              <strong>{copy.source}:</strong>{" "}
                              {fact.source_excerpt}
                            </blockquote>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p>{copy.noFacts}</p>
                    )}
                    {match.relationships.length > 0 && (
                      <>
                        <h4>{copy.relationships}</h4>
                        <ul>
                          {match.relationships.map((relationship) => (
                            <li key={relationship.id}>
                              {relationship.entity_a.canonical_name}{" "}
                              {relationship.label}{" "}
                              {relationship.entity_b.canonical_name} (
                              {copy.positionLabel} {relationship.position + 1})
                            </li>
                          ))}
                        </ul>
                      </>
                    )}
                  </article>
                ))}
              </div>
            )}
            <section className="notes-data" aria-labelledby="characters-heading">
              <h3 id="characters-heading">{copy.knownCharacters}</h3>
              {charactersLoading ? (
                <p role="status">{copy.loadingCharacters}</p>
              ) : charactersError ? (
                <div className="message error" role="alert">
                  <p>{copy.notesLoadFailed} {charactersError}</p>
                  <button
                    type="button"
                    onClick={() => setRetryNotes((attempt) => attempt + 1)}
                  >
                    {copy.retry}
                  </button>
                </div>
              ) : visibleCharacters.length === 0 ? (
                <p className="empty-state" role="status">
                  {copy.noKnownCharacters}
                </p>
              ) : (
                <ul className="character-list">
                  {visibleCharacters.map((character) => (
                    <li key={character.id}>
                      <strong>{character.canonical_name}</strong>
                      {character.aliases.length > 0 && (
                        <span>
                          {" "}
                          ({character.aliases
                            .map((alias) => alias.alias)
                            .join(", ")})
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>
            <section className="notes-data" aria-labelledby="recap-heading">
              <h3 id="recap-heading">{copy.recapTitle}</h3>
              {recapLoading ? (
                <p role="status">{copy.loadingRecap}</p>
              ) : recapError ? (
                <div className="message error" role="alert">
                  <p>{copy.notesLoadFailed} {recapError}</p>
                  <button
                    type="button"
                    onClick={() => setRetryNotes((attempt) => attempt + 1)}
                  >
                    {copy.retry}
                  </button>
                </div>
              ) : !visibleRecap || visibleRecap.events.length === 0 ? (
                <p className="empty-state" role="status">
                  {copy.noRecapEvents}
                </p>
              ) : visibleRecap ? (
                <ol className="recap-events">
                  {visibleRecap.events.map((event) => (
                    <li key={event.id}>
                      <p>{event.text}</p>
                      <p className="fact-metadata">
                        {event.entity.canonical_name} · {copy.chapterLabel}{" "}
                        {event.chapter_title || event.chapter_index + 1} ·{" "}
                        {copy.positionLabel} {event.position + 1}
                      </p>
                      <blockquote>
                        <strong>{copy.source}:</strong> {event.source_excerpt}
                      </blockquote>
                    </li>
                  ))}
                </ol>
              ) : null}
            </section>
          </details>
        </aside>
      </div>
    </section>
  );
}
