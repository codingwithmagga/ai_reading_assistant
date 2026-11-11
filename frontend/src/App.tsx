import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import {
  Book,
  Chapter,
  ExtractionJob,
  getBookJobs,
  getBooks,
  getChapters,
  startExtractionJob,
  uploadBook,
} from "./api";
import { Reader } from "./Reader";
import {
  Copy,
  Language,
  getErrorMessage,
  getSavedLanguage,
  getStatusLabel,
  isLanguage,
  translations,
} from "./i18n";

type Theme = "light" | "dark";
type ThemePreference = "system" | Theme;

interface AppProps {
  updateServiceWorker?: () => Promise<void>;
}

function getThemePreference(): ThemePreference {
  const savedTheme = window.localStorage.getItem("ui-theme");
  return savedTheme === "light" || savedTheme === "dark" ? savedTheme : "system";
}

function getSystemTheme(): Theme {
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

export function App({ updateServiceWorker }: AppProps = {}) {
  const [language, setLanguage] = useState<Language>(getSavedLanguage);
  const [themePreference, setThemePreference] =
    useState<ThemePreference>(getThemePreference);
  const [systemTheme, setSystemTheme] = useState<Theme>(getSystemTheme);
  const [books, setBooks] = useState<Book[]>([]);
  const booksRequestId = useRef(0);
  const [selectedBook, setSelectedBook] = useState<Book | null>(null);
  const [booksLoading, setBooksLoading] = useState(true);
  const [booksError, setBooksError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadMessage, setUploadMessage] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const copy = translations[language];
  const theme = themePreference === "system" ? systemTheme : themePreference;

  useEffect(() => {
    window.localStorage.setItem("ui-language", language);
    document.documentElement.lang = language;
    document.title = translations[language].heading;
  }, [language]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute("content", theme === "dark" ? "#171915" : "#f5f2eb");
  }, [theme]);

  useEffect(() => {
    if (!window.matchMedia) {
      return;
    }

    const colorScheme = window.matchMedia("(prefers-color-scheme: dark)");
    const updateSystemTheme = (event: MediaQueryListEvent) => {
      setSystemTheme(event.matches ? "dark" : "light");
    };

    colorScheme.addEventListener("change", updateSystemTheme);
    return () => colorScheme.removeEventListener("change", updateSystemTheme);
  }, []);

  const refreshBooks = useCallback(async () => {
    const requestId = ++booksRequestId.current;
    setBooksLoading(true);
    setBooksError(null);
    try {
      const currentBooks = await getBooks();
      if (requestId === booksRequestId.current) {
        setBooks(currentBooks);
      }
    } catch (error) {
      if (requestId === booksRequestId.current) {
        setBooksError(getErrorMessage(error, translations[language]));
      }
    } finally {
      if (requestId === booksRequestId.current) {
        setBooksLoading(false);
      }
    }
  }, [language]);

  useEffect(() => {
    const updateOnlineStatus = () => {
      const online = navigator.onLine;
      setIsOnline(online);
      if (online) {
        void refreshBooks();
      }
    };
    const showUpdateAvailable = () => setUpdateAvailable(true);

    window.addEventListener("online", updateOnlineStatus);
    window.addEventListener("offline", updateOnlineStatus);
    window.addEventListener("pwa-update-available", showUpdateAvailable);
    return () => {
      window.removeEventListener("online", updateOnlineStatus);
      window.removeEventListener("offline", updateOnlineStatus);
      window.removeEventListener("pwa-update-available", showUpdateAvailable);
    };
  }, [refreshBooks]);

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
        <div className="header-controls">
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
          <label className="theme-picker">
            <span>{copy.theme}</span>
            <select
              value={themePreference}
              onChange={(event) => {
                const nextTheme = event.currentTarget.value;
                if (
                  nextTheme === "system" ||
                  nextTheme === "light" ||
                  nextTheme === "dark"
                ) {
                  window.localStorage.setItem("ui-theme", nextTheme);
                  setThemePreference(nextTheme);
                }
              }}
            >
              <option value="system">{copy.themeSystem}</option>
              <option value="light">{copy.themeLight}</option>
              <option value="dark">{copy.themeDark}</option>
            </select>
          </label>
        </div>
      </header>

      {!isOnline && (
        <p className="message offline-notice" role="status" aria-live="polite">
          {copy.offlineNotice}
        </p>
      )}
      {updateAvailable && updateServiceWorker && (
        <p className="message update-notice" role="status" aria-live="polite">
          {copy.updateAvailable}{" "}
          <button type="button" onClick={() => void updateServiceWorker()}>
            {copy.updateNow}
          </button>
        </p>
      )}

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
          {booksLoading && (
            <p role="status" aria-live="polite">
              {books.length > 0 ? copy.refreshingBooks : copy.loadingBooks}
            </p>
          )}
          {booksError && (
            <div className="message error" role="alert">
              <p>{booksError}</p>
              <button
                type="button"
                onClick={() => void refreshBooks()}
                disabled={booksLoading}
              >
                {copy.retry}
              </button>
            </div>
          )}
          {!booksLoading && !booksError && books.length === 0 ? (
            <p className="empty-state">{copy.emptyLibrary}</p>
          ) : books.length > 0 ? (
            <ul className="book-list" aria-busy={booksLoading}>
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
                      {copy.status}: {getStatusLabel(book.status, copy)}
                    </p>
                  </div>
                  {["parsed", "extracting", "error", "ready"].includes(
                    book.status,
                  ) && <ExtractionControls book={book} copy={copy} />}
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
          ) : null}
        </section>
      )}
    </main>
  );
}

