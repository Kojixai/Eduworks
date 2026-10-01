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
 * Two consecutive question numbers in a narrow cell ("4" over "5", split by the cell border) are rebuilt by the
 * extractor as the fraction "4/5". Give the line above the number 4 and the line below the number 5 instead.
 */
function stackedLabelsExpanded(lines: PLine[], reqX: number): PLine[] {
  const out = lines.map((l) => l);
  const drop = new Set<number>();
  const FRAC = /^(\d{1,2})\/(\d{1,2})$/;
  for (let i = 1; i + 1 < lines.length; i++) {
    const l = lines[i];
    // a whole line of "a/b" tokens: the first (in the question column) holds two consecutive question numbers,
    // any others (e.g. in the mark column) hold the values of the same two rows
    if (!l.words.length || !l.words.every((w) => FRAC.test(w.text)) || l.words[0].x0 >= reqX - 3) continue;
    const lab = l.words[0].text.match(FRAC)!;
    if (Number(lab[2]) !== Number(lab[1]) + 1) continue;
    const tag = (j: number, which: 1 | 2) => {
      const t = lines[j];
      if (/^\d{1,2}[a-h]?$/.test(t.words[0].text) && t.words[0].x0 < l.words[0].x0 + 25) return; // already numbered
      const add = l.words.map((w) => ({ ...w, text: w.text.match(FRAC)![which], y0: t.y0, y1: t.y1 }));
      out[j] = { ...t, words: [...add, ...t.words].sort((x, y) => x.x0 - y.x0) };
    };
    tag(i - 1, 1);
    tag(i + 1, 2);
    drop.add(i);
  }
  return out.filter((_, i) => !drop.has(i));
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
  let spellingTable = false;
  let lastBase = 0; // question numbers run 1,2,3...: a stray number in an example (e.g. a worked sum) is not a new row

  const close = () => {
    if (!cur) return;
    const j = (c: ColName) => cur!.parts[c].join(" ").replace(/\s+/g, " ").trim();
    cur.requirement = j("req");
    cur.guidance = j("guid");
    const markCol = j("mark");
    cur.raw = [j("q"), cur.requirement, markCol, cur.guidance, j("dom")].filter(Boolean).join(" | ");
    cur.marks = parseMarks(markCol, cur.raw);
    cur.domain = findDomain(`${cur.requirement} ${cur.guidance} ${j("q")}`, j("dom"));
    // reading: "Content domain: 2d – make inferences ..." sits inside the requirement text
    if (!cur.domain) cur.domain = cur.requirement.match(/Content domain:\s*([12][a-h])\b/i)?.[1]?.toLowerCase() ?? null;
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
    for (const line of stackedLabelsExpanded(pg.lines, cols ? cols.find((c) => c[0] === "req")![1] : 60)) {
      if (line.y0 < pg.height * 0.045 || line.y1 > pg.height * 0.955) continue; // header/footer bands
      const text = line.text.trim();
      // "Paper 1: arithmetic" or "7. Mark schemes for Paper 1: arithmetic"
      const sec = text.match(/^(?:\d{1,2}\.\s*)?(?:mark\s+schemes?\s+(?:for\s+)?)?(?:paper|test)\s*(\d)\b/i);
      if (sec && text.length < 70 && (line.bold || line.size >= 12)) {
        close();
        section = text;
        sectionPaper = Number(sec[1]);
        lastBase = 0;
        continue;
      }
      if (/\b(requirement|answer|spelling)s?\b/i.test(text) && /\b(marks?|m\.)(\s|$)/i.test(text) && text.length < 120 && line.words.length <= 12 && !/^\d/.test(line.words[0]?.text ?? "") && line.words.some((w) => /^(qu\.?|q\.?|questions?|additional|guidance)$/i.test(w.text))) {
        // (a table header never starts with a question number: "14 Award TWO marks for the correct answer" is a row)
        const find = (re: RegExp) => line.words.find((w) => re.test(w.text))?.x0;
        const req = find(/^(requirement|answers?|spelling)$/i);
        if (req !== undefined) {
          const quX = Math.min(find(/^(qu\.?|q\.?|question|questions)$/i) ?? line.x0, req - 1);
          const markX = find(/^(marks?|m\.)$/i);
          // Spelling table (Qu. | Spelling | Mark | Content domain reference): the headings are centred over their
          // columns, so the words start left of "Spelling" and the domain reference starts right of "Mark".
          const spelling = line.words.some((w) => /^spelling$/i.test(w.text)) && !line.words.some((w) => /^requirement$/i.test(w.text));
          const c: Array<[ColName, number | undefined]> = [
            ["q", quX],
            ["req", spelling ? Math.min(req, quX + 30) : req],
            ["mark", markX],
            ["guid", find(/^(additional|guidance)$/i)],
            ["dom", spelling && markX !== undefined ? markX + 36 : find(/^(content|domain)$/i)],
          ];
          cols = c.filter((e): e is [ColName, number] => e[1] !== undefined).sort((a, b) => a[1] - b[1]);
          spellingTable = spelling;
          continue; // a repeated header does not close the current row: rows may continue across pages
        }
      }
      if (!cols) continue;
      if (/^total\b/i.test(text) && cur) {
        // end of the last table ("Total 20"): whatever follows (publication boilerplate) is not part of the row
        close();
        continue;
      }
      const first = line.words[0];
      const reqX = cols.find((c) => c[0] === "req")![1];
      let firstIsNum = first && first.x0 < reqX - 3 && ROW_NUM.test(first.text);
      if (firstIsNum) {
        const b = Number(first.text.match(/^\d+/)![0]);
        if (b < 1 || (b !== lastBase && b !== lastBase + 1)) firstIsNum = false;
      }
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
        lastBase = Number(num.match(/^\d+/)![0]);
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
      if (spellingTable) {
        // spelling tables centre their headings over the columns, so split by content instead: the first line of a
        // row is "<word(s)> <mark digit> <domain reference ...>", later lines are more domain reference text
        if (firstIsNum) {
          const k = words.findIndex((w) => /^\d$/.test(w.text));
          if (k > 0) {
            for (const w of words.slice(0, k)) cur.parts.req.push(w.text);
            cur.parts.mark.push(words[k].text);
            for (const w of words.slice(k + 1)) cur.parts.dom.push(w.text);
            continue;
          }
          // no mark digit on the first line (e.g. "20 option S35 ..."): the mark may follow as a stacked "1/20" cell
          const d = words.findIndex((w) => /^S\d{1,3}$/.test(w.text));
          for (const [i, w] of words.entries()) (d > 0 && i >= d ? cur.parts.dom : cur.parts.req).push(w.text);
          continue;
        } else {
          const stackedMark = words.length === 1 && !cur.parts.mark.length ? words[0].text.match(/^(\d)\/\d{1,2}$/) : null;
          if (stackedMark) cur.parts.mark.push(stackedMark[1]);
          else for (const w of words) cur.parts.dom.push(w.text);
          continue;
        }
      }
      for (const w of words) cur.parts[colOf(w.x0)].push(w.text);
    }
  }
  close();
  return rows;
}

