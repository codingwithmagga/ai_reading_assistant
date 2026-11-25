import { FormEvent, useEffect, useRef, useState } from "react";
import {
  Box,
  Button,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import {
  Book,
  Chapter,
  ChapterContent,
  getBookNotesExport,
  getChapterContent,
  getChapters,
  getReadingProgress,
  saveReadingProgress,
} from "./api";
import {
  ChapterOverview,
  NotesExportPanel,
  NotesPanel,
  PositionControls,
  ReaderContent,
} from "./ReaderComponents";
import { Copy, getErrorMessage } from "./i18n";
import { downloadNotesExport } from "./notesExport";
import { useReaderNotes } from "./useReaderNotes";
import { ErrorNotice } from "./ErrorNotice";
import { StatusNotice } from "./StatusNotice";

export interface ReaderProps {
  book: Book;
  copy: Copy;
  onBack: () => void;
}

export function Reader({ book, copy, onBack }: ReaderProps) {
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [selectedChapterId, setSelectedChapterId] = useState<string | null>(null);
  const [chapterContent, setChapterContent] = useState<ChapterContent | null>(null);
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
  const [percentage, setPercentage] = useState("0");
  const [positionMethod, setPositionMethod] = useState<"chapter" | "percentage">(
    "chapter",
  );
  const [manualPositionError, setManualPositionError] = useState<string | null>(null);
  const [exportLoading, setExportLoading] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [readerView, setReaderView] = useState<"reader" | "overview">("reader");
  const latestPosition = useRef<number | null>(null);
  const progressQueue = useRef<Promise<void>>(Promise.resolve());
  const scrollContainer = useRef<HTMLDivElement>(null);
  const copyRef = useRef(copy);
  const activeNotesPosition = manualPosition ?? currentPosition;
  const notes = useReaderNotes({
    bookId: book.id,
    position: activeNotesPosition,
    copy,
  });

  useEffect(() => {
    copyRef.current = copy;
  }, [copy]);

  useEffect(() => {
    let active = true;
    void (async () => {
      if (!book.id) {
        setReaderError(copy.apiError);
        setReaderLoading(false);
        return;
      }
      try {
        const chapterList = await getChapters(book.id);
        if (!active) {
          return;
        }
        setChapters(chapterList);
        if (chapterList.length === 0) {
          setReaderLoading(false);
          return;
        }

        const savedProgress = await getReadingProgress(book.id);
        if (!active) {
          return;
        }

        const savedPosition = savedProgress.current_position;
        const initialChapter =
          savedPosition === null
            ? chapterList[0]
            : chapterList.find(
                (chapter) =>
                  savedPosition >= chapter.start_position &&
                  savedPosition <= chapter.end_position,
              ) ?? chapterList[0];
        const initialPosition = savedPosition ?? initialChapter.start_position;
        setSelectedChapterId(initialChapter.id);
        setManualChapterId(initialChapter.id);
        latestPosition.current = initialPosition;
        setCurrentPosition(initialPosition);
        setRestorePosition(initialPosition);
      } catch (error) {
        if (active) {
          setReaderError(getErrorMessage(error, copy));
        }
      } finally {
        if (active) {
          setReaderLoading(false);
        }
      }
    })();

    return () => {
      active = false;
    };
  }, [book.id, copy, retryReader]);

  useEffect(() => {
    if (!selectedChapterId) {
      return;
    }

    let active = true;
    setChapterLoading(true);
    void (async () => {
      try {
        const chapter = await getChapterContent(book.id, selectedChapterId);
        if (!active) {
          return;
        }
        setChapterContent(chapter);
      } catch (error) {
        if (active) {
          setReaderError(getErrorMessage(error, copy));
        }
      } finally {
        if (active) {
          setChapterLoading(false);
        }
      }
    })();

    return () => {
      active = false;
    };
  }, [book.id, copy, selectedChapterId]);

  useEffect(() => {
    if (
      !chapterContent ||
      !restorePosition ||
      chapterContent.id !== selectedChapterId
    ) {
      return;
    }
    const target = document.getElementById(`paragraph-${restorePosition}`);
    target?.scrollIntoView?.({ block: "start" });
    setRestorePosition(null);
    setReadyToTrack(true);
  }, [chapterContent, restorePosition, selectedChapterId]);

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
    setReadyToTrack(false);
    setReaderError(null);
  }

  function jumpToSource(chapterId: string, position: number) {
    latestPosition.current = position;
    setCurrentPosition(position);
    setRestorePosition(position);
    setSelectedChapterId(chapterId);
    setManualChapterId(chapterId);
    setReadyToTrack(false);
    setReaderError(null);
  }

  function applyManualPosition(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (positionMethod === "chapter") {
      const chapter = chapters.find((item) => item.id === manualChapterId);
      if (!chapter) {
        setManualPositionError(copy.invalidPositionValue);
        return;
      }
      setManualPosition(chapter.start_position);
      setManualPositionError(null);
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
    if (chapters.length === 0) {
      setManualPositionError(copy.noChapters);
      return;
    }
    const firstPosition = chapters[0].start_position;
    setManualPosition(
      firstPosition +
        Math.round((percent / 100) * (totalPositions - firstPosition)),
    );
  }

  async function exportNotes(format: "json" | "markdown") {
    if (activeNotesPosition === null || exportLoading) {
      return;
    }
    setExportLoading(true);
    setExportError(null);
    try {
      const data = await getBookNotesExport(book.id, activeNotesPosition);
      downloadNotesExport(data, format, copy);
    } catch (error) {
      setExportError(getErrorMessage(error, copy));
    } finally {
      setExportLoading(false);
    }
  }

  if (readerLoading) {
    return <StatusNotice loading>{copy.loadingReader}</StatusNotice>;
  }
  if (readerError) {
    return (
      <section className="reader">
        <Button variant="outlined" onClick={onBack}>
          {copy.backToLibrary}
        </Button>
        <ErrorNotice
          copy={copy}
          message={readerError}
          onDismiss={() => setReaderError(null)}
        />
        <Button
          variant="contained"
          onClick={() => {
            setReaderError(null);
            setRetryReader((attempt) => attempt + 1);
          }}
        >
          {copy.retry}
        </Button>
      </section>
    );
  }
  if (chapters.length === 0) {
    return (
      <section className="reader">
        <Button variant="outlined" onClick={onBack}>
          {copy.backToLibrary}
        </Button>
        <Typography className="empty-state" sx={{ mt: 2 }}>
          {copy.noChapters}
        </Typography>
      </section>
    );
  }

  const activeChapter = chapters.find((chapter) => chapter.id === selectedChapterId);
  const totalPositions = chapters[chapters.length - 1]?.end_position ?? 0;

  return (
    <section className="reader" aria-labelledby="reader-heading">
      <Stack
        direction={{ xs: "column", sm: "row" }}
        justifyContent="space-between"
        alignItems={{ xs: "stretch", sm: "center" }}
        spacing={1.5}
        className="reader-toolbar"
      >
        <Button variant="outlined" onClick={onBack}>
          {copy.backToLibrary}
        </Button>
        <Stack direction="row" spacing={1}>
          <Button
            variant={readerView === "reader" ? "contained" : "outlined"}
            onClick={() => setReaderView("reader")}
          >
            {copy.readerView}
          </Button>
          <Button
            variant={readerView === "overview" ? "contained" : "outlined"}
            onClick={() => setReaderView("overview")}
          >
            {copy.chapterOverview}
          </Button>
        </Stack>
        <TextField
          select
          size="small"
          label={copy.selectChapter}
          value={selectedChapterId ?? ""}
          onChange={(event) => {
            const nextChapter = chapters.find(
              (chapter) => chapter.id === event.target.value,
            );
            if (nextChapter) {
              changeChapter(nextChapter);
            }
          }}
          SelectProps={{ native: true }}
          sx={{ minWidth: { sm: 260 } }}
        >
          {chapters.map((chapter) => (
            <option key={chapter.id} value={chapter.id}>
              {chapter.title || `${copy.chapter} ${chapter.index + 1}`}
            </option>
          ))}
        </TextField>
      </Stack>
      <Box className="reader-heading">
        <Typography component="h2" variant="h5" id="reader-heading">
          {book.title}
        </Typography>
        <Typography color="text.secondary">
          {copy.readingPosition}: {currentPosition === null ? "—" : currentPosition + 1}{" "}
          {copy.positionOf} {totalPositions + 1}
        </Typography>
      </Box>

      <PositionControls
        activeNotesPosition={activeNotesPosition}
        chapters={chapters}
        copy={copy}
        manualChapterId={manualChapterId}
        manualPosition={manualPosition}
        manualPositionError={manualPositionError}
        onApplyManualPosition={applyManualPosition}
        onFollowReader={() => {
          setManualPosition(null);
          setManualPositionError(null);
        }}
        onManualChapterChange={(chapterId) => {
          const chapter = chapters.find((item) => item.id === chapterId);
          if (chapter) {
            setManualChapterId(chapter.id);
          }
          setManualPositionError(null);
        }}
        onManualPositionMethodChange={(value) => {
          setPositionMethod(value);
          setManualPositionError(null);
        }}
        onManualPositionErrorDismiss={() => setManualPositionError(null)}
        onPercentageChange={(value) => {
          setPercentage(value);
          setManualPositionError(null);
        }}
        percentage={percentage}
        positionMethod={positionMethod}
        totalPositions={totalPositions}
      />

      {readerView === "overview" ? (
        <ChapterOverview
          copy={copy}
          overview={notes.chapterOverview}
          loading={notes.chapterOverviewLoading}
          error={notes.chapterOverviewError}
          onRetry={notes.retryChapterOverview}
          onErrorDismiss={notes.clearChapterOverviewError}
          onJumpToSource={(chapterId, position) => {
            setReaderView("reader");
            jumpToSource(chapterId, position);
          }}
        />
      ) : (
      <div className="reader-columns">
        <div className="reader-main">
          {progressError && (
            <ErrorNotice
              copy={copy}
              message={`${copy.saveFailed} ${progressError}`}
              onDismiss={() => setProgressError(null)}
            >
              <Button
                size="small"
                variant="outlined"
                onClick={() => {
                  setProgressError(null);
                  setRetrySave((attempt) => attempt + 1);
                }}
              >
                {copy.retry}
              </Button>
            </ErrorNotice>
          )}
          {!progressError && savingProgress && (
            <StatusNotice loading>
              {copy.savePending}
            </StatusNotice>
          )}
          <Paper
            component="div"
            variant="outlined"
            className="reader-scroll"
            ref={scrollContainer}
            tabIndex={0}
            aria-label={copy.readerContent}
            onMouseUp={() => notes.captureSelectedText(scrollContainer.current)}
            onKeyUp={() => notes.captureSelectedText(scrollContainer.current)}
          >
            <ReaderContent
              chapterContent={chapterContent}
              chapterLoading={chapterLoading}
              currentPosition={currentPosition}
              copy={copy}
            />
          </Paper>
          <Typography className="chapter-position" color="text.secondary">
            {activeChapter?.title || `${copy.chapter} ${(activeChapter?.index ?? 0) + 1}`}
          </Typography>
          <NotesExportPanel
            copy={copy}
            activeNotesPosition={activeNotesPosition}
            loading={exportLoading}
            error={exportError}
            onExport={(format) => void exportNotes(format)}
            onErrorDismiss={() => setExportError(null)}
          />
        </div>

        <NotesPanel
          copy={copy}
          lookupTerm={notes.lookupTerm}
          lookupEntityType={notes.lookupEntityType}
          lookupEntityOptions={notes.lookupEntityOptions}
          selectedTextPosition={notes.selectedTextPosition}
          lookupResponse={notes.lookupResponse}
          lookupError={notes.lookupError}
          lookupLoading={notes.lookupLoading}
          onLookupSubmit={notes.submitLookup}
          onLookupTermChange={notes.changeLookupTerm}
          onLookupClear={notes.clearLookup}
          onLookupRetry={notes.retryLookup}
          onLookupEntityTypeChange={notes.changeLookupEntityType}
          onLookupEntityNameChange={notes.changeLookupEntityName}
          onJumpToSource={jumpToSource}
        />
      </div>
      )}
    </section>
  );
}
