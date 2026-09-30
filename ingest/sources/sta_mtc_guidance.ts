/**
 * Source: Multiplication tables check (MTC) assessment framework and administration guidance
 * (STA, gov.uk, OGL v3.0). Collection: /government/collections/multiplication-tables-check.
 *
 * The rules are extracted from the documents' text (PDF attachments and/or HTML attachments) and
 * written to assessment_rules (assessment 'mtc', verification_status 'verified', source_url = the
 * document the value came from). Rule keys match MtcRules in src/lib/mtc.ts and the unverified seed
 * rows (id 'mtc:<rule_key>', JSON-encoded values) so verified values overwrite the seed; an existing
 * row whose key only differs in case/underscores (question_count vs questionCount) is reused.
 * A parsed value that differs from the stored one is logged as warn 'value_differs' with both values.
 * Rules not found in any document are left untouched (and logged).
 */
import type { DataStore, Row } from "../../src/lib/db/store";
import { IngestContext } from "../core/context";
import type { GovukLink } from "../core/govuk";
import { SOURCES } from "./registry";
import {
  type Fetcher,
  type GovukIngestOptions,
  absAttachments,
  basePathOf,
  collectionDocs,
  defaultFetcher,
  ensurePath,
  failRun,
  handleBlocked,
  htmlToLinesText,
  isHtmlAttachment,
  isPdf,
  pdfText,
  tryContent,
} from "./govuk_common";

const SRC = SOURCES.find((s) => s.id === "sta_mtc")!;
export const MTC_COLLECTION = "/government/collections/multiplication-tables-check";
export const MTC_FALLBACKS = [
  "/government/publications/multiplication-tables-check-assessment-framework",
  "/government/publications/multiplication-tables-check-administration-guidance",
];

const WORDS: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fifteen: 15, twenty: 20, "twenty-five": 25, "twenty five": 25, thirty: 30,
};
const NUM = "(\\d{1,2}|zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fifteen|twenty[- ]five|twenty|thirty)";
const num = (s: string) => (/^\d+$/.test(s) ? Number(s) : WORDS[s.toLowerCase()] ?? NaN);

export interface MtcRuleHit {
  key: string;
  value: number | boolean | number[] | string;
  evidence: string;
}

const listNums = (s: string) => [...s.matchAll(/\d{1,2}/g)].map((m) => Number(m[0]));

