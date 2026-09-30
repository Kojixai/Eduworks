/**
 * PDF layer for STA papers: runs ingest/pdf/sta_extract.py (PyMuPDF) and turns its positioned text
 * into mark scheme rows and copyright-report items. Pure parsing functions are exported for tests.
 */
import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import { ROOT } from "../core/context";
import { subjectOf, type Subject } from "./sta_papers_discovery";

const run = promisify(execFile);
export const PY_SCRIPT = path.join(ROOT, "ingest", "pdf", "sta_extract.py");
const PYTHON = process.env.EDU_PYTHON ?? "python3";

export interface PWord { x0: number; y0: number; x1: number; y1: number; text: string; bold: boolean; size: number }
export interface PLine extends Omit<PWord, "text"> { text: string; words: PWord[] }
export interface PPage { page: number; width: number; height: number; lines: PLine[] }
export interface LinesDoc { page_count: number; pages: PPage[] }

export interface ExtractedQuestion {
  number: string;
  page: number;
  bbox: [number, number, number, number];
  text: string;
  lines: string[];
  margin_marks: number | null;
  crop: { path: string; width: number; height: number; bytes: number };
}
export interface QuestionsDoc { page_count: number; front_text: string; back_text: string; questions: ExtractedQuestion[] }

async function py<T>(args: string[]): Promise<T> {
  const { stdout } = await run(PYTHON, [PY_SCRIPT, ...args], { maxBuffer: 256 * 1024 * 1024 });
  return JSON.parse(stdout) as T;
}
export const extractLines = (pdf: string) => py<LinesDoc>(["lines", pdf]);
export const extractQuestions = (pdf: string, outDir: string, maxWidth = 1000) =>
  py<QuestionsDoc>(["questions", pdf, "--out", outDir, "--max-width", String(maxWidth)]);

// ---------------------------------------------------------------- cover facts
/** Total marks / time printed on the cover or instructions page, if any. */
export function coverFacts(front: string, back = ""): { totalMarks: number | null; timeMinutes: number | null } {
  const t = `${front}\n${back}`.replace(/\s+/g, " ");
  const tm =
    t.match(/total (?:of )?(\d{1,3}) marks/i) ??
    t.match(/(\d{1,3}) marks (?:in total|available|altogether)/i) ??
    t.match(/total marks?:? ?\/? ?(\d{1,3})\b/i) ??
    t.match(/\bmarks?:? ?\/ ?(\d{1,3})\b/i);
  const tt = t.match(/(?:you (?:will )?have|you have|should take|allowed|lasts?) (?:about |approximately |around )?(\d{1,3}) minutes/i);
  return { totalMarks: tm ? Number(tm[1]) : null, timeMinutes: tt ? Number(tt[1]) : null };
}

// ---------------------------------------------------------------- mark schemes
export interface MsRow {
  sectionTitle: string | null;
  sectionPaper: number | null;
  number: string; // "12" or "12a"
  base: string; // "12"
  requirement: string;
  marks: number | null;
  guidance: string;
  domain: string | null;
  raw: string;
  page: number;
}

type ColName = "q" | "req" | "mark" | "guid" | "dom";

const MATHS_DOMAIN = /\b([1-6][A-Z]\d{1,2}[a-z]?)\b/;
const GPS_DOMAIN = /\b(G\d{1,2}(?:\.\d{1,2}[a-z]?)?|S\d{1,3})\b/;
const READING_DOMAIN = /^\s*([12][a-h])\s*$/;
const ROW_NUM = /^(\d{1,2})\s?(?:\(?([a-h])\)?)?$/;

export function findDomain(text: string, colText = ""): string | null {
  const m = colText.match(MATHS_DOMAIN) ?? colText.match(GPS_DOMAIN) ?? colText.match(READING_DOMAIN);
  if (m) return m[1];
  const r = text.match(MATHS_DOMAIN) ?? text.match(GPS_DOMAIN);
  return r ? r[1] : null;
}

export function parseMarks(markCol: string, raw: string): number | null {
  const m =
    markCol.match(/(\d+)\s*m(?:arks?)?\b/i) ??
    markCol.match(/^\s*(?:up to\s*)?(\d+)\s*$/i) ??
    raw.match(/\b(?:up to\s*)?(\d)\s*m\b/i) ??
    raw.match(/\b(\d)\s*marks?\b/i);
  return m ? Number(m[1]) : null;
}

