import { FormEvent, useEffect, useRef, useState } from "react";
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
  NotesPanel,
  PositionControls,
  ReaderContent,
} from "./ReaderComponents";
import { Copy, getErrorMessage } from "./i18n";
import { downloadNotesExport } from "./notesExport";
import { useReaderNotes } from "./useReaderNotes";

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
  const [paragraphInChapter, setParagraphInChapter] = useState("1");
  const [percentage, setPercentage] = useState("0");
  const [positionMethod, setPositionMethod] = useState<"chapter" | "percentage">(
    "chapter",
  );
  const [manualPositionError, setManualPositionError] = useState<string | null>(null);
  const [exportLoading, setExportLoading] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
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
        setParagraphInChapter(
          String(initialPosition - initialChapter.start_position + 1),
        );
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
    if (positionMethod === "chapter") {
      const chapter = chapters.find((item) => item.id === manualChapterId);
      if (!chapter) {
        setManualPositionError(copy.invalidPositionValue);
        return;
      }
      const paragraphIndex = Number(paragraphInChapter);
      if (!Number.isInteger(paragraphIndex) || paragraphIndex < 1) {
        setManualPositionError(copy.invalidPositionValue);
        return;
      }
      const nextPosition = Math.min(
        chapter.start_position + paragraphIndex - 1,
        chapter.end_position,
      );
      setManualPosition(nextPosition);
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

  const activeChapter = chapters.find((chapter) => chapter.id === selectedChapterId);
  const totalPositions = chapters[chapters.length - 1]?.end_position ?? 0;
  const manualChapter = chapters.find((chapter) => chapter.id === manualChapterId);
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
          {copy.readingPosition}: {currentPosition === null ? "—" : currentPosition + 1}{" "}
          {copy.positionOf} {totalPositions + 1}
        </p>
      </div>

      <PositionControls
        activeNotesPosition={activeNotesPosition}
        chapters={chapters}
        copy={copy}
        manualChapterId={manualChapterId}
        manualParagraphCount={manualParagraphCount}
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
            setParagraphInChapter("1");
          }
          setManualPositionError(null);
        }}
        onManualParagraphChange={(value) => {
          setParagraphInChapter(value);
          setManualPositionError(null);
        }}
        onManualPositionMethodChange={(value) => {
          setPositionMethod(value);
          setManualPositionError(null);
        }}
        onPercentageChange={(value) => {
          setPercentage(value);
          setManualPositionError(null);
        }}
        paragraphInChapter={paragraphInChapter}
        percentage={percentage}
        positionMethod={positionMethod}
        totalPositions={totalPositions}
      />

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
            onMouseUp={() => notes.captureSelectedText(scrollContainer.current)}
            onKeyUp={() => notes.captureSelectedText(scrollContainer.current)}
          >
            <ReaderContent
              chapterContent={chapterContent}
              chapterLoading={chapterLoading}
              currentPosition={currentPosition}
              copy={copy}
            />
          </div>
          <p className="chapter-position">
            {activeChapter?.title || `${copy.chapter} ${(activeChapter?.index ?? 0) + 1}`}
          </p>
        </div>

        <NotesPanel
          copy={copy}
          activeNotesPosition={activeNotesPosition}
          exportLoading={exportLoading}
          exportError={exportError}
          onExport={(format) => void exportNotes(format)}
          lookupTerm={notes.lookupTerm}
          selectedTextPosition={notes.selectedTextPosition}
          lookupResponse={notes.lookupResponse}
          lookupError={notes.lookupError}
          lookupLoading={notes.lookupLoading}
          onLookupSubmit={notes.submitLookup}
          onLookupTermChange={notes.changeLookupTerm}
          onLookupClear={notes.clearLookup}
          onLookupRetry={notes.retryLookup}
          characters={notes.characters}
          charactersLoading={notes.charactersLoading}
          charactersError={notes.charactersError}
          onCharactersRetry={notes.retryCharacters}
          recap={notes.recap}
          recapLoading={notes.recapLoading}
          recapError={notes.recapError}
          onRecapRetry={notes.retryRecap}
        />
      </div>
    </section>
  );
}
