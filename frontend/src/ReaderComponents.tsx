import { FormEventHandler, ReactNode } from "react";
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
  ChapterOverviewResponse,
  RichTextSegment,
} from "./api";
import { Copy, getEntityTypeLabel } from "./i18n";
import { ErrorNotice } from "./ErrorNotice";

function RichTextSegmentView({ segment }: { segment: RichTextSegment }) {
  let content: ReactNode = segment.text;
  if (segment.sup) {
    content = <sup>{content}</sup>;
  }
  if (segment.sub) {
    content = <sub>{content}</sub>;
  }
  if (segment.code) {
    content = <code>{content}</code>;
  }
  if (segment.strike) {
    content = <s>{content}</s>;
  }
  if (segment.underline) {
    content = <u>{content}</u>;
  }
  if (segment.italic) {
    content = <em>{content}</em>;
  }
  if (segment.bold) {
    content = <strong>{content}</strong>;
  }
  return <>{content}</>;
}

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
          {paragraph.rich_text?.length
            ? paragraph.rich_text.map((segment, index) => (
                <RichTextSegmentView
                  key={`${paragraph.id}-${index}`}
                  segment={segment}
                />
              ))
            : paragraph.text}
        </Typography>
      ))}
    </article>
  );
}

export function NotesExportPanel({
  copy,
  activeNotesPosition,
  loading,
  error,
  onExport,
  onErrorDismiss,
}: {
  copy: Copy;
  activeNotesPosition: number | null;
  loading: boolean;
  error: string | null;
  onExport: (format: "json" | "markdown") => void;
  onErrorDismiss: () => void;
}) {
  return (
    <Card variant="outlined" className="notes-export-panel">
      <CardContent>
        <Typography component="h3" variant="h6" id="export-notes-heading">
          {copy.exportNotes}
        </Typography>
        <Typography>
          {copy.exportPosition}:{" "}
          {activeNotesPosition === null ? "—" : activeNotesPosition + 1}
        </Typography>
        <div
          role="group"
          aria-label={copy.exportNotes}
          className="export-actions"
        >
          <Button
            variant="contained"
            onClick={() => onExport("json")}
            disabled={activeNotesPosition === null || loading}
          >
            {copy.exportJson}
          </Button>
          <Button
            variant="outlined"
            onClick={() => onExport("markdown")}
            disabled={activeNotesPosition === null || loading}
          >
            {copy.exportMarkdown}
          </Button>
        </div>
        {loading && (
          <Typography role="status" sx={{ mt: 1 }}>
            {copy.exportingNotes}
          </Typography>
        )}
        {error && (
          <ErrorNotice
            copy={copy}
            message={`${copy.exportFailed} ${error}`}
            onDismiss={onErrorDismiss}
          />
        )}
      </CardContent>
    </Card>
  );
}