/** Extract MTC rules from document text. First match per key wins. */
export function parseMtcRules(text: string): MtcRuleHit[] {
  const t = text
    .replace(/\s+/g, " ")
    .replace(/(\d)\s*[x×]\s*(\d)/g, "$1 × $2")
    .replace(/[‐‑–]/g, "-");
  const sentences = t.split(/(?<=[.!?;])\s+|\s+•\s+/).map((s) => s.trim()).filter(Boolean);
  const hits = new Map<string, MtcRuleHit>();
  const set = (key: string, value: MtcRuleHit["value"], evidence: string) => {
    if (!hits.has(key)) hits.set(key, { key, value, evidence: evidence.slice(0, 400) });
  };
  const re = (src: string) => new RegExp(src, "i");
  for (const s of sentences) {
    let m: RegExpMatchArray | null;
    if ((m = s.match(re(`\\b${NUM}\\s+(?:scored\\s+)?questions\\b`))) && /check|pupils|consist|contain|answer/i.test(s) && !/practice/i.test(s.slice(Math.max(0, (m.index ?? 0) - 12), (m.index ?? 0) + m[0].length)))
      set("questionCount", num(m[1]), s);
    if ((m = s.match(re(`\\b${NUM}\\s+seconds?\\s+(?:to\\s+(?:answer|respond|type)|per question|for each question|for every question|in which to answer)`)) ?? s.match(re(`time limit of\\s+${NUM}\\s+seconds`))))
      set("secondsPerQuestion", num(m[1]), s);
    if ((m = s.match(re(`\\b${NUM}[- ]seconds?\\s+(?:pause|gap|delay|rest)`)) ?? s.match(re(`(?:pause|gap|delay)\\s+of\\s+${NUM}\\s+seconds`)) ?? s.match(re(`\\b${NUM}\\s+seconds?\\s+between\\s+(?:each\\s+)?questions`))))
      set("pauseSeconds", num(m[1]), s);
    if ((m = s.match(re(`\\b${NUM}\\s+practice questions`))))
      set("practiceCount", num(m[1]), s);
    if ((m = s.match(re(`\\b${NUM}\\s+to\\s+${NUM}\\s+(?:multiplication|times)\\s+tables`)) ?? s.match(re(`(?:multiplication|times)\\s+tables\\s+(?:from\\s+)?${NUM}\\s+to\\s+${NUM}`)))) {
      set("minTable", num(m[1]), s);
      set("maxTable", num(m[2]), s);
    }
    if ((m = s.match(/up to (\d{1,2}) × (\d{1,2})/i))) set("maxFactor", Math.max(Number(m[1]), Number(m[2])), s);
    if (/weight|emphasis|more likely|more frequently|greater (?:number|proportion)|more often|focus/i.test(s) && (m = s.match(/((?:\d{1,2},\s*)+\d{1,2},?\s+and\s+\d{1,2})\b/))) {
      set("emphasisTables", listNums(m[1]), s);
      const q = s.match(re(`(?:at least|minimum of|a minimum of)\\s+${NUM}\\b`));
      if (q) set("minEmphasisQuestions", num(q[1]), s);
    }
    if (/commutative|reverse|inverse|turnaround|(\d+ × \d+) and (\d+ × \d+)/i.test(s) && /question|fact|check|appear/i.test(s)) {
      if (/\b(not|no|never|only one|won['’]t|cannot)\b/i.test(s)) set("allowCommutativePairs", false, s);
      else if (/\b(may|can|could|might)\b/i.test(s)) set("allowCommutativePairs", true, s);
    }
    if (/\b(not|excluded|won['’]t|will not|no)\b/i.test(s) && (m = s.match(/\b(?:the\s+)?(0|1|zero|one)\s*(?:×\s*)?(?:multiplication\s+|times\s+)?tables?\b/i))) {
      const ex = new Set<number>();
      for (const mm of s.matchAll(/\b(0|1|zero|one)\s*(?:×\s*)?(?:multiplication\s+|times\s+)?tables?\b|\b(0|1|zero|one)\s+and\s+(0|1|zero|one)\s+(?:multiplication\s+|times\s+)?tables\b/gi))
        [mm[1], mm[2], mm[3]].filter(Boolean).forEach((x) => ex.add(num(x)));
      set("excludedTables", [...ex].sort((a, b) => a - b), s);
    }
    if (/\byear 4\b/i.test(s) && /pupils|check|statutory/i.test(s)) set("yearGroup", "y4", s);
    if ((m = s.match(/\b(one|1) mark (?:for|per) (?:each )?(?:correct )?(?:question|answer)|each (?:question|correct answer) (?:is worth|scores?|receives|is awarded) (one|1) mark/i)))
      set("marksPerQuestion", 1, s);
  }
  return [...hits.values()].filter((h) => !(typeof h.value === "number" && Number.isNaN(h.value)));
}

const normKey = (k: string) => k.toLowerCase().replace(/[^a-z0-9]/g, "");
const canon = (v: unknown) => JSON.stringify(v);

export async function ingestStaMtcGuidance(store: DataStore, opts: GovukIngestOptions = {}) {
  const ctx = new IngestContext(store, SRC.id, SRC.licence_id, SRC.attribution_text);
  await ctx.start();
  const fetcher: Fetcher = opts.fetcher ?? defaultFetcher(ctx);
  try {
    const coll = await tryContent(ctx, fetcher, MTC_COLLECTION);
    const docs = coll ? collectionDocs(coll.content) : [];
    const newest = (re: RegExp): GovukLink | undefined =>
      docs
        .filter((d) => re.test(d.title))
        .sort((a, b) => (yearIn(b.title) - yearIn(a.title)) || String(b.public_updated_at ?? "").localeCompare(String(a.public_updated_at ?? "")))[0];
    const targets = [newest(/assessment framework/i)?.base_path ?? MTC_FALLBACKS[0], newest(/administration guidance/i)?.base_path ?? MTC_FALLBACKS[1]];

    // text of each document, in priority order: framework first, then guidance
    const texts: Array<{ text: string; url: string; checksum: string; title: string }> = [];
    for (const p of targets) {
      const pub = await tryContent(ctx, fetcher, p);
      if (!pub) continue;
      if (pub.content.details.body) texts.push({ text: htmlToLinesText(pub.content.details.body), url: pub.url, checksum: pub.checksum, title: pub.content.title });
      for (const a of absAttachments(pub.content)) {
        if (/welsh|cymraeg|easy read|braille|large print/i.test(a.title)) continue;
        if (isPdf(a)) {
          try {
            const f = await fetcher(a.url);
            texts.push({ text: pdfText(ensurePath(f, a.url)).join("\n"), url: a.url, checksum: f.checksum, title: a.title });
          } catch (e) {
            if ((e as Error).name === "BlockedHostError") throw e;
            await ctx.log("warn", "fetch_failed", `Could not fetch ${a.url}: ${(e as Error).message}`);
          }
        } else if (isHtmlAttachment(a)) {
          const h = await tryContent(ctx, fetcher, basePathOf(a.url));
          if (h?.content.details.body) texts.push({ text: htmlToLinesText(h.content.details.body), url: h.url, checksum: h.checksum, title: a.title });
        }
      }
    }
    if (!texts.length) {
      await ctx.log("warn", "no_documents", "No MTC framework or guidance text could be loaded");
      await ctx.finish("partial");
      return ctx.getStats();
    }

    const chosen = new Map<string, MtcRuleHit & { url: string; checksum: string; title: string }>();
    for (const doc of texts) {
      for (const h of parseMtcRules(doc.text)) {
        const prev = chosen.get(h.key);
        if (!prev) chosen.set(h.key, { ...h, url: doc.url, checksum: doc.checksum, title: doc.title });
        else if (canon(prev.value) !== canon(h.value))
          await ctx.log("warn", "source_disagreement", `${h.key}: "${prev.title}" says ${canon(prev.value)}, "${doc.title}" says ${canon(h.value)}`, {
            key: h.key, kept: prev.value, other: h.value, keptUrl: prev.url, otherUrl: doc.url,
          });
      }
    }
    // consistency: excluded tables vs table range
    const minT = chosen.get("minTable")?.value;
    const ex = chosen.get("excludedTables")?.value as number[] | undefined;
    if (typeof minT === "number" && ex?.some((x) => x >= minT))
      await ctx.log("warn", "rule_inconsistent", `excludedTables ${canon(ex)} overlaps minTable ${minT}`);

    const existing = await store.select<{ id: string; rule_key: string; value: string; verification_status: string }>("assessment_rules", { where: { assessment: "mtc" } });
    const byNorm = new Map(existing.map((r) => [normKey(r.rule_key), r]));
    const rows: Row[] = [];
    for (const h of chosen.values()) {
      const ex0 = byNorm.get(normKey(h.key));
      const value = canon(h.value);
      if (ex0 && canon(safeParse(ex0.value)) !== value)
        await ctx.log("warn", "value_differs", `mtc ${h.key}: stored ${ex0.value} (${ex0.verification_status}), gov.uk says ${value}`, {
          key: h.key, stored: ex0.value, parsed: value, source_url: h.url,
        });
      rows.push({
        id: ex0?.id ?? `mtc:${h.key}`,
        assessment: "mtc",
        rule_key: ex0?.rule_key ?? h.key,
        value,
        description: `${h.evidence} [${h.title}]`.slice(0, 600),
        verification_status: "verified",
        ...ctx.prov(h.url, h.checksum),
      });
    }
    if (rows.length) await store.upsert("assessment_rules", rows, ["id"]);
    ctx.bump("assessment_rules", rows.length);
    const expected = ["questionCount", "secondsPerQuestion", "pauseSeconds", "practiceCount", "minTable", "maxTable", "emphasisTables", "allowCommutativePairs"];
    const missing = expected.filter((k) => !chosen.has(k));
    if (missing.length) await ctx.log("warn", "rules_not_found", `Not stated in the documents read: ${missing.join(", ")}`, { missing });
    await ctx.finish(missing.length ? "partial" : "ok");
    return ctx.getStats();
  } catch (e) {
    if (await handleBlocked(ctx, e)) return ctx.getStats();
    await failRun(ctx, e);
    throw e;
  }
}

function yearIn(s: string) {
  const m = s.match(/\b(20\d\d)\b/);
  return m ? Number(m[1]) : 0;
}
function safeParse(v: string): unknown {
  try {
    return JSON.parse(v);
  } catch {
    return v;
  }
}
