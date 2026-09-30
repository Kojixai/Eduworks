/**
 * Original and derived practice content that needs no network:
 *  - MTC rules (unverified defaults until the STA guidance is harvested)
 *  - phonics check threshold (unverified default) and original practice word sets
 *  - keyword questions (mcq + matching) derived from Oak lesson keywords (OGL, adapted)
 *  - original arithmetic practice papers (KS1, KS2) with computed answers
 */
import type { DataStore, Row } from "../../src/lib/db/store";
import { IngestContext, chunk, sha256 } from "../core/context";
import { MTC_DEFAULT_RULES, MTC_RULE_DOCS, mulberry32 } from "../../src/lib/mtc";
import { ORIGINAL_PRACTICE_SETS, PHONICS_DEFAULT_THRESHOLD, layoutSet } from "../../src/lib/phonics";
import { acceptedAnswers, generateArithmeticPaper, SKILL_STATEMENT_HINTS } from "../../src/lib/arith/generate";
import { SOURCES, subjectName } from "./registry";

const SRC = SOURCES.find((s) => s.id === "eduworks_original")!;
const MTC_SRC = "https://www.gov.uk/government/collections/multiplication-tables-check";
const PHONICS_SRC = "https://www.gov.uk/government/collections/phonics";

export async function ingestOriginalContent(store: DataStore) {
  const ctx = new IngestContext(store, SRC.id, SRC.licence_id, SRC.attribution_text);
  await ctx.start();
  if (!ctx.getCheckpoint("retrieved_at")) await ctx.touchRetrieved();
  try {
    // Clean previous output of this step (it is fully deterministic, so a rebuild is safe).
    const oldQ = await store.select<{ id: string }>("questions", { where: { source_id: SRC.id }, columns: ["id"] });
    for (const part of chunk(oldQ.map((q) => q.id), 5000)) {
      for (const t of ["question_options", "accepted_answers", "mark_scheme_entries", "question_statement_links", "question_tags"])
        await store.delete(t, { question_id: part });
    }
    await store.delete("questions", { source_id: SRC.id });
    await store.delete("papers", { source_id: SRC.id });
    await store.delete("phonics_words", { source_id: SRC.id });

    await seedRules(store, ctx);
    await seedPhonics(store, ctx);
    await derivedKeywordQuestions(store, ctx);
    await arithmeticPapers(store, ctx);
    await ctx.finish("ok");
    return ctx.getStats();
  } catch (e) {
    await ctx.log("error", "exception", String((e as Error).stack ?? e));
    await ctx.finish("failed", String(e));
    throw e;
  }
}

async function seedRules(store: DataStore, ctx: IngestContext) {
  const rows: Row[] = [];
  for (const doc of MTC_RULE_DOCS) {
    const id = `mtc:${doc.key}`;
    const existing = await store.first<{ verification_status: string }>("assessment_rules", { where: { id } });
    if (existing?.verification_status === "verified") continue; // never overwrite a harvested value
    rows.push({
      id,
      assessment: "mtc",
      rule_key: doc.key,
      value: JSON.stringify(MTC_DEFAULT_RULES[doc.key]),
      description: doc.description,
      verification_status: "unverified",
      ...ctx.prov(MTC_SRC, null, false, "Rule summarised from STA multiplication tables check guidance; to be verified against the published PDF."),
      licence_id: "OGL-3.0",
    });
  }
  const phon = await store.first<{ verification_status: string }>("assessment_rules", { where: { id: "phonics_check:threshold_default" } });
  if (phon?.verification_status !== "verified")
    rows.push({
      id: "phonics_check:threshold_default",
      assessment: "phonics_check",
      rule_key: "threshold_default",
      value: String(PHONICS_DEFAULT_THRESHOLD),
      description: "Threshold mark out of 40 (32 in every year published so far). Per-year values are verified by the STA phonics ingester.",
      verification_status: "unverified",
      ...ctx.prov(PHONICS_SRC, null, false, "Threshold as published by STA each year; to be verified."),
      licence_id: "OGL-3.0",
    });
  for (const [key, value, description] of [
    ["words_per_check", "40", "The check has 40 words: 20 real words and 20 pseudo-words."],
    ["sections", "2", "Words are presented in two sections of 20; section 2 is harder."],
    ["pseudo_word_alien", "true", "Pseudo-words are shown next to a picture of an alien so children know they are not real words."],
  ] as const) {
    const id = `phonics_check:${key}`;
    const e = await store.first<{ verification_status: string }>("assessment_rules", { where: { id } });
    if (e?.verification_status !== "verified")
      rows.push({ id, assessment: "phonics_check", rule_key: key, value, description, verification_status: "unverified", ...ctx.prov(PHONICS_SRC, null, false, "Summarised from STA phonics screening check guidance; to be verified."), licence_id: "OGL-3.0" });
  }
  await store.upsert("assessment_rules", rows, ["id"]);
  ctx.bump("assessment_rules", rows.length);
}

