import { useEffect, useRef, useState } from "react";
import { Book } from "./api";
import {
  NotesPanel,
  PositionControls,
  ReaderContent,
} from "./ReaderComponents";
import { Copy } from "./i18n";
import { useReaderNotes } from "./useReaderNotes";
import { ErrorNotice } from "./ErrorNotice";
import { useManualPosition } from "./useManualPosition";
import { useReadingProgress } from "./useReadingProgress";
import { useReaderPosition } from "./useReaderPosition";

export interface ReaderProps {
  book: Book;
  copy: Copy;
  onBack: () => void;
}

export function Reader({ book, copy, onBack }: ReaderProps) {
  const [readyToTrack, setReadyToTrack] = useState(false);
  const scrollContainer = useRef<HTMLDivElement>(null);
  const position = useReaderPosition({
    bookId: book.id,
    copy,
    onManualChapterChange: () => {},
  });
  const {
    chapters,
    selectedChapterId,
    chapterContent,
    readerLoading,
    chapterLoading,
    readerError,
    restorePosition,
    setRestorePosition,
    retryReaderLoad,
    setReaderError,
    changeChapter,
    currentPosition,
    setCurrentPosition,
    latestPosition,
  } = position;
  const manual = useManualPosition({ chapters, copy, bookId: book.id });
  const {
    manualPosition,
    manualChapterId,
    setManualChapterId,
    percentage,
    positionMethod,
    setPositionMethod,
    manualPositionError,
    setManualPositionError,
    setPercentage,
  } = manual;
  const progress = useReadingProgress({
    bookId: book.id,
    chapterContent,
    readyToTrack,
    copy,
    scrollContainer,
    restorePosition,
    onRestoreComplete: () => {
      setRestorePosition(null);
      setReadyToTrack(true);
    },
    currentPosition,
    setCurrentPosition,
    latestPosition,
  });
  const {
    progressError,
    setProgressError,
    savingProgress,
    setRetrySave,
  } = progress;
  useEffect(() => {
    if (selectedChapterId) {
      setManualChapterId(selectedChapterId);
    }
  }, [selectedChapterId, setManualChapterId]);
  const activeNotesPosition = manualPosition ?? currentPosition;
  const notes = useReaderNotes({
    bookId: book.id,
    position: activeNotesPosition,
    copy,
  });

  if (readerLoading) {
    return <p role="status">{copy.loadingReader}</p>;
  }
  if (readerError) {
    return (
      <section className="reader">
        <button type="button" onClick={onBack}>
          {copy.backToLibrary}
        </button>
        <ErrorNotice
          copy={copy}
          message={readerError}
          onDismiss={() => setReaderError(null)}
        />
        <button
          type="button"
          onClick={() => {
            setReaderError(null);
            retryReaderLoad();
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
        manualPosition={manualPosition}
        manualPositionError={manualPositionError}
        onApplyManualPosition={manual.applyManualPosition}
        onFollowReader={manual.followReader}
        onManualChapterChange={manual.changeManualChapter}
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

      <div className="reader-columns">
        <div className="reader-main">
          {progressError && (
            <ErrorNotice
              copy={copy}
              message={`${copy.saveFailed} ${progressError}`}
              onDismiss={() => setProgressError(null)}
            >
              <button
                type="button"
                onClick={() => {
                  setProgressError(null);
                  setRetrySave((attempt) => attempt + 1);
                }}
              >
                {copy.retry}
              </button>
            </ErrorNotice>
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
          exportLoading={manual.exportLoading}
          exportError={manual.exportError}
          onExport={(format) => void manual.exportNotes(format, activeNotesPosition)}
          onExportErrorDismiss={manual.clearExportError}
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
          recap={notes.recap}
          recapLoading={notes.recapLoading}
          recapError={notes.recapError}
          onRecapRetry={notes.retryRecap}
          onRecapErrorDismiss={notes.clearRecapError}
        />
      </div>
    </section>
  );
}
