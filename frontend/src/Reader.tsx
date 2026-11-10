import { FormEvent, useEffect, useRef, useState } from "react";
import {
  Book,
  Chapter,
  ChapterContent,
  EntityListItem,
  EntityLookupResponse,
  RecapResponse,
  getBookEntities,
  getBookRecap,
  getChapterContent,
  getChapters,
  getReadingProgress,
  lookupBookEntity,
  saveReadingProgress,
} from "./api";
import { Copy, getEntityTypeLabel, getErrorMessage } from "./i18n";

export interface ReaderProps {
  book: Book;
  copy: Copy;
  onBack: () => void;
}

function getSelectionParagraph(
  selection: Selection | null,
  container: HTMLElement | null,
): HTMLElement | null {
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
    return null;
  }

  const range = selection.getRangeAt(0);
  const parent = range.commonAncestorContainer;
  const paragraph =
    parent instanceof Element
      ? parent.closest<HTMLElement>("[data-reading-position]")
      : parent.nodeType === Node.ELEMENT_NODE
        ? (parent as Element).closest<HTMLElement>("[data-reading-position]")
        : parent.parentElement?.closest<HTMLElement>("[data-reading-position]");

  if (!paragraph || !container || !container.contains(paragraph)) {
    return null;
  }

  return paragraph;
}

function ReaderContent({
  chapterContent,
  chapterLoading,
  currentPosition,
  copy,
}: {
  chapterContent: ChapterContent | null;
  chapterLoading: boolean;
  currentPosition: number | null;
  copy: Copy;
}) {
  if (chapterLoading) {
    return <p role="status">{copy.loadingChapter}</p>;
  }

  if (!chapterContent) {
    return null;
  }

  return (
    <article>
      <h3>
        {chapterContent.title || `${copy.chapter} ${chapterContent.index + 1}`}
      </h3>
      {chapterContent.paragraphs.map((paragraph) => (
        <p
          key={paragraph.id}
          id={`paragraph-${paragraph.position}`}
          data-reading-position={paragraph.position}
          aria-current={
            currentPosition === paragraph.position ? "location" : undefined
          }
        >
          {paragraph.text}
        </p>
      ))}
    </article>
  );
}

