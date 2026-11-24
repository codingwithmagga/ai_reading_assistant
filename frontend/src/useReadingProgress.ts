import { RefObject, useEffect, useRef, useState } from "react";
import { saveReadingProgress } from "./api";
import { Copy, getErrorMessage } from "./i18n";

export function useReadingProgress({
  bookId,
  chapterContent,
  readyToTrack,
  copy,
  scrollContainer,
  restorePosition,
  onRestoreComplete,
  currentPosition,
  setCurrentPosition,
  latestPosition,
}: {
  bookId: string;
  chapterContent: unknown;
  readyToTrack: boolean;
  copy: Copy;
  scrollContainer: RefObject<HTMLDivElement>;
  restorePosition: number | null;
  onRestoreComplete: () => void;
  currentPosition: number | null;
  setCurrentPosition: (position: number) => void;
  latestPosition: { current: number | null };
}) {
  const [progressError, setProgressError] = useState<string | null>(null);
  const [savingProgress, setSavingProgress] = useState(false);
  const [retrySave, setRetrySave] = useState(0);
  const progressQueue = useRef<Promise<void>>(Promise.resolve());
  const copyRef = useRef(copy);

  useEffect(() => {
    copyRef.current = copy;
  }, [copy]);

  useEffect(() => {
    if (restorePosition === null) return;
    const target = document.getElementById(`paragraph-${restorePosition}`);
    target?.scrollIntoView?.({ block: "start" });
    onRestoreComplete();
  }, [chapterContent, restorePosition, onRestoreComplete]);

  useEffect(() => {
    const container = scrollContainer.current;
    if (!container || !chapterContent || !readyToTrack) return;
    const paragraphs = container.querySelectorAll<HTMLElement>(
      "[data-reading-position]",
    );
    if (typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      () => {
        const containerBounds = container.getBoundingClientRect();
        const visibleParagraphs = Array.from(paragraphs)
          .filter((paragraph) => {
            const bounds = paragraph.getBoundingClientRect();
            return bounds.bottom > containerBounds.top && bounds.top < containerBounds.bottom;
          })
          .sort((left, right) =>
            left.getBoundingClientRect().top - right.getBoundingClientRect().top);
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
  }, [chapterContent, readyToTrack, scrollContainer, latestPosition, setCurrentPosition]);

  useEffect(() => {
    if (!readyToTrack || currentPosition === null) return;
    const positionToSave = currentPosition;
    const timer = window.setTimeout(() => {
      setSavingProgress(true);
      progressQueue.current = progressQueue.current
        .then(async () => {
          await saveReadingProgress(bookId, positionToSave);
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
  }, [bookId, currentPosition, readyToTrack, retrySave, latestPosition]);

  return {
    currentPosition,
    setCurrentPosition,
    latestPosition,
    progressError,
    setProgressError,
    savingProgress,
    retrySave,
    setRetrySave,
  };
}
