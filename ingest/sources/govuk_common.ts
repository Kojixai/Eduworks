/**
 * Shared helpers for the gov.uk ingesters (nc_govuk, dfe_subject_content, sta_phonics, sta_mtc_guidance):
 *  - a Fetcher abstraction (default: IngestContext.fetchRaw, which keeps raw bytes out of git and
 *    records url + sha256 + retrieval date; tests inject fixtures),
 *  - Content API helpers that go through the fetcher,
 *  - HTML -> block model (headings / paragraphs / nested list items),
 *  - PDF -> block model / text / phonics pages via ingest/pdf/govuk_pdf.py (PyMuPDF),
 *  - text normalisation + similarity, blocked-host handling.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { IngestContext, sha256, shortHash } from "../core/context";
import { GOVUK, type GovukAttachment, type GovukContent, type GovukLink } from "../core/govuk";
import { BlockedHostError } from "../core/http";

// ---------------------------------------------------------------- fetching

export interface Fetched {
  body: Buffer;
  checksum: string;
  contentType: string;
  /** Local path of the raw file when it exists on disk (needed for PDFs). */
  path?: string;
}
export type Fetcher = (url: string) => Promise<Fetched>;

export interface GovukIngestOptions {
  /** Injected fetcher (tests). Default: ctx.fetchRaw. */
  fetcher?: Fetcher;
  /** Ignore checkpoints and re-parse everything (also EDU_FORCE=1). */
  force?: boolean;
}

export function defaultFetcher(ctx: IngestContext): Fetcher {
  return async (url) => {
    const r = await ctx.fetchRaw(url);
    return { body: r.body, checksum: r.checksum, contentType: r.contentType, path: r.path };
  };
}

export const apiUrl = (basePath: string) => `${GOVUK}/api/content${basePath.startsWith("/") ? basePath : "/" + basePath}`;
export const pageUrl = (basePath: string) =>
  basePath.startsWith("http") ? basePath : `${GOVUK}${basePath.startsWith("/") ? basePath : "/" + basePath}`;

/** Path part of a gov.uk URL or base path ("/government/..."). */
export function basePathOf(urlOrPath: string): string {
  if (urlOrPath.startsWith("http")) return new URL(urlOrPath).pathname.replace(/^\/api\/content/, "");
  return urlOrPath.startsWith("/") ? urlOrPath : "/" + urlOrPath;
}

export async function fetchContent(fetcher: Fetcher, basePath: string): Promise<{ content: GovukContent; url: string; checksum: string }> {
  const bp = basePathOf(basePath);
  const r = await fetcher(apiUrl(bp));
  const content = JSON.parse(r.body.toString("utf8")) as GovukContent;
  if (!content.base_path) content.base_path = bp;
  content.details ??= {};
  content.links ??= {};
  return { content, url: pageUrl(content.base_path ?? bp), checksum: r.checksum };
}

/** Like fetchContent but returns null (and logs) on 404-style failures; BlockedHostError propagates. */
export async function tryContent(ctx: IngestContext, fetcher: Fetcher, basePath: string) {
  try {
    return await fetchContent(fetcher, basePath);
  } catch (e) {
    if (e instanceof BlockedHostError) throw e;
    await ctx.log("warn", "fetch_failed", `Could not load ${basePath}: ${(e as Error).message}`);
    return null;
  }
}

export function absAttachments(c: GovukContent): GovukAttachment[] {
  return (c.details.attachments ?? []).map((a) => ({ ...a, url: a.url.startsWith("http") ? a.url : `${GOVUK}${a.url}` }));
}
export const isPdf = (a: GovukAttachment) =>
  /pdf/i.test(a.content_type ?? "") || /\.pdf($|\?)/i.test(a.url) || /\.pdf$/i.test(a.filename ?? "");
