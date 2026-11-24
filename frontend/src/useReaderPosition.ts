import { useEffect, useRef, useState } from "react";
import {
  Chapter,
  ChapterContent,
  getChapterContent,
  getChapters,
  getReadingProgress,
} from "./api";
import { Copy, getErrorMessage } from "./i18n";

export function useReaderPosition({
  bookId,
  copy,
  onManualChapterChange,
}: {
  bookId: string;
  copy: Copy;
  onManualChapterChange: (chapterId: string) => void;
}) {
  const [currentPosition, setCurrentPosition] = useState<number | null>(null);
  const latestPosition = useRef<number | null>(null);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [selectedChapterId, setSelectedChapterId] = useState<string | null>(null);
  const [chapterContent, setChapterContent] = useState<ChapterContent | null>(null);
  const [readerLoading, setReaderLoading] = useState(true);
  const [chapterLoading, setChapterLoading] = useState(false);
  const [readerError, setReaderError] = useState<string | null>(null);
  const [restorePosition, setRestorePosition] = useState<number | null>(null);
  const [retryReader, setRetryReader] = useState(0);
  const callbackRef = useRef(onManualChapterChange);
  callbackRef.current = onManualChapterChange;

  useEffect(() => {
    let active = true;
    void (async () => {
      if (!bookId) {
        setReaderError(copy.apiError);
        setReaderLoading(false);
        return;
      }
      try {
        const chapterList = await getChapters(bookId);
        if (!active) return;
        setChapters(chapterList);
        if (chapterList.length === 0) {
          setReaderLoading(false);
          return;
        }
        const savedProgress = await getReadingProgress(bookId);
        if (!active) return;
        const savedPosition = savedProgress.current_position;
        const initialChapter = savedPosition === null
          ? chapterList[0]
          : chapterList.find((chapter) =>
              savedPosition >= chapter.start_position &&
              savedPosition <= chapter.end_position,
            ) ?? chapterList[0];
        const initialPosition = savedPosition ?? initialChapter.start_position;
        setSelectedChapterId(initialChapter.id);
        callbackRef.current(initialChapter.id);
        latestPosition.current = initialPosition;
        setCurrentPosition(initialPosition);
        setRestorePosition(initialPosition);
      } catch (error) {
        if (active) setReaderError(getErrorMessage(error, copy));
      } finally {
        if (active) setReaderLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [bookId, copy, retryReader, latestPosition]);

  useEffect(() => {
    if (!selectedChapterId) return;
    let active = true;
    setChapterLoading(true);
    void (async () => {
      try {
        const chapter = await getChapterContent(bookId, selectedChapterId);
        if (active) setChapterContent(chapter);
      } catch (error) {
        if (active) setReaderError(getErrorMessage(error, copy));
      } finally {
        if (active) setChapterLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [bookId, copy, selectedChapterId]);

  function changeChapter(chapter: Chapter) {
    latestPosition.current = chapter.start_position;
    setCurrentPosition(chapter.start_position);
    setRestorePosition(chapter.start_position);
    setSelectedChapterId(chapter.id);
    callbackRef.current(chapter.id);
  }

  return {
    chapters,
    selectedChapterId,
    chapterContent,
    readerLoading,
    chapterLoading,
    readerError,
    restorePosition,
    setRestorePosition,
    retryReader,
    setReaderError,
    currentPosition,
    setCurrentPosition,
    latestPosition,
    retryReaderLoad: () => setRetryReader((attempt) => attempt + 1),
    changeChapter,
  };
}
