import { FormEventHandler } from "react";
import {
  Chapter,
  ChapterContent,
  EntityListItem,
  EntityLookupResponse,
  RecapResponse,
} from "./api";
import { Copy, getEntityTypeLabel } from "./i18n";

export function ReaderContent({
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

export function PositionControls({
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
  onApplyManualPosition: FormEventHandler<HTMLFormElement>;
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

interface NotesPanelProps {
  copy: Copy;
  activeNotesPosition: number | null;
  exportLoading: boolean;
  exportError: string | null;
  onExport: (format: "json" | "markdown") => void;
  lookupTerm: string;
  selectedTextPosition: number | null;
  lookupResponse: EntityLookupResponse | null;
  lookupError: string | null;
  lookupLoading: boolean;
  onLookupSubmit: FormEventHandler<HTMLFormElement>;
  onLookupTermChange: (value: string) => void;
  onLookupClear: () => void;
  onLookupRetry: () => void;
  characters: EntityListItem[];
  charactersLoading: boolean;
  charactersError: string | null;
  onCharactersRetry: () => void;
  recap: RecapResponse | null;
  recapLoading: boolean;
  recapError: string | null;
  onRecapRetry: () => void;
}

export function NotesPanel({
  copy,
  activeNotesPosition,
  exportLoading,
  exportError,
  onExport,
  lookupTerm,
  selectedTextPosition,
  lookupResponse,
  lookupError,
  lookupLoading,
  onLookupSubmit,
  onLookupTermChange,
  onLookupClear,
  onLookupRetry,
  characters,
  charactersLoading,
  charactersError,
  onCharactersRetry,
  recap,
  recapLoading,
  recapError,
  onRecapRetry,
}: NotesPanelProps) {
  return (
    <aside className="notes-panel" aria-label={copy.notesPanel}>
      <details open>
        <summary>{copy.notesPanel}</summary>
        <section className="notes-data" aria-labelledby="export-notes-heading">
          <h3 id="export-notes-heading">{copy.exportNotes}</h3>
          <p>
            {copy.exportPosition}:{" "}
            {activeNotesPosition === null ? "—" : activeNotesPosition + 1}
          </p>
          <div className="export-actions">
            <button
              type="button"
              onClick={() => onExport("json")}
              disabled={activeNotesPosition === null || exportLoading}
            >
              {copy.exportJson}
            </button>
            <button
              type="button"
              className="secondary-button"
              onClick={() => onExport("markdown")}
              disabled={activeNotesPosition === null || exportLoading}
            >
              {copy.exportMarkdown}
            </button>
          </div>
          {exportLoading && <p role="status">{copy.exportingNotes}</p>}
          {exportError && (
            <p className="message error" role="alert">
              {copy.exportFailed} {exportError}
            </p>
          )}
        </section>
        <form className="lookup-form" onSubmit={onLookupSubmit}>
          <label htmlFor="entity-lookup">{copy.searchEntity}</label>
          <p id="lookup-help" className="help-text">
            {copy.exactMatchHelp}
          </p>
          <input
            id="entity-lookup"
            type="search"
            value={lookupTerm}
            aria-describedby="lookup-help"
            onChange={(event) => onLookupTermChange(event.currentTarget.value)}
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
              onClick={onLookupClear}
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
              onClick={onLookupRetry}
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
                          {fact.chapter_title || fact.chapter_index + 1} ·{" "}
                          {copy.positionLabel} {fact.position + 1}
                        </p>
                        <blockquote>
                          <strong>{copy.source}:</strong> {fact.source_excerpt}
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
              <button type="button" onClick={onCharactersRetry}>
                {copy.retry}
              </button>
            </div>
          ) : characters.length > 0 ? (
            <ul>
              {characters.map((character) => (
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
              <button type="button" onClick={onRecapRetry}>
                {copy.retry}
              </button>
            </div>
          ) : recap && recap.events.length > 0 ? (
            <ul>
              {recap.events.map((event) => (
                <li key={`${event.position}-${event.text}`}>
                  <strong>
                    {event.chapter_title ||
                      `${copy.chapter} ${event.chapter_index + 1}`}
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
  );
}