async function seedPhonics(store: DataStore, ctx: IngestContext) {
  const rows: Row[] = [];
  for (const set of ORIGINAL_PRACTICE_SETS)
    for (const it of layoutSet(set))
      rows.push({
        id: `phonics:orig:${sha256(set.name).slice(0, 8)}:${it.position}`,
        check_year: null,
        set_name: set.name,
        section: it.section,
        position: it.position,
        word: it.word,
        is_pseudo: it.isPseudo ? 1 : 0,
        kind: "original_practice",
        review_status: "auto_ok",
        ...ctx.prov(null, sha256(JSON.stringify(set)), false, "Original phonics practice words."),
      });
  await store.upsert("phonics_words", rows, ["id"]);
  ctx.bump("phonics_words", rows.length);
}

interface KwRow { id: string; lesson_id: string; unit_id: string; title: string; body: string; third_party_flag: number }

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** Hide the term (and simple plurals) inside its own definition. Returns null if the term still leaks. */
export function maskTerm(definition: string, term: string): string | null {
  const re = new RegExp(`\\b${escapeRe(term)}(s|es)?\\b`, "gi");
  const masked = definition.replace(re, "____");
  const stem = term.toLowerCase().slice(0, Math.max(4, Math.min(6, term.length - 1)));
  if (stem.length >= 4 && masked.toLowerCase().includes(stem)) return null;
  return masked;
}

