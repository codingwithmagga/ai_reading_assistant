import { FormEvent, useEffect, useRef, useState } from "react";
import {
  Chapter,
  ExtractionJob,
  getBookJobs,
  getChapters,
  startExtractionJob,
  Book,
} from "./api";
import { Copy, getErrorMessage, getExtractionErrorMessage } from "./i18n";
import { ErrorNotice } from "./ErrorNotice";

interface ExtractionControlsProps {
  book: Book;
  copy: Copy;
}

export function ExtractionControls({ book, copy }: ExtractionControlsProps) {
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
        if (!active) return;
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
        if (active) setError(copy.extractionStatusFailed);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [book.id, copy]);

  useEffect(() => {
    if (!isActive) return;
    let active = true;
    const poll = async () => {
      try {
        const jobs = await getBookJobs(book.id);
        if (active) {
          const extractionJob = jobs.find((item) => item.type === "extraction") ?? null;
          setJob(extractionJob);
          if (extractionJob?.status === "completed") setChapterLimit("all");
          setError(null);
        }
      } catch {
        if (active) setError(copy.extractionStatusFailed);
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
    if (startingRef.current || !chapters?.length) return;
    startingRef.current = true;
    setStarting(true);
    setError(null);
    const maxChapterIndex = chapterLimit === "all" ? null : Number(chapterLimit);
    try {
      setJob(await startExtractionJob(book.id, maxChapterIndex, Number(chapterStart)));
    } catch (requestError) {
      setError(`${copy.extractionRequestFailed} ${getErrorMessage(requestError, copy)}`);
    } finally {
      startingRef.current = false;
      setStarting(false);
    }
  }

  const canStart =
    !loading &&
    !isActive &&
    Boolean(chapters?.length) &&
    (book.status === "parsed" || job?.status === "error" || job?.status === "completed");
  const submitLabel = starting
    ? copy.extractionCheck
    : job?.status === "error"
      ? copy.retryExtraction
      : job?.status === "completed"
        ? copy.continueExtraction
        : copy.startExtraction;

  return (
    <div className="extraction-controls">
      {loading && <p role="status" aria-live="polite">{copy.extractionCheck}</p>}
      {error && <ErrorNotice copy={copy} message={error} onDismiss={() => setError(null)} />}
      {job && (
        <div className="extraction-status" aria-live="polite">
          <p>{copy.extractionStatus}: {copy.extractionStatuses[job.status]}</p>
          <div className="extraction-progress">
            <progress max={100} value={job.progress} aria-label={copy.extractionProgress} />
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
          <label htmlFor={`extraction-start-${book.id}`}>{copy.extractionFrom}</label>
          <select
            id={`extraction-start-${book.id}`}
            value={chapterStart}
            onChange={(event) => {
              const start = event.currentTarget.value;
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
          <label htmlFor={`extraction-limit-${book.id}`}>{copy.extractionThrough}</label>
          <select
            id={`extraction-limit-${book.id}`}
            value={chapterLimit}
            onChange={(event) => setChapterLimit(event.currentTarget.value)}
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
          <p>{copy.extractionRangeWarning}</p>
          <button type="submit" disabled={starting}>{submitLabel}</button>
        </form>
      )}
    </div>
  );
}