export function ChapterOverview({
  copy,
  overview,
  loading,
  error,
  onRetry,
  onErrorDismiss,
  onJumpToSource,
}: {
  copy: Copy;
  overview: ChapterOverviewResponse | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  onErrorDismiss: () => void;
  onJumpToSource: (chapterId: string, position: number) => void;
}) {
  if (loading) {
    return <Typography role="status">{copy.loadingChapterOverview}</Typography>;
  }
  if (error) {
    return (
      <ErrorNotice
        copy={copy}
        message={`${copy.notesLoadFailed} ${error}`}
        onDismiss={onErrorDismiss}
      >
        <Button size="small" variant="outlined" onClick={onRetry}>
          {copy.retry}
        </Button>
      </ErrorNotice>
    );
  }
  if (!overview || overview.chapters.length === 0) {
    return <Typography className="empty-state">{copy.noChapterOverview}</Typography>;
  }

  return (
    <div className="chapter-overview" aria-live="polite">
      {overview.chapters.map((chapter) => (
        <Card component="article" variant="outlined" key={chapter.id}>
          <CardContent>
            <Typography component="h2" variant="h6">
              {chapter.title || `${copy.chapter} ${chapter.index + 1}`}
            </Typography>
            <Typography color="text.secondary" className="chapter-overview-status">
              {copy.overviewPositionPrefix} {overview.position + 1}
            </Typography>
            <ul className="chapter-overview-facts">
              {chapter.facts.map((fact) => (
                <li key={fact.id}>
                  <p>
                    <strong>{fact.entity.canonical_name}:</strong> {fact.text}
                  </p>
                  <Typography component="p" variant="body2" color="text.secondary">
                    {fact.kind} · {copy.positionLabel} {fact.position + 1}
                  </Typography>
                  <details className="source-excerpt">
                    <summary>{copy.source}</summary>
                    <blockquote>{fact.source_excerpt}</blockquote>
                    <Button
                      size="small"
                      variant="outlined"
                      onClick={() => onJumpToSource(chapter.id, fact.position)}
                    >
                      {copy.jumpToSource}
                    </Button>
                  </details>
                </li>
              ))}
            </ul>
            {chapter.relationships.length > 0 && (
              <>
                <Typography component="h3" variant="subtitle1">
                  {copy.relationships}
                </Typography>
                <ul>
                  {chapter.relationships.map((relationship) => (
                    <li key={relationship.id}>
                      {relationship.entity_a.canonical_name} {relationship.label}{" "}
                      {relationship.entity_b.canonical_name}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export function DiscoveredPersons({
  copy,
  persons,
  overview,
  loading,
  error,
  onRetry,
  onErrorDismiss,
  onJumpToSource,
}: {
  copy: Copy;
  persons: EntityListItem[];
  overview: ChapterOverviewResponse | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  onErrorDismiss: () => void;
  onJumpToSource: (chapterId: string, position: number) => void;
}) {
  if (loading) {
    return <Typography role="status">{copy.loadingDiscoveredPersons}</Typography>;
  }
  if (error) {
    return (
      <ErrorNotice
        copy={copy}
        message={`${copy.notesLoadFailed} ${error}`}
        onDismiss={onErrorDismiss}
      >
        <Button size="small" variant="outlined" onClick={onRetry}>
          {copy.retry}
        </Button>
      </ErrorNotice>
    );
  }

  const peopleById = new Map(
    persons
      .filter((person) => person.type === "person")
      .map((person) => [person.id, person]),
  );
  for (const chapter of overview?.chapters ?? []) {
    for (const fact of chapter.facts) {
      if (
        fact.entity.type === "person" &&
        !peopleById.has(fact.entity.id)
      ) {
        peopleById.set(fact.entity.id, {
          id: fact.entity.id,
          type: "person",
          canonical_name: fact.entity.canonical_name,
          first_position: fact.entity.first_position,
          aliases: [],
        });
      }
    }
  }
  const people = Array.from(peopleById.values()).sort(
    (left, right) =>
      left.first_position - right.first_position ||
      left.canonical_name.localeCompare(right.canonical_name) ||
      left.id.localeCompare(right.id),
  );

  if (people.length === 0) {
    return <Typography className="empty-state">{copy.noDiscoveredPersons}</Typography>;
  }

  const relationships = (overview?.chapters ?? [])
    .flatMap((chapter) => chapter.relationships)
    .filter(
      (relationship) =>
        relationship.entity_a.type === "person" &&
        relationship.entity_b.type === "person",
    );

  return (
    <div className="discovered-persons" aria-live="polite">
      {overview && (
        <Typography color="text.secondary" className="discovered-persons-status">
          {copy.discoveredPersonsPositionPrefix} {overview.position + 1}
        </Typography>
      )}
      <div className="discovered-person-grid">
        {people.map((person) => {
          const facts = (overview?.chapters ?? [])
            .flatMap((chapter) =>
              chapter.facts
                .filter((fact) => fact.entity.id === person.id)
                .map((fact) => ({ fact, chapter })),
            )
            .sort(
              (left, right) =>
                left.fact.position - right.fact.position ||
                left.fact.id.localeCompare(right.fact.id),
            );
          return (
            <Card component="article" variant="outlined" key={person.id}>
              <CardContent>
                <Typography component="h2" variant="h6">
                  {person.canonical_name}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {copy.positionLabel} {person.first_position + 1}
                </Typography>
                {person.aliases.length > 0 && (
                  <>
                    <Typography component="h3" variant="subtitle1" sx={{ mt: 1.5 }}>
                      {copy.personAliases}
                    </Typography>
                    <ul>
                      {person.aliases.map((alias) => (
                        <li key={`${alias.alias}-${alias.first_position}`}>
                          {alias.alias}
                        </li>
                      ))}
                    </ul>
                  </>
                )}
                <Typography component="h3" variant="subtitle1" sx={{ mt: 1.5 }}>
                  {copy.personFacts}
                </Typography>
                {facts.length === 0 ? (
                  <Typography color="text.secondary">{copy.noPersonFacts}</Typography>
                ) : (
                  <ul className="person-facts">
                    {facts.map(({ fact, chapter }) => (
                      <li key={fact.id}>
                        <p>{fact.text}</p>
                        <Typography component="p" variant="body2" color="text.secondary">
                          {fact.kind} · {copy.positionLabel} {fact.position + 1}
                        </Typography>
                        <details className="source-excerpt">
                          <summary>{copy.source}</summary>
                          <blockquote>{fact.source_excerpt}</blockquote>
                          <Button
                            size="small"
                            variant="outlined"
                            onClick={() => onJumpToSource(chapter.id, fact.position)}
                          >
                            {copy.jumpToSource}
                          </Button>
                        </details>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
      <Card variant="outlined" className="discovered-person-relationships">
        <CardContent>
          <Typography component="h2" variant="h6">
            {copy.personRelationships}
          </Typography>
          {relationships.length === 0 ? (
            <Typography color="text.secondary">{copy.noPersonRelationships}</Typography>
          ) : (
            <ul>
              {relationships.map((relationship) => {
                const chapter = overview?.chapters.find(
                  (item) =>
                    item.start_position <= relationship.position &&
                    relationship.position <= item.end_position,
                );
                return (
                  <li key={relationship.id}>
                    <span>
                      {relationship.entity_a.canonical_name} {relationship.label}{" "}
                      {relationship.entity_b.canonical_name}
                    </span>{" "}
                    <Typography component="span" variant="body2" color="text.secondary">
                      · {copy.positionLabel} {relationship.position + 1}
                    </Typography>
                    {chapter && (
                      <Button
                        size="small"
                        variant="text"
                        onClick={() =>
                          onJumpToSource(chapter.id, relationship.position)
                        }
                      >
                        {copy.jumpToSource}
                      </Button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
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
            fullWidth
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
              fullWidth
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
  onJumpToSource: (chapterId: string, position: number) => void;
}

export function NotesPanel({
  copy,
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
  onJumpToSource,
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
                          <Button
                            size="small"
                            variant="outlined"
                            onClick={() =>
                              onJumpToSource(fact.chapter_id, fact.position)
                            }
                          >
                            {copy.jumpToSource}
                          </Button>
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

        </AccordionDetails>
      </Accordion>
    </Card>
  );
}