export const isHtmlAttachment = (a: GovukAttachment) =>
  a.attachment_type === "html" || /text\/html/i.test(a.content_type ?? "") || (/www\.gov\.uk\/government\//.test(a.url) && !isPdf(a));

/** Documents linked from a collection (links.documents plus details.collection_groups ordering fallbacks). */
export function collectionDocs(c: GovukContent): GovukLink[] {
  const out = new Map<string, GovukLink>();
  for (const d of c.links.documents ?? []) out.set(d.base_path, d);
  for (const d of c.links.children ?? []) if (!out.has(d.base_path)) out.set(d.base_path, d);
  return [...out.values()];
}

/** Save a fetched body to disk when the fetcher did not (PDF tools need a path). */
export function ensurePath(f: Fetched, hint: string): string {
  if (f.path && fs.existsSync(f.path)) return f.path;
  const dir = path.join(os.tmpdir(), "eduworks-govuk");
  fs.mkdirSync(dir, { recursive: true });
  const p = path.join(dir, `${shortHash(hint)}-${f.checksum.slice(0, 8)}.pdf`);
  fs.writeFileSync(p, f.body);
  return p;
}

// ---------------------------------------------------------------- blocked host

/** On BlockedHostError: log host_blocked naming the host, finish 'blocked', return true. */
export async function handleBlocked(ctx: IngestContext, e: unknown): Promise<boolean> {
  if (!(e instanceof BlockedHostError)) return false;
  await ctx.log("error", "host_blocked", `Host ${e.host} is blocked from this environment; run again when it is reachable.`, { host: e.host });
  await ctx.finish("blocked", `host_blocked: ${e.host}`);
  return true;
}

export async function failRun(ctx: IngestContext, e: unknown) {
  await ctx.log("error", "exception", String((e as Error)?.stack ?? e));
  await ctx.finish("failed", String(e));
}

// ---------------------------------------------------------------- text

const ENTITIES: Record<string, string> = {
  nbsp: " ", amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", rsquo: "’", lsquo: "‘", ldquo: "“", rdquo: "”",
  ndash: "–", mdash: "—", hellip: "…", times: "×", divide: "÷", minus: "−", pound: "£", deg: "°", frac12: "½",
  frac14: "¼", frac34: "¾", le: "≤", ge: "≥", ne: "≠", plusmn: "±", sup2: "²", sup3: "³", middot: "·", bull: "•",
};
export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z0-9]+);/gi, (m, e: string) => {
    if (e[0] === "#") {
      const n = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

export const cleanText = (s: string) => decodeEntities(s).replace(/\s+/g, " ").trim();

/** Lowercase, unify quotes/dashes, drop punctuation. Used for cross-checking statements. */
export function normText(s: string): string {
  return s
    .toLowerCase()
    .replace(/[’‘`]/g, "'")
    .replace(/(\d),(\d{3})/g, "$1$2")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}
const NUMBER_WORDS: Record<string, string> = {
  one: "1", two: "2", three: "3", four: "4", five: "5", six: "6", seven: "7", eight: "8", nine: "9", ten: "10",
  eleven: "11", twelve: "12", hundred: "100", thousand: "1000", first: "1st", second: "2nd", third: "3rd",
};
const tokens = (s: string) =>
  normText(s)
    .split(" ")
    .filter((t) => t.length > 0)
    .map((t) => NUMBER_WORDS[t] ?? t);

/** Token similarity: Dice plus containment of `a` in `b` (for merged/split statements). */
export function similarity(a: string, b: string): { dice: number; containA: number; containB: number } {
  const A = new Set(tokens(a));
  const B = new Set(tokens(b));
  if (!A.size || !B.size) return { dice: 0, containA: 0, containB: 0 };
  let inter = 0;
  for (const t of A) if (B.has(t)) inter++;
  return { dice: (2 * inter) / (A.size + B.size), containA: inter / A.size, containB: inter / B.size };
}

// ---------------------------------------------------------------- block model

export type Block =
  | { kind: "h"; level: number; text: string }
  | { kind: "p"; text: string }
  | { kind: "li"; text: string; children: Block[] };

/**
 * Minimal HTML -> blocks for gov.uk Content API bodies (govspeak output: h2-h6, p, ul/ol/li, tables).
 * Nested lists become li.children. Table rows become paragraphs (cells joined with " | ").
 */
export function htmlToBlocks(html: string): Block[] {
  const src = html.replace(/<!--[\s\S]*?-->/g, "").replace(/<(script|style)[\s\S]*?<\/\1>/gi, "");
  const tagRe = /<\/?([a-zA-Z0-9]+)(\s[^>]*)?\/?>/g;
  const root: Block[] = [];
  // stack of open list items; text goes to the innermost open li, else to the current p/h buffer
  const liStack: Array<{ block: Extract<Block, { kind: "li" }>; buf: string }> = [];
  let buf = "";
  let bufKind: "p" | "h" | null = null;
  let hLevel = 0;
  let cells: string[] | null = null;
  let cellBuf = "";
  let inCell = false;

  const emit = (b: Block) => {
    const top = liStack[liStack.length - 1];
    if (top) top.block.children.push(b);
    else root.push(b);
  };
  const flushBuf = () => {
    const t = cleanText(buf);
    buf = "";
    if (!t || !bufKind) {
      bufKind = null;
      return;
    }
    if (bufKind === "h") emit({ kind: "h", level: hLevel, text: t });
    else {
      const top = liStack[liStack.length - 1];
      // a <p> inside an <li> is part of that item's text
      if (top) top.buf += " " + t;
      else emit({ kind: "p", text: t });
    }
    bufKind = null;
  };
  const addText = (t: string) => {
    if (inCell) cellBuf += t;
    else if (bufKind) buf += t;
    else if (liStack.length) liStack[liStack.length - 1].buf += t;
    else if (t.trim()) {
      bufKind = "p";
      buf += t;
    }
  };

  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = tagRe.exec(src))) {
    addText(src.slice(last, m.index));
    last = tagRe.lastIndex;
    const tag = m[1].toLowerCase();
    const closing = m[0][1] === "/";
    if (/^h[1-6]$/.test(tag)) {
      if (!closing) {
        flushBuf();
        bufKind = "h";
        hLevel = Number(tag[1]);
      } else flushBuf();
    } else if (tag === "p" || tag === "div" || tag === "blockquote") {
      if (!closing) {
        if (bufKind === "p") flushBuf();
        if (!liStack.length && !inCell) bufKind = "p";
      } else if (bufKind === "p") flushBuf();
    } else if (tag === "br") {
      addText(" ");
    } else if (tag === "li") {
      if (!closing) {
        flushBuf();
        const block: Extract<Block, { kind: "li" }> = { kind: "li", text: "", children: [] };
        emit(block);
        liStack.push({ block, buf: "" });
      } else {
        flushBuf();
        const top = liStack.pop();
        if (top) top.block.text = cleanText(top.buf);
      }
    } else if (tag === "ul" || tag === "ol") {
      flushBuf();
      if (closing) {
        // tolerate missing </li> before </ul>
      }
    } else if (tag === "tr") {
      if (!closing) {
        flushBuf();
        cells = [];
      } else if (cells) {
        const t = cells.map(cleanText).filter(Boolean).join(" | ");
        if (t) emit({ kind: "p", text: t });
        cells = null;
      }
    } else if (tag === "td" || tag === "th") {
      if (!closing) {
        inCell = true;
        cellBuf = "";
      } else {
        inCell = false;
        cells?.push(cellBuf);
      }
    }
  }
  addText(src.slice(last));
  flushBuf();
  while (liStack.length) {
    const top = liStack.pop()!;
    top.block.text = cleanText(top.buf);
  }
  return pruneEmpty(root);
}

function pruneEmpty(bs: Block[]): Block[] {
  const out: Block[] = [];
  for (const b of bs) {
    if (b.kind === "li") {
      b.children = pruneEmpty(b.children);
      if (!b.text && !b.children.length) continue;
      if (!b.text) {
        out.push(...b.children);
        continue;
      }
    }
    out.push(b);
  }
  return out;
}

/** Blocks -> plain text, one heading / paragraph / list item per line (list items flattened). */
export function blocksToText(bs: Block[]): string {
  const out: string[] = [];
  const walk = (b: Block) => {
    out.push(b.text);
    if (b.kind === "li") b.children.forEach(walk);
  };
  bs.forEach(walk);
  return out.join("\n");
}
export const htmlToLinesText = (html: string) => blocksToText(htmlToBlocks(html));

// ---------------------------------------------------------------- PDF

export const PDF_SCRIPT = path.resolve(__dirname, "..", "pdf", "govuk_pdf.py");

function runPy<T>(mode: string, file: string): T {
  const out = execFileSync(process.env.EDU_PYTHON ?? "python3", [PDF_SCRIPT, mode, file], {
    maxBuffer: 256 * 1024 * 1024,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  return JSON.parse(out) as T;
}

export interface PdfRawBlock {
  type: "h" | "p" | "li";
  text: string;
  size: number;
  bold: boolean;
  x0: number;
  page: number;
}

export function pdfRawBlocks(file: string): { pages: number; body_size: number; blocks: PdfRawBlock[] } {
  return runPy("blocks", file);
}

/** Plain text per page, with bare page numbers at the top/bottom of each page removed. */
export function pdfText(file: string): string[] {
  return runPy<{ pages: string[] }>("text", file).pages.map((p) => {
    const lines = p.split("\n");
    while (lines.length && /^\s*(page\s*)?\d{1,3}(\s*of\s*\d{1,3})?\s*$/i.test(lines[0])) lines.shift();
    while (lines.length && /^\s*((page\s*)?\d{1,3}(\s*of\s*\d{1,3})?)?\s*$/i.test(lines[lines.length - 1])) lines.pop();
    return lines.join("\n");
  });
}

export interface PhonicsPage {
  page: number;
  text: string;
  images: number;
  words: Array<{ word: string; size: number; alien: boolean; y0: number; x0: number }>;
}
export function pdfPhonicsPages(file: string): PhonicsPage[] {
  return runPy<{ pages: PhonicsPage[] }>("phonics", file).pages;
}

/**
 * PDF raw blocks -> the same Block model as HTML: heading levels ranked by font size (larger = higher),
 * bold body-size headings come last; bullets nested by x indentation.
 */
export function pdfToBlocks(file: string, opts: { keepTitle?: boolean } = {}): Block[] {
  const raw = pdfRawBlocks(file).blocks;
  // Cover title: headings before the first body text whose font size never recurs later.
  const firstBody = raw.findIndex((b) => b.type !== "h");
  const laterSizes = new Set(raw.slice(Math.max(firstBody, 0)).filter((b) => b.type === "h").map((b) => b.size));
  const blocks = opts.keepTitle || firstBody < 0 ? raw : raw.filter((b, i) => !(i < firstBody && b.type === "h" && !laterSizes.has(b.size)));
  const hSizes = [...new Set(blocks.filter((b) => b.type === "h").map((b) => b.size))].sort((a, b) => b - a);
  const levelOf = (b: PdfRawBlock) => {
    const i = hSizes.indexOf(b.size);
    return 2 + (i < 0 ? hSizes.length : i);
  };
  const liX = [...new Set(blocks.filter((b) => b.type === "li").map((b) => Math.round(b.x0 / 6)))].sort((a, b) => a - b);
  const out: Block[] = [];
  const stack: Array<{ depth: number; block: Extract<Block, { kind: "li" }> }> = [];
  for (const b of blocks) {
    if (b.type === "li") {
      const depth = liX.indexOf(Math.round(b.x0 / 6));
      while (stack.length && stack[stack.length - 1].depth >= depth) stack.pop();
      const block: Extract<Block, { kind: "li" }> = { kind: "li", text: cleanText(b.text), children: [] };
      if (stack.length) stack[stack.length - 1].block.children.push(block);
      else out.push(block);
      stack.push({ depth, block });
      continue;
    }
    stack.length = 0;
    if (b.type === "h") out.push({ kind: "h", level: levelOf(b), text: cleanText(b.text) });
    else out.push({ kind: "p", text: cleanText(b.text) });
  }
  return out;
}

export { sha256 };
