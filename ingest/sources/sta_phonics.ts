/**
 * Source: Year 1 phonics screening check materials (STA, gov.uk, OGL v3.0), 2012 onwards.
 * There was no check in 2020; an autumn 2021 check was taken by year 2 pupils; June checks from 2022.
 *
 * Discovery: publications titled "Phonics screening check: <year> materials" (or similar, matched on
 * "phonics" + a year) linked from the phonics collection or the past test materials collection, plus
 * any page titled "... threshold ..." for the threshold mark. Attachments are classified by title:
 * pupils' materials, practice sheet, scoring guidance / answer sheet (administration guidance is used
 * only for general rules).
 *
 * Words (phonics_words): 40 per year, section 1/2, position 1..40, kind 'official'; practice sheet
 * words kind 'official_practice'. Pseudo-word flags come from the official markers:
 *   1. the scoring guidance / answer sheet listing entries or groups as pseudo-words (unambiguous ->
 *      review_status 'auto_ok' when the word also agrees with the pupils' materials when present),
 *   2. the alien image printed beside pseudo-words in the pupils' materials (review_status 'needs_review'),
 *   3. otherwise unknown: is_pseudo 0, 'needs_review', logged as pseudo_flag_unknown.
 * Rules (assessment_rules, assessment 'phonics_check'): threshold_<year> parsed from gov.uk HTML pages
 * (verified), and general rules words_per_check / sections / pseudo_word_alien / year2_recheck /
 * pseudo_words_per_check parsed from page or PDF text (ids phonics_check:<rule_key>, the same ids the
 * unverified seed uses, so verified values replace it).
 */
import type { DataStore, Row } from "../../src/lib/db/store";
import { IngestContext } from "../core/context";
import type { GovukAttachment, GovukLink } from "../core/govuk";
import { SOURCES } from "./registry";
import {
  type Fetcher,
  type GovukIngestOptions,
  absAttachments,
  collectionDocs,
  defaultFetcher,
  ensurePath,
  failRun,
  handleBlocked,
  htmlToLinesText,
  isPdf,
  pdfPhonicsPages,
  pdfText,
  tryContent,
  type PhonicsPage,
} from "./govuk_common";

const SRC = SOURCES.find((s) => s.id === "sta_phonics")!;
export const PHONICS_COLLECTIONS = [
  "/government/collections/phonics",
  "/government/collections/phonics-screening-check-materials",
  "/government/collections/national-curriculum-assessments-past-test-materials",
];
export const FIRST_YEAR = 2012;
export const NO_CHECK_YEARS = [2020];

export function expectedYears(now = new Date()): number[] {
  const out: number[] = [];
  // the June check's materials are published after the check, so the current year counts from July
  const last = now.getUTCMonth() >= 6 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
  for (let y = FIRST_YEAR; y <= last; y++) if (!NO_CHECK_YEARS.includes(y)) out.push(y);
  return out;
}

export function yearOfTitle(title: string): number | null {
  const m = title.match(/\b(20[12]\d)\b/);
  return m ? Number(m[1]) : null;
}

