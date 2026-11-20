import { FormEventHandler } from "react";
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Button,
  Card,
  CardContent,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import {
  Chapter,
  ChapterContent,
  EntityListItem,
  EntityLookupResponse,
  EntityType,
  RecapResponse,
} from "./api";
import { Copy, getEntityTypeLabel } from "./i18n";
import { ErrorNotice } from "./ErrorNotice";

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
      <Typography component="h3" variant="h6">
        {chapterContent.title || `${copy.chapter} ${chapterContent.index + 1}`}
      </Typography>
      {chapterContent.paragraphs.map((paragraph) => (
        <Typography
          component="p"
          key={paragraph.id}
          id={`paragraph-${paragraph.position}`}
          data-reading-position={paragraph.position}
          aria-current={
            currentPosition === paragraph.position ? "location" : undefined
          }
        >
          {paragraph.text}
        </Typography>
      ))}
    </article>
  );
}

export function PositionControls({
  activeNotesPosition,
  chapters,
  copy,
  manualChapterId,
  manualPosition,
  manualPositionError,
  onApplyManualPosition,
  onFollowReader,
  onManualChapterChange,
  onManualPositionMethodChange,
  onManualPositionErrorDismiss,
  onPercentageChange,
  percentage,
  positionMethod,
  totalPositions,
}: {
  activeNotesPosition: number | null;
  chapters: Chapter[];
  copy: Copy;
  manualChapterId: string;
  manualPosition: number | null;
  manualPositionError: string | null;
  onApplyManualPosition: FormEventHandler<HTMLFormElement>;
  onFollowReader: () => void;
  onManualChapterChange: (chapterId: string) => void;
  onManualPositionMethodChange: (value: "chapter" | "percentage") => void;
  onManualPositionErrorDismiss: () => void;
  onPercentageChange: (value: string) => void;
  percentage: string;
  positionMethod: "chapter" | "percentage";
  totalPositions: number;
}) {
  const manualPositionDisplay =
    activeNotesPosition === null ? "—" : activeNotesPosition + 1;

  return (
    <Card
      component="section"
      variant="outlined"
      className="notes-position"
      aria-labelledby="notes-position-heading"
    >
      <CardContent className="notes-position-status">
        <Typography component="h3" variant="h6" id="notes-position-heading">
          {copy.notesPosition}
        </Typography>
        <Typography role="status" color="text.secondary">
          {manualPosition === null
            ? copy.readerPositionActive
            : copy.manualPositionActive}
        </Typography>
        <Typography>
          {manualPositionDisplay} {copy.positionOf} {totalPositions + 1}
        </Typography>
        {manualPosition !== null && (
          <Button size="small" variant="outlined" onClick={onFollowReader}>
            {copy.followReader}
          </Button>
        )}
      </CardContent>
      <form
        className="manual-position-form"
        noValidate
        onSubmit={onApplyManualPosition}
      >
        <Typography component="h4" variant="subtitle1">
          {copy.manualPosition}
        </Typography>
        <Stack spacing={1.5} className="manual-position-fields">
          <TextField
            select
            size="small"
            label={copy.positionMethod}
              value={positionMethod}
              onChange={(event) => {
                if (
                  event.target.value === "chapter" ||
                  event.target.value === "percentage"
                ) {
                  onManualPositionMethodChange(event.target.value);
                }
              }}
            SelectProps={{ native: true }}
            >
              <option value="chapter">{copy.byChapter}</option>
              <option value="percentage">{copy.byPercentage}</option>
          </TextField>
          {positionMethod === "chapter" ? (
            <TextField
              select
              size="small"
              label={copy.positionChapter}
                value={manualChapterId}
                onChange={(event) => {
                  onManualChapterChange(event.target.value);
                }}
              SelectProps={{ native: true }}
              >
                {chapters.map((chapter) => (
                  <option key={chapter.id} value={chapter.id}>
                    {chapter.title || `${copy.chapter} ${chapter.index + 1}`}
                  </option>
                ))}
            </TextField>
          ) : (
            <TextField
              size="small"
              label={copy.percentage}
              type="number"
              inputProps={{ min: 0, max: 100, step: "any" }}
              value={percentage}
              onChange={(event) =>
                onPercentageChange(event.target.value)
              }
            />
          )}
        </Stack>
        {manualPositionError && (
          <ErrorNotice
            copy={copy}
            message={manualPositionError}
            onDismiss={onManualPositionErrorDismiss}
          />
        )}
        <Button type="submit" variant="contained">
          {copy.applyPosition}
        </Button>
      </form>
    </Card>
  );
}