async function derivedKeywordQuestions(store: DataStore, ctx: IngestContext) {
  const units = new Map(
    (await store.select<{ id: string; subject_id: string; key_stage_id: string; year_group_id: string }>("units", { columns: ["id", "subject_id", "key_stage_id", "year_group_id"] })).map((u) => [u.id, u]),
  );
  const kws = (await store.select<KwRow>("content_blocks", { where: { kind: "keyword" }, columns: ["id", "lesson_id", "unit_id", "title", "body", "third_party_flag"] })).filter(
    (k) => k.lesson_id && k.title && k.body && k.body.trim().length > 8,
  );
  const unitLinks = new Map<string, Array<{ statement_id: string; confidence: number; review_status: string }>>();
  for (const l of await store.select<{ unit_id: string; statement_id: string; confidence: number; review_status: string }>("unit_statement_links"))
    (unitLinks.get(l.unit_id) ?? unitLinks.set(l.unit_id, []).get(l.unit_id)!).push(l);

  // distractor pools: unit -> terms, subject|ks -> terms
  const byLesson = new Map<string, KwRow[]>();
  const byUnit = new Map<string, KwRow[]>();
  const bySubjKs = new Map<string, KwRow[]>();
  for (const k of kws) {
    const u = units.get(k.unit_id);
    if (!u) continue;
    (byLesson.get(k.lesson_id) ?? byLesson.set(k.lesson_id, []).get(k.lesson_id)!).push(k);
    (byUnit.get(k.unit_id) ?? byUnit.set(k.unit_id, []).get(k.unit_id)!).push(k);
    const sk = `${u.subject_id}|${u.key_stage_id}`;
    (bySubjKs.get(sk) ?? bySubjKs.set(sk, []).get(sk)!).push(k);
  }

  const qRows: Row[] = [];
  const oRows: Row[] = [];
  const links: Row[] = [];
  let skipped = 0;
  for (const [lessonId, list] of byLesson) {
    const u = units.get(list[0].unit_id)!;
    const rand = mulberry32(parseInt(sha256(lessonId).slice(0, 8), 16));
    const subj = subjectName(u.subject_id).toLowerCase();
    const attribution = `Practice question adapted from ${/^[aeiou]/.test(subj) ? "an" : "a"} ${subj} lesson by Oak National Academy licensed under Open Government Licence (OGL)`;
    const uniq = [...new Map(list.map((k) => [k.title.toLowerCase().trim(), k])).values()];
    const base = (id: string, qtype: string, sort: number, prompt: string, explanation: string, tp: number): Row => ({
      id, paper_id: null, lesson_id: lessonId, quiz_kind: "derived", qtype, number: null, sort, marks: 1, time_hint_seconds: qtype === "matching" ? 90 : 30,
      prompt_text: prompt, prompt_images_json: null, prompt_extra_json: null, explanation,
      subject_id: u.subject_id, key_stage_id: u.key_stage_id, year_group_id: u.year_group_id, difficulty_id: "d2",
      content_domain_ref: null, extraction_confidence: 1, review_status: "auto_ok", review_notes: "Generated from Oak keyword definitions; answer is the keyword the definition belongs to.",
      ...ctx.prov(`https://www.thenational.academy/teachers/lessons/${lessonId.replace("oak:lesson:", "")}`, sha256(prompt + explanation), tp === 1, attribution),
      licence_id: "OGL-3.0",
    });
    const link = (qid: string) =>
      (unitLinks.get(list[0].unit_id) ?? []).forEach((l) =>
        links.push({ question_id: qid, statement_id: l.statement_id, method: "oak_mapping", confidence: Number((l.confidence * 0.8).toFixed(3)), review_status: l.review_status }),
      );

    // MCQs: up to 2 per lesson
    let made = 0;
    for (const k of uniq) {
      if (made >= 2) break;
      const def = maskTerm(k.body.trim(), k.title.trim());
      if (!def) { skipped++; continue; }
      const pool = [...(byUnit.get(k.unit_id) ?? []), ...(bySubjKs.get(`${u.subject_id}|${u.key_stage_id}`) ?? [])];
      const distract: string[] = [];
      const seen = new Set([k.title.toLowerCase().trim()]);
      const defNorm = k.body.toLowerCase().trim();
      const shuffled = pool.map((p) => [rand(), p] as const).sort((a, b) => a[0] - b[0]).map(([, p]) => p);
      for (const p of shuffled) {
        const t = p.title.trim();
        if (distract.length >= 3) break;
        if (seen.has(t.toLowerCase()) || p.body.toLowerCase().trim() === defNorm || t.length > 40) continue;
        seen.add(t.toLowerCase());
        distract.push(t);
      }
      if (distract.length < 3) { skipped++; continue; }
      const qid = `derived:kw:${sha256(lessonId + k.title).slice(0, 16)}`;
      const opts = [k.title.trim(), ...distract].map((text, i) => ({ text, correct: i === 0, r: rand() })).sort((a, b) => a.r - b.r);
      qRows.push(base(qid, "mcq", made, `Which word matches this meaning?\n“${def}”`, `“${k.title.trim()}” means: ${k.body.trim()}`, k.third_party_flag));
      opts.forEach((o, i) => oRows.push({ id: `${qid}:o${i + 1}`, question_id: qid, label: "ABCD"[i], text: o.text, is_correct: o.correct ? 1 : 0, sort: i }));
      link(qid);
      made++;
    }
    // Matching: 3-4 keywords to their definitions
    const matchable = uniq.filter((k) => k.title.length <= 40 && k.body.length <= 220).slice(0, 4);
    if (matchable.length >= 3 && new Set(matchable.map((k) => k.body.toLowerCase())).size === matchable.length) {
      const qid = `derived:match:${sha256(lessonId).slice(0, 16)}`;
      qRows.push(base(qid, "matching", 10, "Match each keyword to its meaning.", matchable.map((k) => `${k.title.trim()}: ${k.body.trim()}`).join("\n"), Math.max(...matchable.map((k) => k.third_party_flag))));
      const rights = matchable.map((k, i) => ({ k, i, r: rand() })).sort((a, b) => a.r - b.r);
      matchable.forEach((k, i) => oRows.push({ id: `${qid}:L${i + 1}`, question_id: qid, text: k.title.trim(), side: "L", match_key: `m${i + 1}`, sort: i }));
      rights.forEach(({ k, i }, j) => oRows.push({ id: `${qid}:R${i + 1}`, question_id: qid, text: k.body.trim(), side: "R", match_key: `m${i + 1}`, sort: j }));
      link(qid);
    }
  }
  for (const p of chunk(qRows, 1000)) await store.upsert("questions", p, ["id"]);
  for (const p of chunk(oRows, 2000)) await store.upsert("question_options", p, ["id"]);
  for (const p of chunk(links, 2000)) await store.upsert("question_statement_links", p, ["question_id", "statement_id"]);
  ctx.bump("derived_questions", qRows.length);
  ctx.bump("derived_options", oRows.length);
  ctx.bump("derived_links", links.length);
  ctx.bump("derived_skipped_keywords", skipped);
}