/**
 * Parse mark scheme tables. A table header ("Qu." / "Requirement" or "Answer" / "Mark" /
 * "Additional guidance" / optional "Content domain") fixes the column x positions; a row starts
 * with a question number in the first column; following lines until the next row are continuation.
 * Section headings "Paper N: ..." tag rows with their paper.
 */
export function parseMarkScheme(doc: LinesDoc): MsRow[] {
  const rows: MsRow[] = [];
  let cols: Array<[ColName, number]> | null = null;
  let section: string | null = null;
  let sectionPaper: number | null = null;
  let cur: (MsRow & { parts: Record<ColName, string[]> }) | null = null;

  const close = () => {
    if (!cur) return;
    const j = (c: ColName) => cur!.parts[c].join(" ").replace(/\s+/g, " ").trim();
    cur.requirement = j("req");
    cur.guidance = j("guid");
    const markCol = j("mark");
    cur.raw = [j("q"), cur.requirement, markCol, cur.guidance, j("dom")].filter(Boolean).join(" | ");
    cur.marks = parseMarks(markCol, cur.raw);
    cur.domain = findDomain(`${cur.requirement} ${cur.guidance} ${j("q")}`, j("dom"));
    const { parts: _p, ...row } = cur;
    rows.push(row);
    cur = null;
  };
  const colOf = (x: number): ColName => {
    let c: ColName = cols![0][0];
    for (const [name, cx] of cols!) if (x >= cx - 4) c = name;
    return c;
  };

  for (const pg of doc.pages) {
    for (const line of pg.lines) {
      if (line.y0 < pg.height * 0.045 || line.y1 > pg.height * 0.955) continue; // header/footer bands
      const text = line.text.trim();
      const sec = text.match(/^(?:paper|test)\s*(\d)\b/i);
      if (sec && text.length < 70 && (line.bold || line.size >= 12)) {
        close();
        section = text;
        sectionPaper = Number(sec[1]);
        continue;
      }
      if (/\b(requirement|answer)s?\b/i.test(text) && /\bmarks?\b/i.test(text) && text.length < 120 && line.words.length <= 12) {
        const find = (re: RegExp) => line.words.find((w) => re.test(w.text))?.x0;
        const req = find(/^(requirement|answers?)$/i);
        if (req !== undefined) {
          const c: Array<[ColName, number | undefined]> = [
            ["q", Math.min(find(/^(qu\.?|q\.?|question|questions)$/i) ?? line.x0, req - 1)],
            ["req", req],
            ["mark", find(/^marks?$/i)],
            ["guid", find(/^(additional|guidance)$/i)],
            ["dom", find(/^(content|domain)$/i)],
          ];
          cols = c.filter((e): e is [ColName, number] => e[1] !== undefined).sort((a, b) => a[1] - b[1]);
          continue; // a repeated header does not close the current row: rows may continue across pages
        }
      }
      if (!cols) continue;
      const first = line.words[0];
      const reqX = cols.find((c) => c[0] === "req")![1];
      const firstIsNum = first && first.x0 < reqX - 3 && ROW_NUM.test(first.text);
      let words = line.words;
      if (firstIsNum) {
        close();
        // "12" followed by a separate "a" word in the question column
        let num = first.text.replace(/[()\s]/g, "");
        words = line.words.slice(1);
        if (/^\d+$/.test(num) && words[0] && words[0].x0 < reqX - 3 && /^\(?[a-h]\)?$/.test(words[0].text)) {
          num += words[0].text.replace(/[()]/g, "");
          words = words.slice(1);
        }
        cur = {
          sectionTitle: section,
          sectionPaper,
          number: num,
          base: num.match(/^\d+/)![0],
          requirement: "",
          marks: null,
          guidance: "",
          domain: null,
          raw: "",
          page: pg.page,
          parts: { q: [], req: [], mark: [], guid: [], dom: [] },
        };
      }
      if (!cur) continue;
      for (const w of words) cur.parts[colOf(w.x0)].push(w.text);
    }
  }
  close();
  return rows;
}

/** Rows of a multi-paper mark scheme that belong to paper N (all rows when the scheme has no sections). */
export function rowsForPaper(rows: MsRow[], paperNumber: number | null): MsRow[] {
  const hasSections = rows.some((r) => r.sectionPaper !== null);
  if (!hasSections || paperNumber === null) return rows;
  return rows.filter((r) => r.sectionPaper === paperNumber);
}

