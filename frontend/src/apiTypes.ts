export interface Book {
  id: string;
  title: string;
  author: string | null;
  language: string | null;
  created_at: string;
  status: string;
}

export interface UploadedBook extends Book {
  source_hash: string;
  reused: boolean;
  error: string | null;
}

export type ExtractionJobStatus = "pending" | "running" | "completed" | "error";

export interface ExtractionJob {
  id: string;
  book_id: string;
  type: string;
  status: ExtractionJobStatus;
  progress: number;
  min_chapter_index: number;
  max_chapter_index: number | null;
  last_completed_chapter_index: number | null;
  last_completed_block_index: number | null;
  error_code: string | null;
  error: string | null;
  input_tokens: number;
  output_tokens: number;
  lease_expires_at: string | null;
  created_at: string;
}

export interface Chapter {
  id: string;
  book_id: string;
  index: number;
  title: string | null;
  start_position: number;
  end_position: number;
}

export interface Paragraph {
  id: string;
  chapter_id: string;
  position: number;
  text: string;
}

export interface ChapterContent extends Chapter {
  paragraphs: Paragraph[];
}

export interface ReadingProgress {
  book_id: string;
  current_position: number | null;
}

export type EntityType = "person" | "place" | "group" | "object" | "concept";
export type FactKind = "description" | "relationship" | "event" | "motivation";

export interface EntityAlias {
  alias: string;
  first_position: number;
}

export interface EntityListItem {
  id: string;
  type: EntityType;
  canonical_name: string;
  first_position: number;
  aliases: EntityAlias[];
}

export interface LookupEntitySummary {
  id: string;
  type: EntityType;
  canonical_name: string;
  first_position: number;
}

export interface LookupFact {
  id: string;
  text: string;
  kind: FactKind;
  position: number;
  chapter_id: string;
  chapter_index: number;
  chapter_title: string | null;
  source_excerpt: string;
}

export interface LookupRelationship {
  id: string;
  entity_a: LookupEntitySummary;
  entity_b: LookupEntitySummary;
  label: string;
  position: number;
}

export interface EntityLookupMatch {
  entity: LookupEntitySummary;
  aliases: EntityAlias[];
  facts: LookupFact[];
  relationships: LookupRelationship[];
}

export interface EntityLookupResponse {
  query: string;
  position: number;
  matches: EntityLookupMatch[];
}

export interface RecapEvent {
  id: string;
  text: string;
  position: number;
  chapter_id: string;
  chapter_index: number;
  chapter_title: string | null;
  source_excerpt: string;
  entity: LookupEntitySummary;
}

export interface RecapResponse {
  position: number;
  events: RecapEvent[];
  characters: EntityListItem[];
}

export interface ChapterOverviewFact {
  id: string;
  text: string;
  kind: FactKind;
  position: number;
  source_excerpt: string;
  entity: LookupEntitySummary;
}

export interface ChapterOverviewChapter {
  id: string;
  index: number;
  title: string | null;
  start_position: number;
  end_position: number;
  facts: ChapterOverviewFact[];
  relationships: LookupRelationship[];
}

export interface ChapterOverviewResponse {
  position: number;
  chapters: ChapterOverviewChapter[];
}

export interface NotesExportEntity extends LookupEntitySummary {
  aliases: EntityAlias[];
  facts: LookupFact[];
}

export interface NotesExportResponse {
  book_id: string;
  title: string;
  author: string | null;
  language: string | null;
  position: number;
  entities: NotesExportEntity[];
  relationships: LookupRelationship[];
  events: RecapEvent[];
}
