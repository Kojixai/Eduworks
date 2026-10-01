// Content types. These mirror CONTENT_SCHEMA.txt exactly.

export type KeyStage = "KS1" | "KS2" | "KS3" | "KS4";
export type Subject = "Maths" | "English" | "English Literature" | "English Language";

export interface Section {
  id: string;
  name: string;
  colour: string;
}

export interface BookMeta {
  id: string;
  title: string;
  keyStage: KeyStage;
  year: string;
  subject: Subject;
  pages: number;
  ageRange: string;
  sections: Section[];
}

export interface Text {
  id: string;
  title: string;
  author: string;
  source: string;
  kind: "prose" | "poem" | "playscript" | "nonfiction";
  lines: string[];
  glossary?: [string, string][];
}

export type BarPart = number | string | { label?: string; value?: number };

export type Diagram =
  | { kind: "numberline"; min: number; max: number; step: number; marks?: number[]; labelEvery?: number }
  | { kind: "bar_model"; parts: BarPart[]; total?: number | string; label?: string }
  | { kind: "fraction_bar"; n: number; shaded: number }
  | { kind: "clock"; h: number; m: number }
  | { kind: "array"; rows: number; cols: number }
  | { kind: "coordinates"; points: [number, number, string?][]; max: number; min?: number }
  | { kind: "angle"; deg: number; label?: string }
  | { kind: "polygon"; sides: number }
  | { kind: "bar_chart"; labels: string[]; values: number[]; step: number; title?: string; yLabel?: string };

export type DiagramKind = Diagram["kind"];

interface QBase {
  id: string;
  prompt: string;
  difficulty: number;
  marks: number;
  explanation: string;
  misconception?: string;
  curriculum?: string[];
  diagram?: Diagram;
}

export interface McqQ extends QBase { type: "mcq"; options: string[]; answer: number }
export interface MultiQ extends QBase { type: "multi"; options: string[]; answer: number[] }
export interface NumericQ extends QBase { type: "numeric"; answer: number; tolerance?: number; unit?: string; accept?: string[] }
export interface TextQ extends QBase { type: "text"; answer: string; accept?: string[] }
export interface OrderQ extends QBase { type: "order"; items: string[] }
export interface MatchQ extends QBase { type: "match"; pairs: [string, string][] }
export interface TrueFalseQ extends QBase { type: "truefalse"; statements: { s: string; a: boolean }[] }
export interface ClozeQ extends QBase { type: "cloze"; answer: string[]; accept?: string[][] }
export interface ExtendedQ extends QBase { type: "extended"; model: string; checklist: string[] }

export type Question = McqQ | MultiQ | NumericQ | TextQ | OrderQ | MatchQ | TrueFalseQ | ClozeQ | ExtendedQ;
export type QuestionType = Question["type"];

export const QUESTION_TYPES: QuestionType[] = [
  "mcq", "multi", "numeric", "text", "order", "match", "truefalse", "cloze", "extended",
];
export const DIAGRAM_KINDS: DiagramKind[] = [
  "numberline", "bar_model", "fraction_bar", "clock", "array", "coordinates", "angle", "polygon", "bar_chart",
];

export interface Unit {
  id: string;
  section: string;
  title: string;
  bookPages: number[];
  curriculum: string[];
  summary: string;
  textId: string | null;
  questions: Question[];
}

export interface Book {
  book: BookMeta;
  texts: Text[];
  units: Unit[];
}

/** What the book and unit pages need, without the questions (those are served by the gated content API). */
export interface UnitMeta {
  id: string;
  section: string;
  title: string;
  bookPages: number[];
  /** The "Remember" text. Left out of the app-wide context to keep every page small. */
  summary?: string;
  hasText: boolean;
  questionCount: number;
}

export interface BookSummary {
  meta: BookMeta;
  units: UnitMeta[];
  fixture: boolean;
}

/** Payload returned by /api/content/[bookId]/[unitId]. */
export interface UnitContent {
  unit: Unit;
  text: Text | null;
}