async function arithmeticPapers(store: DataStore, ctx: IngestContext) {
  const statements = await store.select<{ id: string; key_stage_id: string; text: string; level: string }>("curriculum_statements", {
    where: { subject_id: "mathematics", key_stage_id: ["ks1", "ks2"], level: ["statement", "sub_statement"], framework: "nc2014" },
    columns: ["id", "key_stage_id", "text", "level"],
  });
  const findStatements = (ks: string, hints: string[]) =>
    statements.filter((s) => s.key_stage_id === ks && s.level === "statement" && hints.some((h) => s.text.toLowerCase().includes(h.toLowerCase()))).map((s) => s.id);

  const qRows: Row[] = [];
  const aRows: Row[] = [];
  const msRows: Row[] = [];
  const links: Row[] = [];
  const papers: Row[] = [];
  const missingHints = new Set<string>();
  for (const [ks, count] of [["ks2", 3], ["ks1", 2]] as const) {
    for (let n = 1; n <= count; n++) {
      const seed = (ks === "ks2" ? 2000 : 1000) + n;
      const paper = generateArithmeticPaper(ks, seed);
      const paperId = `orig:${ks}:arith:${n}`;
      papers.push({
        id: paperId, key_stage_id: ks, subject_id: "mathematics", year: null,
        name: `${ks === "ks2" ? "KS2" : "KS1"} arithmetic practice paper ${String.fromCharCode(64 + n)} (original)`,
        paper_code: `${ks}-orig-arith-${n}`, kind: "original_practice", total_marks: paper.totalMarks, time_allowed_minutes: paper.minutes,
        question_count: paper.items.length, validation_status: "passed",
        validation_json: JSON.stringify({ questions: paper.items.length, marks: paper.totalMarks, answers_computed: true, seed }),
        review_status: "auto_ok", ...ctx.prov(null, sha256(`${ks}:${seed}`)),
      });
      paper.items.forEach((it, i) => {
        const qid = `${paperId}:q${i + 1}`;
        qRows.push({
          id: qid, paper_id: paperId, lesson_id: null, quiz_kind: "generated", qtype: "numeric", number: String(i + 1), sort: i + 1, marks: it.marks,
          time_hint_seconds: it.marks === 2 ? 120 : 40, prompt_text: it.prompt, prompt_images_json: null,
          prompt_extra_json: JSON.stringify({ skill: it.skill, answerForm: it.answerForm }), explanation: it.explanation,
          subject_id: "mathematics", key_stage_id: ks, year_group_id: ks === "ks2" ? "y6" : "y2", difficulty_id: i < paper.items.length / 3 ? "d1" : i < (2 * paper.items.length) / 3 ? "d2" : "d3",
          content_domain_ref: null, extraction_confidence: 1, review_status: "auto_ok", review_notes: null, ...ctx.prov(null, sha256(it.prompt + it.answer.toFractionString())),
        });
        acceptedAnswers(it).forEach((a, j) => aRows.push({ id: `${qid}:a${j + 1}`, question_id: qid, part: "main", answer: a.answer, kind: a.kind, tolerance: null, case_sensitive: 0 }));
        msRows.push({
          id: `${qid}:ms`, question_id: qid, paper_id: paperId, number: String(i + 1), marks: it.marks,
          answer_text: it.answerForm === "fraction" ? `${it.answer.toFractionString()}${it.answer.valueOf() > 1 ? ` or ${it.answer.toMixedString()}` : ""} (equivalent fractions and decimals accepted)` : acceptedAnswers(it)[0].answer,
          guidance: it.marks === 2 ? "Platform policy: the correct final answer earns both marks. On the real test one mark can be given for a correct method with one error; tick it yourself if you are marking on paper." : null,
          sort: i + 1, ...ctx.prov(null, null),
        });
        const ids = findStatements(ks, SKILL_STATEMENT_HINTS[it.skill]);
        if (!ids.length) missingHints.add(it.skill);
        ids.forEach((sid) => links.push({ question_id: qid, statement_id: sid, method: "generator", confidence: 0.9, review_status: "auto_ok" }));
      });
    }
  }
  await store.upsert("papers", papers, ["id"]);
  for (const p of chunk(qRows, 1000)) await store.upsert("questions", p, ["id"]);
  await store.upsert("accepted_answers", aRows, ["id"]);
  await store.upsert("mark_scheme_entries", msRows, ["id"]);
  await store.upsert("question_statement_links", links, ["question_id", "statement_id"]);
  ctx.bump("original_papers", papers.length);
  ctx.bump("original_paper_questions", qRows.length);
  ctx.bump("original_paper_links", links.length);
  if (missingHints.size) await ctx.log("warn", "skill_unlinked", `No NC statement matched skills: ${[...missingHints].join(", ")}`);
}