function PositionControls({
  activeNotesPosition,
  chapters,
  copy,
  manualChapterId,
  manualParagraphCount,
  manualPosition,
  manualPositionError,
  onApplyManualPosition,
  onFollowReader,
  onManualChapterChange,
  onManualParagraphChange,
  onManualPositionMethodChange,
  onPercentageChange,
  paragraphInChapter,
  percentage,
  positionMethod,
  totalPositions,
}: {
  activeNotesPosition: number | null;
  chapters: Chapter[];
  copy: Copy;
  manualChapterId: string;
  manualParagraphCount: number;
  manualPosition: number | null;
  manualPositionError: string | null;
  onApplyManualPosition: (event: FormEvent<HTMLFormElement>) => void;
  onFollowReader: () => void;
  onManualChapterChange: (chapterId: string) => void;
  onManualParagraphChange: (value: string) => void;
  onManualPositionMethodChange: (value: "chapter" | "percentage") => void;
  onPercentageChange: (value: string) => void;
  paragraphInChapter: string;
  percentage: string;
  positionMethod: "chapter" | "percentage";
  totalPositions: number;
}) {
  const manualPositionDisplay =
    activeNotesPosition === null ? "—" : activeNotesPosition + 1;

  return (
    <section className="notes-position" aria-labelledby="notes-position-heading">
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
          <button type="button" onClick={onFollowReader}>
            {copy.followReader}
          </button>
        )}
      </div>
      <form
        className="manual-position-form"
        noValidate
        onSubmit={onApplyManualPosition}
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
                onManualPositionMethodChange(event.currentTarget.value);
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
                  onManualChapterChange(event.currentTarget.value);
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
                onChange={(event) =>
                  onManualParagraphChange(event.currentTarget.value)
                }
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
              onChange={(event) => onPercentageChange(event.currentTarget.value)}
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
  );
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
  const [lookupTerm, setLookupTerm] = useState("");
  const [selectedTextPosition, setSelectedTextPosition] = useState<number | null>(null);
  const [lookupResponse, setLookupResponse] = useState<EntityLookupResponse | null>(null);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [characters, setCharacters] = useState<EntityListItem[]>([]);
  const [charactersPosition, setCharactersPosition] = useState<number | null>(null);
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
  const lookupInFlight = useRef(new Map<string, Promise<EntityLookupResponse>>());
  const notesInFlight = useRef(
    new Map<
      string,
      Promise<
        [
          PromiseSettledResult<EntityListItem[]>,
          PromiseSettledResult<RecapResponse>,
        ]
      >
    >(),
  );
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
  }, [activeNotesPosition, selectedTextPosition, copy]);

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
    const key = `${book.id}:${position}`;
    setCharacters([]);
    setCharactersPosition(null);
    setRecap(null);
    setRecapPosition(null);
    setCharactersLoading(true);
    setRecapLoading(true);
    setCharactersError(null);
    setRecapError(null);

    const timer = window.setTimeout(() => {
      let request = notesInFlight.current.get(key);
      if (!request) {
        request = Promise.allSettled([
          getBookEntities(book.id, position, "person"),
          getBookRecap(book.id, position),
        ]);
        notesInFlight.current.set(key, request);
        void request.then(() => {
          if (notesInFlight.current.get(key) === request) {
            notesInFlight.current.delete(key);
          }
        });
      }

      void request.then(([charactersResult, recapResult]) => {
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
    }, 250);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [activeNotesPosition, book.id, retryNotes]);

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

  async function performLookup(query: string, position: number | null) {
    const normalizedQuery = query.trim();
    if (!normalizedQuery) {
      lookupRequestId.current += 1;
      setLookupLoading(false);
      setLookupResponse(null);
      setLookupError(copy.emptySearchQuery);
      return;
    }
    if (position === null) {
      lookupRequestId.current += 1;
      setLookupLoading(false);
      setLookupResponse(null);
      setLookupError(copy.noLookupPosition);
      return;
    }

    const requestId = ++lookupRequestId.current;
    const key = `${book.id}:${position}:${normalizedQuery}`;
    setLookupLoading(true);
    setLookupError(null);
    setLookupResponse(null);
    try {
      let request = lookupInFlight.current.get(key);
      if (!request) {
        request = lookupBookEntity(book.id, normalizedQuery, position);
        lookupInFlight.current.set(key, request);
      }
      const response = await request;
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
      if (lookupInFlight.current.get(key)) {
        lookupInFlight.current.delete(key);
      }
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
    const paragraph = getSelectionParagraph(
      selection,
      scrollContainer.current,
    );
    const selectedText = selection?.toString().trim();

    if (!selectedText || !paragraph) {
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
            onMouseUp={captureSelectedText}
            onKeyUp={captureSelectedText}
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
                  onClick={() => void performLookup(lookupTerm, activeLookupPosition)}
                  disabled={lookupLoading}
                >
                  {copy.retry}
                </button>
              </div>
            )}
            {lookupLoading && <p role="status">{copy.searchLoading}</p>}
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
                              {fact.chapter_title || fact.chapter_index + 1}{" "}
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

            <section
              className="notes-data"
              aria-labelledby="characters-heading"
              aria-live="polite"
              aria-busy={charactersLoading}
            >
              <h3 id="characters-heading">{copy.knownCharacters}</h3>
              {charactersLoading ? (
                <p role="status">{copy.loadingCharacters}</p>
              ) : charactersError ? (
                <div className="message error" role="alert">
                  <p>
                    {copy.notesLoadFailed} {charactersError}
                  </p>
                  <button
                    type="button"
                    onClick={() => setRetryNotes((attempt) => attempt + 1)}
                  >
                    {copy.retry}
                  </button>
                </div>
              ) : visibleCharacters.length > 0 ? (
                <ul>
                  {visibleCharacters.map((character) => (
                    <li key={character.id}>
                      <strong>{character.canonical_name}</strong>
                      {character.aliases.length > 0 && (
                        <>
                          {" "}
                          <span>
                            ({character.aliases.map((alias) => alias.alias).join(", ")})
                          </span>
                        </>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="empty-state">{copy.noKnownCharacters}</p>
              )}
            </section>

            <section
              className="notes-data"
              aria-labelledby="recap-heading"
              aria-live="polite"
              aria-busy={recapLoading}
            >
              <h3 id="recap-heading">{copy.recapTitle}</h3>
              {recapLoading ? (
                <p role="status">{copy.loadingRecap}</p>
              ) : recapError ? (
                <div className="message error" role="alert">
                  <p>
                    {copy.notesLoadFailed} {recapError}
                  </p>
                  <button
                    type="button"
                    onClick={() => setRetryNotes((attempt) => attempt + 1)}
                  >
                    {copy.retry}
                  </button>
                </div>
              ) : visibleRecap && visibleRecap.events.length > 0 ? (
                <ul>
                  {visibleRecap.events.map((event) => (
                    <li key={`${event.position}-${event.text}`}>
                      <strong>
                        {event.chapter_title || `${copy.chapter} ${event.chapter_index + 1}`}
                      </strong>
                      <p>{event.text}</p>
                      <blockquote>
                        <strong>{copy.source}:</strong> {event.source_excerpt}
                      </blockquote>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="empty-state">{copy.noRecapEvents}</p>
              )}
            </section>
          </details>
        </aside>
      </div>
    </section>
  );
}
