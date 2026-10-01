/**
 * Storage primitives shared by both adapters. Domain code (repo.ts, ingesters)
 * only ever talks to this interface, so SQLite and Supabase behave identically.
 */
export type Primitive = string | number | boolean | null;

export type Condition =
  | Primitive
  | Primitive[]
  | { op: "ne" | "gt" | "gte" | "lt" | "lte" | "like" | "ilike"; value: Primitive }
  | { op: "not_in"; value: Primitive[] };

export type Where = Record<string, Condition | undefined>;

export interface SelectOptions {
  where?: Where;
  columns?: string[];
  orderBy?: Array<[string, "asc" | "desc"]>;
  limit?: number;
  offset?: number;
}

export type Row = Record<string, unknown>;

export interface DataStore {
  readonly kind: "sqlite" | "supabase";
  select<T = Row>(table: string, opts?: SelectOptions): Promise<T[]>;
  first<T = Row>(table: string, opts?: SelectOptions): Promise<T | undefined>;
  count(table: string, where?: Where): Promise<number>;
  insert(table: string, rows: Row | Row[]): Promise<void>;
  upsert(table: string, rows: Row | Row[], conflictKeys: string[]): Promise<void>;
  update(table: string, where: Where, patch: Row): Promise<number>;
  delete(table: string, where: Where): Promise<number>;
  /** Run fn atomically where the backend supports it (SQLite). Supabase runs it directly. */
  transaction<T>(fn: () => Promise<T>): Promise<T>;
  migrate(): Promise<string[]>;
  close(): Promise<void>;
}

export const TABLES_IN_DEPENDENCY_ORDER = [
  "licences",
  "sources",
  "raw_files",
  "ingest_runs",
  "ingest_logs",
  "ingest_checkpoints",
  "key_stages",
  "year_groups",
  "subjects",
  "curriculum_statements",
  "units",
  "lessons",
  "unit_lessons",
  "content_blocks",
  "unit_statement_links",
  "lesson_statement_links",
  "difficulty",
  "tags",
  "papers",
  "questions",
  "question_options",
  "accepted_answers",
  "mark_scheme_entries",
  "question_statement_links",
  "question_tags",
  "phonics_words",
  "assessment_rules",
  "assets",
  "coverage_matrix",
  "dataset_stats",
  "books",
  "book_codes",
  "practice_books",
  "practice_texts",
  "practice_units",
  "parents",
  "auth_sessions",
  "redemptions",
  "students",
  "attempts",
  "results",
  "topic_progress",
  "redeem_attempts",
  "mailing_consent",
  "practice_sessions",
  "practice_attempts",
  "admin_audit",
] as const;

/** Content tables that are exported to JSONL and pushed to Supabase (platform tables hold personal data and are not). */
export const CONTENT_TABLES = TABLES_IN_DEPENDENCY_ORDER.filter(
  (t) =>
    ![
      "books", // rebuilt from content/inkworks by the importer
      "book_codes", // access codes are secrets: never exported
      "practice_books",
      "practice_texts",
      "practice_units",
      "parents",
      "auth_sessions",
      "redemptions",
      "students",
      "redeem_attempts",
      "mailing_consent",
      "practice_sessions",
      "practice_attempts",
      "attempts",
      "results",
      "topic_progress",
      "admin_audit",
    ].includes(t),
);

export const PRIMARY_KEYS: Record<string, string[]> = {
  ingest_checkpoints: ["source_id", "key"],
  unit_lessons: ["unit_id", "lesson_id"],
  unit_statement_links: ["unit_id", "statement_id"],
  lesson_statement_links: ["lesson_id", "statement_id"],
  question_statement_links: ["question_id", "statement_id"],
  question_tags: ["question_id", "tag_id"],
  topic_progress: ["student_id", "topic_key"],
  dataset_stats: ["key"],
  schema_migrations: ["id"],
};
export const pkFor = (table: string) => PRIMARY_KEYS[table] ?? ["id"];