interface ExtractionControlsProps {
  book: Book;
  copy: Copy;
}

function ExtractionControls({ book, copy }: ExtractionControlsProps) {
  const [chapters, setChapters] = useState<Chapter[] | null>(null);
  const [job, setJob] = useState<ExtractionJob | null>(null);
  const [chapterLimit, setChapterLimit] = useState("all");
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const startingRef = useRef(false);
  const isActive = job?.status === "pending" || job?.status === "running";

  useEffect(() => {
    let active = true;
    setLoading(true);
    Promise.all([getChapters(book.id), getBookJobs(book.id)])
      .then(([bookChapters, jobs]) => {
        if (!active) {
          return;
        }
        const extractionJob = jobs.find((item) => item.type === "extraction") ?? null;
        setChapters(bookChapters);
        setJob(extractionJob);
        setChapterLimit(
          extractionJob !== null &&
            extractionJob.status !== "completed" &&
            extractionJob.max_chapter_index !== null
            ? String(extractionJob.max_chapter_index)
            : "all",
        );
        setError(null);
      })
      .catch(() => {
        if (active) {
          setError(copy.extractionStatusFailed);
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [book.id, copy]);

  useEffect(() => {
    if (!isActive) {
      return;
    }

    let active = true;
    const poll = async () => {
      try {
        const jobs = await getBookJobs(book.id);
        if (active) {
          const extractionJob =
            jobs.find((item) => item.type === "extraction") ?? null;
          setJob(extractionJob);
          if (extractionJob?.status === "completed") {
            setChapterLimit("all");
          }
          setError(null);
        }
      } catch {
        if (active) {
          setError(copy.extractionStatusFailed);
        }
      }
    };
    const interval = window.setInterval(() => void poll(), 1000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [book.id, copy, isActive]);

  async function submitExtraction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (startingRef.current || !chapters?.length) {
      return;
    }

    startingRef.current = true;
    setStarting(true);
    setError(null);
    const maxChapterIndex =
      chapterLimit === "all" ? null : Number(chapterLimit);
    try {
      setJob(await startExtractionJob(book.id, maxChapterIndex));
    } catch (requestError) {
      setError(
        `${copy.extractionRequestFailed} ${getErrorMessage(requestError, copy)}`,
      );
    } finally {
      startingRef.current = false;
      setStarting(false);
    }
  }

  const lastChapter = chapters?.[chapters.length - 1];
  const extractionComplete =
    job?.status === "completed" &&
    (job.max_chapter_index === null ||
      (lastChapter !== undefined && job.max_chapter_index >= lastChapter.index));
  const canStart =
    !loading &&
    !isActive &&
    !extractionComplete &&
    Boolean(chapters?.length) &&
    (book.status === "parsed" || job?.status === "error");
  const submitLabel = starting
    ? copy.extractionCheck
    : job?.status === "error"
      ? copy.retryExtraction
      : job?.status === "completed"
        ? copy.continueExtraction
        : copy.startExtraction;

  return (
    <div className="extraction-controls">
      {loading && (
        <p role="status" aria-live="polite">
          {copy.extractionCheck}
        </p>
      )}
      {error && (
        <p className="message error" role="alert">
          {error}
        </p>
      )}
      {job && (
        <div className="extraction-status" aria-live="polite">
          <p>
            {copy.extractionStatus}: {copy.extractionStatuses[job.status]}
          </p>
          <div className="extraction-progress">
            <progress
              max={100}
              value={job.progress}
              aria-label={copy.extractionProgress}
            />
            <span>{job.progress}%</span>
          </div>
          {job.status === "error" && (
            <p className="message error" role="alert">
              {copy.extractionFailed}
            </p>
          )}
        </div>
      )}
      {canStart && chapters && (
        <form className="extraction-form" onSubmit={submitExtraction}>
          <label htmlFor={`extraction-limit-${book.id}`}>
            {copy.extractionThrough}
          </label>
          <select
            id={`extraction-limit-${book.id}`}
            value={chapterLimit}
            onChange={(event) => setChapterLimit(event.currentTarget.value)}
            disabled={starting}
          >
            <option value="all">{copy.allChapters}</option>
            {chapters
              .filter((chapter) => {
                if (job?.status === "error") {
                  return (
                    job.max_chapter_index !== null &&
                    chapter.index >= job.max_chapter_index
                  );
                }
                if (job?.status === "completed" && job.max_chapter_index !== null) {
                  return chapter.index > job.max_chapter_index;
                }
                return true;
              })
              .map((chapter) => (
                <option key={chapter.id} value={chapter.index}>
                  {chapter.title ?? `${copy.chapter} ${chapter.index + 1}`}
                </option>
              ))}
          </select>
          <button type="submit" disabled={starting}>
            {submitLabel}
          </button>
        </form>
      )}
    </div>
  );
}
