import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import {
  Box,
  Button,
  Card,
  CardActions,
  CardContent,
  Checkbox,
  FormControl,
  FormControlLabel,
  InputLabel,
  LinearProgress,
  MenuItem,
  Select,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import {
  Book,
  Chapter,
  ExtractionJob,
  getBackup,
  getBookJobs,
  getBooks,
  getChapters,
  deleteBook,
  restoreBackup,
  startExtractionJob,
  uploadBook,
} from "./api";
import { Reader } from "./Reader";
import {
  Copy,
  Language,
  getErrorMessage,
  getExtractionErrorMessage,
  getSavedLanguage,
  getStatusLabel,
  isLanguage,
  translations,
} from "./i18n";
import { ErrorNotice } from "./ErrorNotice";
import { AppThemeProvider } from "./AppThemeProvider";
import { StatusNotice } from "./StatusNotice";

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
  const [retryFailed, setRetryFailed] = useState(false);
  const [backupFile, setBackupFile] = useState<File | null>(null);
  const [backupBusy, setBackupBusy] = useState(false);
  const [backupError, setBackupError] = useState<string | null>(null);
  const [backupMessage, setBackupMessage] = useState<string | null>(null);
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
      const uploadedBook = await uploadBook(selectedFile, retryFailed);
      if (uploadedBook.status === "error" && uploadedBook.error) {
        setUploadError(copy.previousParsingFailed);
        return;
      }
      setUploadMessage(
        uploadedBook.reused ? copy.duplicateSuccess : copy.uploadSuccess,
      );
      setSelectedFile(null);
      setRetryFailed(false);
      form.reset();
      await refreshBooks();
    } catch (error) {
      setUploadError(getErrorMessage(error, copy));
    } finally {
      setUploading(false);
    }
  }

  async function downloadBackup() {
    setBackupBusy(true);
    setBackupError(null);
    setBackupMessage(null);
    try {
      const blob = await getBackup();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "reading-assistant-backup.json";
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      setBackupError(`${copy.backupDownloadFailed} ${getErrorMessage(error, copy)}`);
    } finally {
      setBackupBusy(false);
    }
  }

  async function submitBackup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!backupFile || backupBusy || !window.confirm(copy.backupConfirm)) {
      return;
    }
    const form = event.currentTarget;
    setBackupBusy(true);
    setBackupError(null);
    setBackupMessage(null);
    try {
      await restoreBackup(backupFile);
      setBackupFile(null);
      form.reset();
      setBackupMessage(copy.backupSuccess);
      await refreshBooks();
    } catch (error) {
      setBackupError(`${copy.backupRestoreFailed} ${getErrorMessage(error, copy)}`);
    } finally {
      setBackupBusy(false);
    }
  }

  return (
    <AppThemeProvider mode={theme}>
      <main className="app-shell" lang={language}>
      <Box component="header" className="app-header">
        <Box>
          <Typography component="h1" variant="h4">
            {copy.heading}
          </Typography>
          <Typography color="text.secondary">{copy.description}</Typography>
        </Box>
        <Stack direction="row" spacing={1.5} className="header-controls">
          <FormControl size="small" className="language-picker">
            <InputLabel id="language-picker-label">{copy.language}</InputLabel>
            <Select
              labelId="language-picker-label"
              label={copy.language}
              value={language}
              onChange={(event) => {
                const nextLanguage = String(event.target.value);
                if (isLanguage(nextLanguage)) {
                  setLanguage(nextLanguage);
                }
              }}
            >
              <MenuItem value="de">Deutsch</MenuItem>
              <MenuItem value="en">English</MenuItem>
            </Select>
          </FormControl>
          <FormControl size="small" className="theme-picker">
            <InputLabel id="theme-picker-label">{copy.theme}</InputLabel>
            <Select
              labelId="theme-picker-label"
              label={copy.theme}
              value={themePreference}
              onChange={(event) => {
                const nextTheme = String(event.target.value);
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
              <MenuItem value="system">{copy.themeSystem}</MenuItem>
              <MenuItem value="light">{copy.themeLight}</MenuItem>
              <MenuItem value="dark">{copy.themeDark}</MenuItem>
            </Select>
          </FormControl>
        </Stack>
      </Box>

      {!isOnline && (
        <StatusNotice className="offline-notice">
          {copy.offlineNotice}
        </StatusNotice>
      )}
      {updateAvailable && updateServiceWorker && (
        <StatusNotice
          className="update-notice"
          action={
            <Button
              color="inherit"
              size="small"
              onClick={() => void updateServiceWorker()}
            >
              {copy.updateNow}
            </Button>
          }
        >
          {copy.updateAvailable}
        </StatusNotice>
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
          <Typography component="h2" variant="h5" id="library-heading">
            {copy.library}
          </Typography>
          <Card component="section" variant="outlined" aria-labelledby="backup-heading" sx={{ mb: 2 }}>
            <CardContent>
            <Typography component="h3" variant="h6" id="backup-heading">
              {copy.backupTitle}
            </Typography>
            <Typography color="text.secondary" sx={{ mb: 2 }}>
              {copy.backupHelp}
            </Typography>
            <Button
              onClick={() => void downloadBackup()}
              disabled={backupBusy || uploading}
            >
              {backupBusy ? copy.backupWorking : copy.backupDownload}
            </Button>
            <form className="upload-form" onSubmit={submitBackup}>
              <TextField
                id="backup-file"
                type="file"
                label={copy.backupFile}
                size="small"
                inputProps={{ accept: ".json,application/json" }}
                onChange={(event) =>
                  setBackupFile(
                    (event.target as HTMLInputElement).files?.[0] ?? null,
                  )
                }
                disabled={backupBusy || uploading}
              />
              <Button type="submit" variant="contained" disabled={!backupFile || backupBusy || uploading}>
                {copy.backupRestore}
              </Button>
            </form>
            {backupError && (
              <ErrorNotice copy={copy} message={backupError} onDismiss={() => setBackupError(null)} />
            )}
            {backupMessage && (
              <StatusNotice sx={{ mt: 2 }}>{backupMessage}</StatusNotice>
            )}
            </CardContent>
          </Card>
          <form className="upload-form" onSubmit={submitUpload}>
            <TextField
              id="book-file"
              type="file"
              label={copy.chooseFile}
              size="small"
              inputProps={{ accept: ".epub,application/epub+zip" }}
              onChange={(event) =>
                setSelectedFile(
                  (event.target as HTMLInputElement).files?.[0] ?? null,
                )
              }
              disabled={uploading || backupBusy}
            />
            <FormControlLabel
              className="retry-parsing"
              control={
                <Checkbox
                checked={retryFailed}
                onChange={(event) => setRetryFailed(event.currentTarget.checked)}
                disabled={uploading || backupBusy}
                />
              }
              label={copy.retryFailedParsing}
            />
            <Button type="submit" variant="contained" disabled={!selectedFile || uploading || backupBusy}>
              {uploading ? copy.uploading : copy.upload}
            </Button>
            <Typography component="span" color="text.secondary" className="file-name">
              {selectedFile?.name ?? copy.noFile}
            </Typography>
          </form>

          {uploadError && (
            <ErrorNotice
              copy={copy}
              message={`${copy.uploadError} ${uploadError}`}
              onDismiss={() => setUploadError(null)}
            />
          )}
          {uploadMessage && (
            <StatusNotice sx={{ mt: 2 }}>
              {uploadMessage}
            </StatusNotice>
          )}
          {deleteError && (
            <ErrorNotice
              copy={copy}
              message={deleteError}
              onDismiss={() => setDeleteError(null)}
            />
          )}
          {deleteMessage && (
            <StatusNotice sx={{ mt: 2 }}>
              {deleteMessage}
            </StatusNotice>
          )}
          {booksLoading && (
            <StatusNotice loading sx={{ mt: 2 }}>
              {books.length > 0 ? copy.refreshingBooks : copy.loadingBooks}
            </StatusNotice>
          )}
          {booksError && (
            <ErrorNotice
              copy={copy}
              message={booksError}
              onDismiss={() => setBooksError(null)}
            >
              <Button
                size="small"
                variant="outlined"
                onClick={() => void refreshBooks()}
                disabled={booksLoading}
              >
                {copy.retry}
              </Button>
            </ErrorNotice>
          )}
          {!booksLoading && !booksError && books.length === 0 ? (
            <Typography className="empty-state" sx={{ mt: 2 }}>
              {copy.emptyLibrary}
            </Typography>
          ) : books.length > 0 ? (
            <ul className="book-list" aria-busy={booksLoading}>
              {books.map((book) => (
                <Card component="li" variant="outlined" className="book-card" key={book.id}>
                  <CardContent className="book-card-copy" sx={{ flex: "1 1 auto" }}>
                    <Typography component="h3" variant="h6">
                      {book.title}
                    </Typography>
                    {book.author && (
                      <Typography color="text.secondary">
                        {copy.author}: {book.author}
                      </Typography>
                    )}
                    <Typography color="text.secondary">
                      {copy.status}: {getStatusLabel(book.status, copy)}
                    </Typography>
                  </CardContent>
                  {["parsed", "extracting", "error", "ready"].includes(
                    book.status,
                  ) && <ExtractionControls book={book} copy={copy} />}
                  <CardActions sx={{ alignSelf: "center", flexShrink: 0 }}>
                    <Button
                      variant="contained"
                      onClick={() => setSelectedBook(book)}
                      disabled={book.status === "error" || backupBusy}
                    >
                      {copy.openBook}
                    </Button>
                    <Button
                      variant="outlined"
                      color="error"
                      onClick={() => void removeBook(book)}
                      disabled={deletingBookId !== null || backupBusy || uploading}
                    >
                      {deletingBookId === book.id ? copy.deletingBook : copy.deleteBook}
                    </Button>
                  </CardActions>
                </Card>
              ))}
            </ul>
          ) : null}
        </section>
      )}
      </main>
    </AppThemeProvider>
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
  const [chapterStart, setChapterStart] = useState("0");
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
        setChapterStart(String(extractionJob?.min_chapter_index ?? 0));
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
      setJob(await startExtractionJob(book.id, maxChapterIndex, Number(chapterStart)));
    } catch (requestError) {
      setError(
        `${copy.extractionRequestFailed} ${getErrorMessage(requestError, copy)}`,
      );
    } finally {
      startingRef.current = false;
      setStarting(false);
    }
  }

  const canStart =
    !loading &&
    !isActive &&
    Boolean(chapters?.length) &&
    (book.status === "parsed" ||
      job?.status === "error" ||
      job?.status === "completed");
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
        <StatusNotice loading>
          {copy.extractionCheck}
        </StatusNotice>
      )}
      {error && (
        <ErrorNotice copy={copy} message={error} onDismiss={() => setError(null)} />
      )}
      {job && (
        <div className="extraction-status" aria-live="polite">
          <p>
            {copy.extractionStatus}: {copy.extractionStatuses[job.status]}
          </p>
          <div className="extraction-progress">
            <LinearProgress
              variant="determinate"
              value={job.progress}
              aria-label={copy.extractionProgress}
              role="progressbar"
            />
            <span>{job.progress}%</span>
          </div>
          {job.status === "error" && (
            <ErrorNotice
              copy={copy}
              message={
                `${copy.extractionFailed} ${getExtractionErrorMessage(job.error_code, copy)} ` +
                `${copy.extractionErrorReference}: ${job.id}`
              }
              onDismiss={() => {}}
            />
          )}
        </div>
      )}
      {canStart && chapters && (
        <form className="extraction-form" onSubmit={submitExtraction}>
          <label htmlFor={`extraction-start-${book.id}`}>
            {copy.extractionFrom}
          </label>
          <select
            id={`extraction-start-${book.id}`}
            value={chapterStart}
            onChange={(event) => {
              const start = event.target.value;
              setChapterStart(start);
              if (chapterLimit !== "all" && Number(chapterLimit) < Number(start)) {
                setChapterLimit("all");
              }
            }}
            disabled={starting}
          >
            {chapters.map((chapter) => (
              <option key={chapter.id} value={chapter.index}>
                {chapter.title ?? `${copy.chapter} ${chapter.index + 1}`}
              </option>
            ))}
          </select>
          <label htmlFor={`extraction-limit-${book.id}`}>
            {copy.extractionThrough}
          </label>
          <select
            id={`extraction-limit-${book.id}`}
            value={chapterLimit}
            onChange={(event) => setChapterLimit(event.target.value)}
            disabled={starting}
          >
            <option value="all">{copy.allChapters}</option>
            {chapters
              .filter((chapter) => chapter.index >= Number(chapterStart))
              .map((chapter) => (
                <option key={chapter.id} value={chapter.index}>
                  {chapter.title ?? `${copy.chapter} ${chapter.index + 1}`}
                </option>
              ))}
          </select>
          <Typography color="text.secondary" sx={{ fontSize: "0.875rem" }}>
            {copy.extractionRangeWarning}
          </Typography>
          <Button type="submit" variant="contained" disabled={starting}>
            {submitLabel}
          </Button>
        </form>
      )}
    </div>
  );
}
