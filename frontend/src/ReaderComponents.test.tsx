import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ReaderContent } from "./ReaderComponents";

describe("ReaderContent", () => {
  it("renders approved rich-text segments as semantic formatting", () => {
    render(
      <ReaderContent
        chapterContent={{
          id: "chapter-1",
          book_id: "book-1",
          index: 0,
          title: "Kapitel",
          start_position: 0,
          end_position: 0,
          paragraphs: [
            {
              id: "paragraph-1",
              chapter_id: "chapter-1",
              position: 0,
              text: "Ein wichtiger Satz.",
              rich_text: [
                { text: "Ein " },
                { text: "wichtiger", bold: true },
                { text: " Satz." },
              ],
            },
          ],
        }}
        chapterLoading={false}
        currentPosition={0}
        copy={{
          loadingChapter: "Kapitel wird geladen.",
          chapter: "Kapitel",
        } as never}
      />,
    );

    expect(screen.getByText("wichtiger").tagName).toBe("STRONG");
  });

  it("falls back to plain text when rich text is unavailable", () => {
    render(
      <ReaderContent
        chapterContent={{
          id: "chapter-1",
          book_id: "book-1",
          index: 0,
          title: "Kapitel",
          start_position: 0,
          end_position: 0,
          paragraphs: [
            {
              id: "paragraph-1",
              chapter_id: "chapter-1",
              position: 0,
              text: "Sicherer Klartext.",
              rich_text: null,
            },
          ],
        }}
        chapterLoading={false}
        currentPosition={null}
        copy={{
          loadingChapter: "Kapitel wird geladen.",
          chapter: "Kapitel",
        } as never}
      />,
    );

    expect(screen.getByText("Sicherer Klartext.")).toBeInTheDocument();
  });
});