export type AttachmentKind = "pupils" | "practice" | "scoring" | "administration" | "other";
export function classifyAttachment(title: string): AttachmentKind {
  if (/practice/i.test(title)) return "practice";
  if (/scoring|answer sheet|marking|answers/i.test(title)) return "scoring";
  if (/administration|headteacher|guidance/i.test(title)) return "administration";
  if (/braille|modified|large print|enlarged|copyright|audio|video|welsh/i.test(title)) return "other";
  if (/pupils?['’]?s?\b|materials|check words|words/i.test(title)) return "pupils";
  return "other";
}

// ---------------------------------------------------------------- word extraction

export interface ExtractedWord {
  section: number | null;
  position: number | null;
  word: string;
  pseudo: boolean | null;
  /** true when the pseudo flag came from an explicit marker in this document */
  explicit: boolean;
}

const WORD = /^[a-z]{2,12}$/;

/** Scoring guidance / answer sheet text -> words with explicit pseudo flags. */
export function wordsFromScoringText(text: string): ExtractedWord[] {
  const lines = text.split(/\r?\n/).map((l) => l.replace(/\s+/g, " ").trim()).filter(Boolean);
  const out: ExtractedWord[] = [];
  let section: number | null = null;
  let group: boolean | null = null;
  let practice = false;
  let pendingPos: number | null = null;
  const flagOf = (s: string): boolean | null =>
    /pseudo|alien|non-?words?|nonsense/i.test(s) ? true : /\breal\b/i.test(s) ? false : null;
  for (const line of lines) {
    const sec = line.match(/^section\s*(1|2|one|two)\b(.*)$/i);
    if (sec) {
      section = /1|one/i.test(sec[1]) ? 1 : 2;
      practice = false;
      group = flagOf(sec[2]);
      pendingPos = null;
      continue;
    }
    if (/^practice\b/i.test(line)) {
      practice = true;
      continue;
    }
    if (practice) continue;
    if (line.length < 60 && /^(the )?(pseudo-?words?|real words?|non-?words?)\b/i.test(line)) {
      group = flagOf(line);
      continue;
    }
    const m = line.match(/^(\d{1,2})[.)]?\s+([a-z]{2,12})\b\s*(.*)$/);
    if (m && section) {
      const f = flagOf(m[3]);
      out.push({ section, position: Number(m[1]), word: m[2], pseudo: f ?? group, explicit: f !== null || group !== null });
      pendingPos = null;
      continue;
    }
    if (section && /^\d{1,2}$/.test(line)) {
      pendingPos = Number(line);
      continue;
    }
    if (section && WORD.test(line)) {
      out.push({ section, position: pendingPos, word: line, pseudo: group, explicit: group !== null });
      pendingPos = null;
      continue;
    }
    // a flag cell on its own line after the word (table layout)
    const last = out[out.length - 1];
    if (section && last && line.length < 30) {
      const f = flagOf(line);
      if (f !== null) {
        last.pseudo = f;
        last.explicit = true;
      }
    }
  }
  return out;
}

/** Pupils' materials / practice sheet pages -> words in order, alien flag from the image beside the word. */
export function wordsFromPupilPages(pages: PhonicsPage[]): ExtractedWord[] {
  const out: ExtractedWord[] = [];
  let section: number | null = null;
  for (const p of pages) {
    const sm = p.text.match(/section\s*(1|2|one|two)\b/i);
    if (sm) section = /1|one/i.test(sm[1]) ? 1 : 2;
    if (/practice/i.test(p.text) && !sm) continue;
    const words = p.words.filter((w) => w.word === w.word.toLowerCase() && WORD.test(w.word));
    const pageAlien = p.images > 0 && words.length > 0 && !words.some((w) => w.alien);
    for (const w of words) out.push({ section, position: null, word: w.word, pseudo: w.alien || pageAlien, explicit: false });
  }
  return out;
}

export interface MergedWord {
  section: number;
  position: number;
  word: string;
  is_pseudo: 0 | 1;
  review_status: "auto_ok" | "needs_review";
  note: string | null;
}

/** Combine scoring-guidance words (preferred) with pupils'-materials words. */
export function mergeWordLists(scoring: ExtractedWord[], pupils: ExtractedWord[]): { words: MergedWord[]; issues: string[] } {
  const issues: string[] = [];
  const order = (ws: ExtractedWord[]) => {
    const numbered = ws.every((w) => w.position !== null);
    const sorted = numbered ? [...ws].sort((a, b) => a.position! - b.position!) : ws;
    return sorted;
  };
  const s = order(scoring);
  const p = pupils;
  const base = s.length === 40 ? s : p.length === 40 ? p : s.length >= p.length ? s : p;
  const fromScoring = base === s && s.length > 0;
  if (base.length !== 40) issues.push(`expected 40 words, found ${base.length} (scoring ${s.length}, pupils ${p.length})`);
  const words: MergedWord[] = base.map((w, i) => {
    const other = fromScoring ? (p.length === base.length ? p[i] : undefined) : s.length === base.length ? s[i] : undefined;
    const notes: string[] = [];
    let ok = fromScoring && w.explicit && w.pseudo !== null && base.length === 40;
    if (other && other.word !== w.word) {
      notes.push(`word differs between documents: "${w.word}" vs "${other.word}"`);
      ok = false;
    }
    let pseudo = w.pseudo;
    if (!fromScoring && other?.explicit && other.pseudo !== null) pseudo = other.pseudo;
    if (other && other.pseudo !== null && pseudo !== null && other.pseudo !== pseudo) {
      notes.push(`pseudo flag differs (scoring guidance vs alien image)`);
      ok = false;
    }
    if (pseudo === null) notes.push("pseudo flag unknown");
    else if (!fromScoring && !(other?.explicit)) notes.push("pseudo flag from alien image in pupils' materials");
    const position = w.position ?? i + 1;
    return {
      section: w.section ?? (position <= 20 ? 1 : 2),
      position,
      word: w.word,
      is_pseudo: pseudo ? 1 : 0,
      review_status: ok ? "auto_ok" : "needs_review",
      note: notes.join("; ") || null,
    };
  });
  for (const w of words) if (w.note) issues.push(`#${w.position} ${w.word}: ${w.note}`);
  return { words, issues };
}

// ---------------------------------------------------------------- rules

export interface ParsedRule {
  rule_key: string;
  value: string;
  description: string;
}

/** Threshold marks stated in a page's text. `pageYear` applies to sentences that name no year. */
export function parseThresholds(text: string, pageYear: number | null, opts: { tables?: boolean } = {}): Map<number, number> {
  const out = new Map<number, number>();
  const sentences = text.split(/(?<=[.!?])\s+|\n+/);
  for (const s of sentences) {
    const row = opts.tables ? s.match(/^\D*?\b(20[12]\d)\b[^|]*\|\s*(\d{1,2})\s*(?:$|\||out of|marks?)/i) : null; // table row "2019 | 32"
    if (row && Number(row[2]) <= 40) {
      out.set(Number(row[1]), Number(row[2]));
      continue;
    }
    if (!/threshold/i.test(s)) continue;
    const mark = s.match(/threshold(?: mark)?[^.]*?\b(?:is|was|will be|of|=|:)\s*(\d{1,2})\b(?!\s*(?:june|july|%))/i) ?? s.match(/\b(\d{1,2}) (?:out of 40|marks?)\b/i);
    if (!mark || Number(mark[1]) > 40 || Number(mark[1]) < 1) continue;
    const years = [...s.matchAll(/\b(20[12]\d)\b/g)].map((m) => Number(m[1]));
    const ys = years.length ? years : pageYear ? [pageYear] : [];
    for (const y of ys) out.set(y, Number(mark[1]));
  }
  return out;
}

/** General check rules from page / PDF text. */
export function parseGeneralRules(text: string): ParsedRule[] {
  const t = text.replace(/\s+/g, " ");
  const sentences = t.split(/(?<=[.!?])\s+/);
  const out: ParsedRule[] = [];
  const find = (re: RegExp) => sentences.find((s) => re.test(s));
  let s = find(/\b(40|forty) words\b/i);
  if (s) out.push({ rule_key: "words_per_check", value: "40", description: s.trim() });
  s = find(/\b(two|2) sections\b/i);
  if (s) out.push({ rule_key: "sections", value: "2", description: s.trim() });
  s = find(/\b(20|twenty) pseudo-?words\b/i);
  if (s) out.push({ rule_key: "pseudo_words_per_check", value: "20", description: s.trim() });
  s = find(/(pseudo-?words?|non-?words?)[^.]*\baliens?\b|\baliens?\b[^.]*(pseudo-?words?|non-?words?)/i);
  if (s) out.push({ rule_key: "pseudo_word_alien", value: "true", description: s.trim() });
  s = sentences.find((x) => /\byear 2\b/i.test(x) && /(did not|didn['’]t|not)\s+(meet|reach|achieve)|\bagain\b|re-?check|re-?take|retake/i.test(x) && /check/i.test(x));
  if (s) out.push({ rule_key: "year2_recheck", value: "true", description: s.trim() });
  return out;
}

// ---------------------------------------------------------------- ingest

interface YearDocs {
  year: number;
  autumn: boolean;
  link: GovukLink;
}

export async function ingestStaPhonics(store: DataStore, opts: GovukIngestOptions & { now?: Date } = {}) {
  const ctx = new IngestContext(store, SRC.id, SRC.licence_id, SRC.attribution_text);
  await ctx.start();
  const fetcher: Fetcher = opts.fetcher ?? defaultFetcher(ctx);
  const force = opts.force || !!process.env.EDU_FORCE;
  let partial = false;
  const ruleHits = new Map<string, Row>();
  const addRules = (rules: ParsedRule[], url: string, checksum: string | null) => {
    for (const r of rules)
      if (!ruleHits.has(r.rule_key))
        ruleHits.set(r.rule_key, {
          id: `phonics_check:${r.rule_key}`,
          assessment: "phonics_check",
          rule_key: r.rule_key,
          value: r.value,
          description: r.description.slice(0, 500),
          verification_status: "verified",
          ...ctx.prov(url, checksum),
        });
  };
  try {
    // ---- discovery
    const links = new Map<string, GovukLink>();
    let anyCollection = false;
    for (const cp of PHONICS_COLLECTIONS) {
      const c = await tryContent(ctx, fetcher, cp);
      if (!c) continue;
      anyCollection = true;
      for (const d of collectionDocs(c.content)) if (/phonics/i.test(d.title)) links.set(d.base_path, d);
      if (c.content.details.body) addRules(parseGeneralRules(htmlToLinesText(c.content.details.body)), c.url, c.checksum);
    }
    if (!anyCollection) partial = true;
    const byYear = new Map<number, YearDocs>();
    const thresholdPages: GovukLink[] = [];
    for (const l of links.values()) {
      if (/threshold/i.test(l.title)) {
        thresholdPages.push(l);
        continue;
      }
      if (!/screening check|phonics check/i.test(l.title) || !/materials|check:? 20|20\d\d.*check/i.test(l.title)) continue;
      const y = yearOfTitle(l.title);
      if (!y || NO_CHECK_YEARS.includes(y)) continue;
      const prev = byYear.get(y);
      // prefer the main materials publication over e.g. "modified materials"
      if (!prev || (/modified|braille|welsh/i.test(prev.link.title) && !/modified|braille|welsh/i.test(l.title)))
        byYear.set(y, { year: y, autumn: /autumn/i.test(l.title), link: l });
    }

    // ---- thresholds (always re-read: cheap and authoritative)
    const thresholds = new Map<number, { mark: number; url: string; checksum: string }>();
    const collectThresholds = (text: string, pageYear: number | null, url: string, checksum: string, tables = false) => {
      for (const [y, m] of parseThresholds(text, pageYear, { tables })) if (!thresholds.has(y)) thresholds.set(y, { mark: m, url, checksum });
    };
    for (const tp of thresholdPages) {
      const c = await tryContent(ctx, fetcher, tp.base_path);
      if (!c) continue;
      const text = htmlToLinesText(c.content.details.body ?? "") + "\n" + (c.content.description ?? "");
      collectThresholds(text, yearOfTitle(c.content.title ?? tp.title), c.url, c.checksum, true);
      addRules(parseGeneralRules(text), c.url, c.checksum);
    }

    // ---- per-year materials
    for (const y of expectedYears(opts.now)) {
      const yd = byYear.get(y);
      if (!yd) {
        await ctx.log("warn", "year_missing", `No phonics screening check materials found for ${y}`);
        partial = true;
        continue;
      }
      const pub = await tryContent(ctx, fetcher, yd.link.base_path);
      if (!pub) {
        partial = true;
        continue;
      }
      const pageText = htmlToLinesText(pub.content.details.body ?? "") + "\n" + (pub.content.description ?? "");
      collectThresholds(pageText, y, pub.url, pub.checksum);
      addRules(parseGeneralRules(pageText), pub.url, pub.checksum);
      const key = `year:${y}`;
      if (ctx.isDone(key) && !force) continue;
      const atts = absAttachments(pub.content).filter(isPdf);
      const pick = (k: AttachmentKind) => atts.filter((a) => classifyAttachment(a.title) === k);
      const load = async (a: GovukAttachment) => {
        try {
          const f = await fetcher(a.url);
          return { path: ensurePath(f, a.url), checksum: f.checksum, url: a.url };
        } catch (e) {
          if ((e as Error).name === "BlockedHostError") throw e;
          await ctx.log("warn", "fetch_failed", `Could not fetch ${a.url}: ${(e as Error).message}`);
          return null;
        }
      };
      let scoring: ExtractedWord[] = [];
      let scoringSrc: { url: string; checksum: string } | null = null;
      for (const a of pick("scoring")) {
        const f = await load(a);
        if (!f) continue;
        const text = pdfText(f.path).join("\n");
        addRules(parseGeneralRules(text), f.url, f.checksum);
        const ws = wordsFromScoringText(text);
        if (ws.length > scoring.length) {
          scoring = ws;
          scoringSrc = f;
        }
        if (scoring.length === 40 && scoring.every((w) => w.explicit)) break;
      }
      let pupils: ExtractedWord[] = [];
      let pupilsSrc: { url: string; checksum: string } | null = null;
      for (const a of pick("pupils")) {
        const f = await load(a);
        if (!f) continue;
        const ws = wordsFromPupilPages(pdfPhonicsPages(f.path));
        if (ws.length > pupils.length) {
          pupils = ws;
          pupilsSrc = f;
        }
      }
      for (const a of pick("administration").slice(0, 1)) {
        const f = await load(a);
        if (f) addRules(parseGeneralRules(pdfText(f.path).join("\n")), f.url, f.checksum);
      }
      const merged = mergeWordLists(scoring, pupils);
      const src = scoring.length && merged.words.length === scoring.length ? scoringSrc : pupilsSrc ?? scoringSrc;
      const rows: Row[] = merged.words.map((w) => ({
        id: `phonics:${y}:official:${w.position}`,
        check_year: y,
        set_name: `${y} check`,
        section: w.section,
        position: w.position,
        word: w.word,
        is_pseudo: w.is_pseudo,
        gpc_focus: null,
        kind: "official",
        review_status: w.review_status,
        ...ctx.prov(src?.url ?? pub.url, src?.checksum ?? pub.checksum),
      }));
      if (merged.issues.length)
        await ctx.log("warn", "extraction_review", `${y}: ${merged.issues.length} word issue(s) need review`, { year: y, issues: merged.issues.slice(0, 50) });
      if (yd.autumn) await ctx.log("info", "autumn_check", `${y} materials are the autumn ${y} check`, { title: yd.link.title });

      // practice sheet
      const practice: Row[] = [];
      for (const a of pick("practice").slice(0, 1)) {
        const f = await load(a);
        if (!f) continue;
        const ws = wordsFromPupilPages(pdfPhonicsPages(f.path).map((p) => ({ ...p, text: p.text.replace(/practice/gi, "") })));
        ws.forEach((w, i) =>
          practice.push({
            id: `phonics:${y}:practice:${i + 1}`,
            check_year: y,
            set_name: `${y} practice sheet`,
            section: w.section ?? 1,
            position: i + 1,
            word: w.word,
            is_pseudo: w.pseudo ? 1 : 0,
            gpc_focus: null,
            kind: "official_practice",
            review_status: "needs_review",
            ...ctx.prov(f.url, f.checksum),
          }),
        );
      }
      if (!rows.length) {
        await ctx.log("warn", "no_words", `No words extracted for ${y}`, { attachments: atts.map((a) => a.title) });
        partial = true;
        continue;
      }
      await store.transaction(async () => {
        await store.delete("phonics_words", { source_id: SRC.id, check_year: y });
        await store.upsert("phonics_words", [...rows, ...practice], ["id"]);
      });
      ctx.bump("phonics_words", rows.length);
      ctx.bump("phonics_practice_words", practice.length);
      await ctx.markDone(key, (src?.checksum ?? pub.checksum).slice(0, 16));
    }

    // ---- rules
    const ruleRows: Row[] = [...ruleHits.values()];
    for (const [y, t] of thresholds) {
      ruleRows.push({
        id: `phonics_check:threshold_${y}`,
        assessment: "phonics_check",
        rule_key: `threshold_${y}`,
        value: String(t.mark),
        description: `Threshold mark for the ${y} phonics screening check (out of 40), as published on gov.uk.`,
        verification_status: "verified",
        ...ctx.prov(t.url, t.checksum),
      });
    }
    for (const y of expectedYears(opts.now)) if (!thresholds.has(y)) await ctx.log("warn", "threshold_not_found", `No threshold mark found on gov.uk for ${y}`);
    if (ruleRows.length) await store.upsert("assessment_rules", ruleRows, ["id"]);
    ctx.bump("assessment_rules", ruleRows.length);
    await ctx.finish(partial ? "partial" : "ok");
    return ctx.getStats();
  } catch (e) {
    if (await handleBlocked(ctx, e)) return ctx.getStats();
    await failRun(ctx, e);
    throw e;
  }
}
