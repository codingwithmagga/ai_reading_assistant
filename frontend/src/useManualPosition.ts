import { FormEvent, useState } from "react";
import { Chapter, NotesExportResponse, getBookNotesExport } from "./api";
import { Copy, getErrorMessage } from "./i18n";
import { downloadNotesExport } from "./notesExport";

export function useManualPosition({
  chapters,
  copy,
  bookId,
}: {
  chapters: Chapter[];
  copy: Copy;
  bookId: string;
}) {
  const [manualPosition, setManualPosition] = useState<number | null>(null);
  const [manualChapterId, setManualChapterId] = useState("");
  const [percentage, setPercentage] = useState("0");
  const [positionMethod, setPositionMethod] = useState<"chapter" | "percentage">("chapter");
  const [manualPositionError, setManualPositionError] = useState<string | null>(null);
  const [exportLoading, setExportLoading] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

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
    const totalPositions = chapters[chapters.length - 1]?.end_position ?? 0;
    const firstPosition = chapters[0].start_position;
    setManualPosition(
      firstPosition + Math.round((percent / 100) * (totalPositions - firstPosition)),
    );
    setManualPositionError(null);
  }

  async function exportNotes(format: "json" | "markdown", position: number | null) {
    if (position === null || exportLoading) return;
    setExportLoading(true);
    setExportError(null);
    try {
      const data: NotesExportResponse = await getBookNotesExport(bookId, position);
      downloadNotesExport(data, format, copy);
    } catch (error) {
      setExportError(getErrorMessage(error, copy));
    } finally {
      setExportLoading(false);
    }
  }

  function followReader() {
    setManualPosition(null);
    setManualPositionError(null);
  }

  function changeManualChapter(chapterId: string) {
    const chapter = chapters.find((item) => item.id === chapterId);
    if (chapter) setManualChapterId(chapter.id);
    setManualPositionError(null);
  }

  return {
    manualPosition,
    manualChapterId,
    setManualChapterId,
    percentage,
    positionMethod,
    setPositionMethod,
    manualPositionError,
    setManualPositionError,
    setPercentage,
    applyManualPosition,
    followReader,
    changeManualChapter,
    exportLoading,
    exportError,
    exportNotes,
    clearExportError: () => setExportError(null),
  };
}