// ---------------------------------------------------------------- copyright reports
export interface CopyrightItem {
  subject: Subject | null;
  paperNumber: number | null;
  readingBooklet: boolean;
  questions: string[];
  pages: number[];
  text: string;
}

function expandRefs(list: string): string[] {
  const out: string[] = [];
  for (const part of list.split(/\s*(?:,|and|&)\s*/)) {
    const r = part.match(/^(\d+)\s*(?:–|-|to)\s*(\d+)$/);
    if (r) for (let i = Number(r[1]); i <= Number(r[2]) && i - Number(r[1]) < 60; i++) out.push(String(i));
    else if (/^\d+[a-z]?$/.test(part.trim())) out.push(part.trim());
  }
  return out;
}

/**
 * Parse a copyright report into items. Headings ("Mathematics Paper 2: reasoning", "English reading:
 * reading booklet") set the context; acknowledgement lines (©, "reproduced", "permission", photo/image
 * credits) become items with any "question N" / "page N" references they carry.
 */
export function parseCopyright(doc: LinesDoc): CopyrightItem[] {
  const items: CopyrightItem[] = [];
  let ctx: { subject: Subject | null; paperNumber: number | null; readingBooklet: boolean } = {
    subject: null,
    paperNumber: null,
    readingBooklet: false,
  };
  for (const pg of doc.pages) {
    for (const line of pg.lines) {
      const text = line.text.trim();
      if (!text || /copyright report/i.test(text)) continue;
      const subj = subjectOf(text);
      const pn = text.match(/paper\s*(\d)/i);
      const isAck = /©|\(c\)|reproduced|permission|acknowledg|courtesy|licensed|shutterstock|getty|alamy|istock|photo|image|illustration|extract|copyright/i.test(text);
      if (subj && /paper|booklet|test|\bmaths?\b|mathematics|reading|grammar/i.test(text)) {
        const own = { subject: subj, paperNumber: pn ? Number(pn[1]) : null, readingBooklet: /reading booklet|reading and answer booklet/i.test(text) };
        if (!isAck) {
          ctx = own;
          continue;
        }
      }
      if (!isAck) continue;
      const base = subj ? { subject: subj, paperNumber: pn ? Number(pn[1]) : ctx.paperNumber, readingBooklet: /reading booklet/i.test(text) || ctx.readingBooklet } : ctx;
      const questions: string[] = [];
      for (const m of text.matchAll(/\b(?:questions?|q\.?)\s*((?:\d+[a-z]?)(?:\s*(?:,|and|&|–|-|to)\s*\d+[a-z]?)*)/gi)) questions.push(...expandRefs(m[1]));
      const pages: number[] = [];
      for (const m of text.matchAll(/\bpages?\s*(\d+)(?:\s*(?:–|-|to|and)\s*(\d+))?/gi)) {
        const a = Number(m[1]);
        const b = m[2] ? Number(m[2]) : a;
        for (let p = a; p <= b && p - a < 60; p++) pages.push(p);
      }
      items.push({ ...base, questions, pages, text });
    }
  }
  return items;
}

export interface ThirdParty {
  whole: boolean;
  questions: Set<string>;
  pages: Set<number>;
  notes: string[];
}

/**
 * Third-party material that applies to one paper. Reading papers are always wholly third-party
 * (the texts are licensed extracts). Items without question/page references flag the whole paper.
 */
export function thirdPartyFor(items: CopyrightItem[], subject: Subject, paperNumber: number | null, alwaysWhole = false): ThirdParty {
  const tp: ThirdParty = { whole: alwaysWhole, questions: new Set(), pages: new Set(), notes: [] };
  if (alwaysWhole) tp.notes.push("reading texts are third-party material (always)");
  for (const it of items) {
    if (it.subject !== subject) continue;
    if (subject !== "reading" && it.readingBooklet) continue;
    if (it.paperNumber !== null && paperNumber !== null && it.paperNumber !== paperNumber) continue;
    tp.notes.push(it.text);
    if (!it.questions.length && !it.pages.length) tp.whole = true;
    for (const q of it.questions) tp.questions.add(q.replace(/[a-z]$/, ""));
    for (const p of it.pages) tp.pages.add(p);
  }
  return tp;
}
