import { FormEvent, useCallback, useEffect, useState } from "react";
import { Book, getBooks, uploadBook } from "./api";
import { Reader } from "./Reader";
import {
  Language,
  getErrorMessage,
  getSavedLanguage,
  getStatusLabel,
  isLanguage,
  translations,
} from "./i18n";

interface AppProps {
  updateServiceWorker?: () => Promise<void>;
}

export function App({ updateServiceWorker }: AppProps = {}) {
  const [language, setLanguage] = useState<Language>(getSavedLanguage);
  const [books, setBooks] = useState<Book[]>([]);
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

  useEffect(() => {
    window.localStorage.setItem("ui-language", language);
    document.documentElement.lang = language;
    document.title = translations[language].heading;
  }, [language]);

  useEffect(() => {
    const updateOnlineStatus = () => setIsOnline(navigator.onLine);
    const showUpdateAvailable = () => setUpdateAvailable(true);

    window.addEventListener("online", updateOnlineStatus);
    window.addEventListener("offline", updateOnlineStatus);
    window.addEventListener("pwa-update-available", showUpdateAvailable);
    return () => {
      window.removeEventListener("online", updateOnlineStatus);
      window.removeEventListener("offline", updateOnlineStatus);
      window.removeEventListener("pwa-update-available", showUpdateAvailable);
    };
  }, []);

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
                      {copy.status}: {getStatusLabel(book.status, copy)}
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
