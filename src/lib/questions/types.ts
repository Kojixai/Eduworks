/**
 * Question contract shared by ingesters, the quiz player, marking and the back office.
 *
 * Storage (tables in db/migrations/003_questions.sql):
 *   questions            one row per question (qtype, marks, prompt_text, prompt_images_json, prompt_extra_json, explanation)
 *   question_options     mcq / multi_select choices (is_correct), ordering items (correct_position),
 *                        matching items (side 'L'|'R', match_key pairs an L with its R)
 *   accepted_answers     numeric / text_exact answers (several rows = alternatives), table_fill cells (part = cell id)
 *   mark_scheme_entries  official mark scheme text (self_mark and every STA question)
 *
 * Per type:
 *   mcq          options, exactly one is_correct=1.                          response: { optionId }
 *   multi_select options, one or more is_correct=1; all-or-nothing.           response: { optionIds: string[] }
 *   numeric      accepted_answers kind 'numeric' (tolerance optional) or
 *                'fraction' (value equality, e.g. 3/4 == 0.75 == 6/8 only if the mark scheme allows equivalents).
 *                                                                           response: { value: string }
 *   text_exact   accepted_answers kind 'exact' (case-insensitive unless case_sensitive=1) or 'regex'.
 *                                                                           response: { value: string }
 *   ordering     options with correct_position 1..n; all-or-nothing.         response: { order: string[] } (option ids)
 *   matching     options side L/R sharing match_key; all-or-nothing.         response: { pairs: Record<leftId, rightId> }
 *   table_fill   prompt_extra_json = { rows: string[], cols: string[], cells: [{ id, row, col, given? }] }
 *                accepted_answers.part = cell id; if any answer row has `marks`, cells are marked individually,
 *                otherwise every cell must be right for the question's marks.  response: { cells: Record<cellId, string> }
 *   self_mark    mark_scheme_entries shown after answering; the parent/child ticks the marks earned.
 *                                                                           response: { text?: string, awarded: number }
 */
export const QUESTION_TYPES = [
  "mcq",
  "multi_select",
  "numeric",
  "text_exact",
  "ordering",
  "matching",
  "table_fill",
  "self_mark",
] as const;
export type QuestionType = (typeof QUESTION_TYPES)[number];

export const REVIEW_STATUSES = ["auto_ok", "needs_review", "rejected"] as const;
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];

export interface QOption {
  id: string;
  label?: string | null;
  text: string;
  image_path?: string | null;
  is_correct?: number | boolean;
  match_key?: string | null;
  side?: "L" | "R" | null;
  correct_position?: number | null;
  sort?: number;
}

export interface QAnswer {
  id?: string;
  part?: string;
  answer: string;
  kind?: "exact" | "numeric" | "fraction" | "regex";
  tolerance?: number | null;
  case_sensitive?: number | boolean;
  marks?: number | null;
}

export interface TableSpec {
  rows: string[];
  cols: string[];
  cells: Array<{ id: string; row: number; col: number; given?: string }>;
}

export interface MarkSchemeEntry {
  answer_text: string;
  guidance?: string | null;
  marks?: number | null;
}

export interface QuestionForMarking {
  id: string;
  qtype: QuestionType;
  marks: number;
  options: QOption[];
  answers: QAnswer[];
  table?: TableSpec | null;
}

export type Response =
  | { optionId: string }
  | { optionIds: string[] }
  | { value: string }
  | { order: string[] }
  | { pairs: Record<string, string> }
  | { cells: Record<string, string> }
  | { awarded: number; text?: string };

export interface MarkResult {
  marksAwarded: number;
  maxMarks: number;
  correct: boolean;
  /** per-part feedback for table_fill / matching */
  parts?: Record<string, boolean>;
  selfMarked?: boolean;
}