/**
 * "Table 1: Content domain coverage" (maths mark schemes): three side-by-side lists of
 * "Qu. | reference" for Papers 1-3, e.g. "10a 3M7/4M7a". The per-question mark scheme tables of the
 * same document carry no domain column, so the references come from here.
 * Returns paper number -> question label ("10a" or "10") -> reference text (primary reference first).
 */
export function parseDomainTable(doc: LinesDoc): Map<number, Map<string, string>> {
  const out = new Map<number, Map<string, string>>();
  for (const pg of doc.pages) {
    const hdrIdx = pg.lines.findIndex((l) => /content domain coverage/i.test(l.text) || (/^qu\.?(\s+qu\.?)+$/i.test(l.text.trim()) && l.words.length >= 2));
    if (hdrIdx < 0) continue;
    const quLine = pg.lines.find((l) => /^qu\.?(\s+qu\.?)+$/i.test(l.text.trim()));
    if (!quLine) continue;
    const qx = quLine.words.map((w) => w.x0);
    const paperNos = qx.map((_, i) => i + 1);
    const cur: Array<{ label: string; ref: string[] } | null> = qx.map(() => null);
    const flush = (i: number) => {
      const c = cur[i];
      if (!c) return;
      const m = out.get(paperNos[i]) ?? new Map<string, string>();
      m.set(c.label, c.ref.join(" ").replace(/\s+/g, " ").trim());
      out.set(paperNos[i], m);
      cur[i] = null;
    };
    for (const line of pg.lines) {
      if (line.y0 <= quLine.y0) continue;
      if (line.y1 > pg.height * 0.955) continue;
      if (/^(reference|content domain|qu\.?)/i.test(line.text.trim()) && !/^\d/.test(line.text.trim())) continue;
      const cols: PWord[][] = qx.map(() => []);
      for (const w of line.words) {
        let ci = 0;
        for (let i = 0; i < qx.length; i++) if (w.x0 >= qx[i] - 8) ci = i;
        cols[ci].push(w);
      }
      for (let i = 0; i < qx.length; i++) {
        const ws = cols[i];
        if (!ws.length) continue;
        if (/^\d{1,2}[a-z]?$/.test(ws[0].text) && ws.length >= 2 && ws[0].x0 < qx[i] + 22) {
          flush(i);
          cur[i] = { label: ws[0].text, ref: [ws.slice(1).map((w) => w.text).join(" ")] };
        } else if (cur[i]) cur[i]!.ref.push(ws.map((w) => w.text).join(" "));
      }
    }
    qx.forEach((_, i) => flush(i));
  }
  return out;
}

