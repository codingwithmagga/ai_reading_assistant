import { useCallback, useEffect, useRef, useState } from "react";
import {
  Book,
  getBooks,
  deleteBook,
} from "./api";
import { Reader } from "./Reader";
import {
  Language,
  getErrorMessage,
  getSavedLanguage,
  isLanguage,
  translations,
} from "./i18n";
import { UploadSection } from "./UploadSection";
import { BackupSection } from "./BackupSection";
import { LibraryView } from "./LibraryView";
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
  const [backupBusy, setBackupBusy] = useState(false);
  const [deletingBookId, setDeletingBookId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleteMessage, setDeleteMessage] = useState<string | null>(null);
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

  async function removeBook(book: Book) {
    if (!window.confirm(copy.deleteBookConfirm)) {
      return;
    }
    setDeletingBookId(book.id);
    setDeleteError(null);
    setDeleteMessage(null);
    try {
      await deleteBook(book.id);
      setDeleteMessage(copy.deleteBookSuccess);
      await refreshBooks();
    } catch (error) {
      setDeleteError(`${copy.deleteBookFailed} ${getErrorMessage(error, copy)}`);
    } finally {
      setDeletingBookId(null);
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
          <BackupSection
            copy={copy}
            disabled={backupBusy}
            onRestored={() => refreshBooks()}
            onBusyChange={setBackupBusy}
          />
          <UploadSection
            copy={copy}
            disabled={backupBusy}
            onUploaded={() => refreshBooks()}
          />
          <LibraryView
            copy={copy}
            books={books}
            loading={booksLoading}
            error={booksError}
            deletingBookId={deletingBookId}
            deleteError={deleteError}
            deleteMessage={deleteMessage}
            backupBusy={backupBusy}
            uploading={false}
            onRetry={() => void refreshBooks()}
            onDismissError={() => setBooksError(null)}
            onOpen={setSelectedBook}
            onDelete={(book) => void removeBook(book)}
          />
        </section>
      )}
    </main>
  );
}