interface NotesPanelProps {
  copy: Copy;
  activeNotesPosition: number | null;
  exportLoading: boolean;
  exportError: string | null;
  onExport: (format: "json" | "markdown") => void;
  onExportErrorDismiss: () => void;
  lookupTerm: string;
  lookupEntityType: EntityType | "all";
  lookupEntityOptions: EntityListItem[];
  selectedTextPosition: number | null;
  lookupResponse: EntityLookupResponse | null;
  lookupError: string | null;
  lookupLoading: boolean;
  onLookupSubmit: FormEventHandler<HTMLFormElement>;
  onLookupTermChange: (value: string) => void;
  onLookupClear: () => void;
  onLookupRetry: () => void;
  onLookupEntityTypeChange: (value: EntityType | "all") => void;
  onLookupEntityNameChange: (value: string) => void;
  recap: RecapResponse | null;
  recapLoading: boolean;
  recapError: string | null;
  onRecapRetry: () => void;
  onRecapErrorDismiss: () => void;
}

export function NotesPanel({
  copy,
  activeNotesPosition,
  exportLoading,
  exportError,
  onExport,
  onExportErrorDismiss,
  lookupTerm,
  lookupEntityType,
  lookupEntityOptions,
  selectedTextPosition,
  lookupResponse,
  lookupError,
  lookupLoading,
  onLookupSubmit,
  onLookupTermChange,
  onLookupClear,
  onLookupRetry,
  onLookupEntityTypeChange,
  onLookupEntityNameChange,
  recap,
  recapLoading,
  recapError,
  onRecapRetry,
  onRecapErrorDismiss,
}: NotesPanelProps) {
  const filteredEntityOptions =
    lookupEntityType === "all"
      ? lookupEntityOptions
      : lookupEntityOptions.filter(
          (entity) => entity.type === lookupEntityType,
        );

  return (
    <Card
      component="aside"
      variant="outlined"
      className="notes-panel"
      aria-label={copy.notesPanel}
    >
      <Accordion defaultExpanded disableGutters elevation={0}>
        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
          <Typography component="span" variant="subtitle1" fontWeight={650}>
            {copy.notesPanel}
          </Typography>
        </AccordionSummary>
        <AccordionDetails>
        <section className="notes-data" aria-labelledby="export-notes-heading">
          <Typography component="h3" variant="h6" id="export-notes-heading">
            {copy.exportNotes}
          </Typography>
          <Typography>
            {copy.exportPosition}:{" "}
            {activeNotesPosition === null ? "—" : activeNotesPosition + 1}
          </Typography>
          <Stack direction="row" spacing={1} flexWrap="wrap" className="export-actions">
            <Button
              variant="contained"
              onClick={() => onExport("json")}
              disabled={activeNotesPosition === null || exportLoading}
            >
              {copy.exportJson}
            </Button>
            <Button
              variant="outlined"
              onClick={() => onExport("markdown")}
              disabled={activeNotesPosition === null || exportLoading}
            >
              {copy.exportMarkdown}
            </Button>
          </Stack>
          {exportLoading && (
            <Typography role="status" sx={{ mt: 1 }}>
              {copy.exportingNotes}
            </Typography>
          )}
          {exportError && (
            <ErrorNotice
              copy={copy}
              message={`${copy.exportFailed} ${exportError}`}
              onDismiss={onExportErrorDismiss}
            />
          )}
        </section>
        <form className="lookup-form" onSubmit={onLookupSubmit}>
          <Typography component="label" htmlFor="entity-lookup" fontWeight={600}>
            {copy.searchEntity}
          </Typography>
          <Typography id="lookup-help" className="help-text">
            {copy.exactMatchHelp}
          </Typography>
          <label htmlFor="entity-type-filter">{copy.entityTypeFilter}</label>
          <select
            id="entity-type-filter"
            value={lookupEntityType}
            onChange={(event) =>
              onLookupEntityTypeChange(
                event.currentTarget.value as EntityType | "all",
              )
            }
          >
            <option value="all">{copy.allEntityTypes}</option>
            <option value="person">{getEntityTypeLabel("person", copy)}</option>
            <option value="place">{getEntityTypeLabel("place", copy)}</option>
            <option value="group">{getEntityTypeLabel("group", copy)}</option>
            <option value="object">{getEntityTypeLabel("object", copy)}</option>
            <option value="concept">{getEntityTypeLabel("concept", copy)}</option>
          </select>
          <label htmlFor="known-entity-select">
            {copy.selectKnownEntity}
          </label>
          <select
            id="known-entity-select"
            value={lookupTerm && filteredEntityOptions.some(
              (entity) =>
                entity.canonical_name === lookupTerm ||
                entity.aliases.some((alias) => alias.alias === lookupTerm),
            ) ? lookupTerm : ""}
            onChange={(event) =>
              onLookupEntityNameChange(event.currentTarget.value)
            }
          >
            <option value="">{copy.chooseKnownEntity}</option>
            {filteredEntityOptions.flatMap((entity) => [
              <option
                key={`canonical-${entity.id}`}
                value={entity.canonical_name}
              >
                {entity.canonical_name} ({getEntityTypeLabel(entity.type, copy)})
              </option>,
              ...entity.aliases.map((alias) => (
                <option
                  key={`alias-${entity.id}-${alias.alias}`}
                  value={alias.alias}
                >
                  {alias.alias} ({getEntityTypeLabel(entity.type, copy)})
                </option>
              )),
            ])}
          </select>
          <TextField
            id="entity-lookup"
            type="search"
            size="small"
            fullWidth
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
          <Stack direction="row" spacing={1} flexWrap="wrap" className="lookup-actions">
            <Button type="submit" variant="contained" disabled={lookupLoading}>
              {lookupLoading ? copy.searchLoading : copy.search}
            </Button>
            <Button
              variant="outlined"
              onClick={onLookupClear}
              disabled={!lookupTerm && !lookupResponse && !lookupError}
            >
              {copy.clearSearch}
            </Button>
          </Stack>
        </form>
        {lookupError && (
          <ErrorNotice
            copy={copy}
            message={`${copy.searchFailed} ${lookupError}`}
            onDismiss={onLookupClear}
          >
            <Button
              size="small"
              variant="outlined"
              onClick={onLookupRetry}
              disabled={lookupLoading}
            >
              {copy.retry}
            </Button>
          </ErrorNotice>
        )}
        {lookupLoading && (
          <Typography role="status">{copy.searchLoading}</Typography>
        )}
        {lookupResponse && lookupResponse.matches.length === 0 && (
          <Typography className="empty-state" role="status">
            {copy.noSearchMatches}
          </Typography>
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
                        <details className="source-excerpt">
                          <summary>{copy.source}</summary>
                          <blockquote>{fact.source_excerpt}</blockquote>
                        </details>
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
          aria-labelledby="recap-heading"
          aria-live="polite"
          aria-busy={recapLoading}
        >
          <Typography component="h3" variant="h6" id="recap-heading">
            {copy.recapTitle}
          </Typography>
          {recapLoading ? (
            <Typography role="status">{copy.loadingRecap}</Typography>
          ) : recapError ? (
            <ErrorNotice
              copy={copy}
              message={`${copy.notesLoadFailed} ${recapError}`}
              onDismiss={onRecapErrorDismiss}
            >
              <Button size="small" variant="outlined" onClick={onRecapRetry}>
                {copy.retry}
              </Button>
            </ErrorNotice>
          ) : recap && recap.events.length > 0 ? (
            <ul>
              {recap.events.map((event) => (
                <li key={`${event.position}-${event.text}`}>
                  <strong>
                    {event.chapter_title ||
                      `${copy.chapter} ${event.chapter_index + 1}`}
                  </strong>
                  <p>{event.text}</p>
                  <details className="source-excerpt">
                    <summary>{copy.source}</summary>
                    <blockquote>{event.source_excerpt}</blockquote>
                  </details>
                </li>
              ))}
            </ul>
          ) : (
            <Typography className="empty-state">{copy.noRecapEvents}</Typography>
          )}
        </section>
        </AccordionDetails>
      </Accordion>
    </Card>
  );
}