/** Fill row.domain from the content-domain table where the per-question table has no domain column. */
export function applyDomainTable(rows: MsRow[], table: Map<number, Map<string, string>>): void {
  if (!table.size) return;
  for (const r of rows) {
    if (r.domain || r.sectionPaper === null) continue;
    const m = table.get(r.sectionPaper);
    const ref = m?.get(r.number) ?? m?.get(r.base);
    if (ref) r.domain = findDomain(ref, ref);
  }
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
  /** table row whose heading names no subject: applies to every paper (conservative) */
  allSubjects?: boolean;
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

// ---------------------------------------------------------------- structured copyright reports
export interface TablesDoc {
  page_count: number;
  pages: Array<{ page: number; items: Array<{ y: number; kind: "text"; text: string } | { y: number; kind: "table"; rows: string[][] }> }>;
}
export const extractTables = (pdf: string) => py<TablesDoc>(["tables", pdf]);

/** Subjects a copyright-report heading refers to ("mathematics and English grammar, ..." names two). */
function headingSubjects(h: string): Subject[] {
  const t = h.toLowerCase();
  const out: Subject[] = [];
  if (/\bmath(s|ematics)\b/.test(t)) out.push("maths");
  if (/grammar|punctuation|spelling/.test(t)) out.push("gps");
  if (/\breading\b/.test(t)) out.push("reading");
  return out;
}
const isHeading = (t: string) => t.length < 160 && /\b(key stage [12]|ks[12])\b/i.test(t) && /\btests?\b|material/i.test(t) && headingSubjects(t).length > 0 && !/exception of|attribution|licen[cs]e/i.test(t);

/** Own STA/Crown material is OGL; anything else (credits, (c) lines, publishers, stock libraries) is third party. */
export function isCrownOnly(owner: string): boolean {
  const o = owner.toLowerCase();
  if (!/crown copyright/.test(o)) return false;
  return !/credit:|©|\(c\)|copyright ©|source:|publisher|reproduced|permission|getty|shutterstock|alamy|istock/.test(o.replace(/crown copyright commissioned by (the standards and testing agency \(sta\)|sta)/g, ""));
}

function pagesOf(cell: string): number[] {
  // "1, 4, 5 and 12" / "6-8" ; a trailing note such as "24pt version, page 5." is a modified-version row: ignored by the caller
  const out: number[] = [];
  for (const part of cell.split(/\s*(?:,|and|&)\s*/)) {
    const r = part.trim().match(/^(\d+)\s*(?:–|-|to)\s*(\d+)$/);
    if (r) for (let i = Number(r[1]); i <= Number(r[2]) && i - Number(r[1]) < 60; i++) out.push(i);
    else if (/^\d+$/.test(part.trim())) out.push(Number(part.trim()));
  }
  return out;
}

/**
 * Table-based copyright report (all STA reports from 2024: rows of Text title | Page(s) | Description |
 * Reference / Copyright owner under a heading naming the test). Crown-only rows are not third party.
 * A heading followed by "There is no third-party material" yields no items for those subjects.
 */
export function itemsFromRows(rows: Array<{ heading: string; cells: string[] }>): CopyrightItem[] {
  const items: CopyrightItem[] = [];
  let inModified = false;
  for (const { heading, cells } of rows) {
    const [title = "", pages = "", desc = "", owner = ""] = cells.map((c) => c.replace(/\s+/g, " ").trim());
    if (!title && !pages && !desc && !owner) continue;
    if (/^text title$/i.test(title) || /^page\(s\)$/i.test(pages)) continue; // header row
    if (/modified (large print|version)|braille|enlarged/i.test(title) && !pages && !owner) {
      inModified = true; // following rows describe the modified versions, which are not ingested
      continue;
    }
    if (inModified) continue;
    if (isCrownOnly(owner)) continue;
    const subjects = headingSubjects(heading);
    const text = [title, pages && `pages ${pages}`, desc, owner].filter(Boolean).join(" | ");
    const pg = pagesOf(pages);
    const readingBooklet = subjects.includes("reading");
    if (!subjects.length) items.push({ subject: null, paperNumber: null, readingBooklet: false, questions: [], pages: pg, text, allSubjects: true });
    for (const subject of subjects) items.push({ subject, paperNumber: null, readingBooklet, questions: [], pages: pg, text });
  }
  return items;
}

export function parseCopyrightTables(doc: TablesDoc): { items: CopyrightItem[]; tables: number } {
  const rows: Array<{ heading: string; cells: string[] }> = [];
  let heading = "";
  let tables = 0;
  for (const pg of doc.pages)
    for (const it of pg.items) {
      if (it.kind === "text") {
        if (isHeading(it.text)) heading = it.text.trim();
      } else {
        tables++;
        for (const r of it.rows) rows.push({ heading, cells: r });
      }
    }
  return { items: itemsFromRows(rows), tables };
}

/** The same report published as a GOV.UK HTML page (2024): h2 headings and <table> rows. */
export function parseCopyrightHtml(html: string): { items: CopyrightItem[]; tables: number } {
  const strip = (h: string) =>
    h.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&#39;|&rsquo;/g, "’").replace(/&nbsp;/g, " ").replace(/&quot;/g, '"').replace(/\s+/g, " ").trim();
  const rows: Array<{ heading: string; cells: string[] }> = [];
  let heading = "";
  let tables = 0;
  const re = /<h[1-4][^>]*>([\s\S]*?)<\/h[1-4]>|<table[\s\S]*?<\/table>/gi;
  for (const m of html.matchAll(re)) {
    if (m[1] !== undefined) {
      const h = strip(m[1]);
      if (isHeading(h)) heading = h;
      continue;
    }
    tables++;
    for (const tr of m[0].matchAll(/<tr[\s\S]*?<\/tr>/gi)) {
      const cells = [...tr[0].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((c) => strip(c[1]));
      rows.push({ heading, cells });
    }
  }
  return { items: itemsFromRows(rows), tables };
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
    if (it.subject !== subject && !it.allSubjects) continue;
    if (subject !== "reading" && it.readingBooklet) continue;
    if (it.paperNumber !== null && paperNumber !== null && it.paperNumber !== paperNumber) continue;
    tp.notes.push(it.text);
    if (!it.questions.length && !it.pages.length) tp.whole = true;
    for (const q of it.questions) tp.questions.add(q.replace(/[a-z]$/, ""));
    for (const p of it.pages) tp.pages.add(p);
  }
  return tp;
}
