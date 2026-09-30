/**
 * Pure mapping functions for the Oak Open Curriculum API (v0) -> Eduworks tables.
 * No I/O here: every function takes parsed API JSON plus provenance and returns rows,
 * so the rules (question types, review status, third-party flags) are unit-testable.
 *
 * Response shapes follow the published OpenAPI spec (open-api.thenational.academy/api/v0):
 *   GET /lessons/{lesson}/summary     LessonSummaryResponseSchema
 *   GET /lessons/{lesson}/transcript  TranscriptResponseSchema
 *   GET /lessons/{lesson}/assets      LessonAssetsResponseSchema
 *   GET /lessons/{lesson}/quiz        QuestionForLessonsResponseSchema
 *   GET /key-stages/{ks}/subject/{s}/questions, /sequences/{seq}/questions  (per-lesson starter/exit arrays)
 */
import crypto from "node:crypto";
import type { Row } from "../../src/lib/db/store";
import type { QuestionType, ReviewStatus } from "../../src/lib/questions/types";

export const OAK_API_BASE = "https://open-api.thenational.academy/api/v0";
export const OAK_API_SOURCE_ID = "oak_api";
export const OAK_LICENCE_ID = "OGL-3.0";

// ---------------------------------------------------------------- API types (from the spec)

export interface OakImage {
  url: string;
  width?: number;
  height?: number;
  alt?: string;
  text?: string;
  attribution?: string;
}
export interface OakTextAnswer {
  type: "text";
  content: string;
  distractor?: boolean;
}
export interface OakImageAnswer {
  type: "image";
  content: OakImage;
  distractor?: boolean;
}
export interface OakOrderAnswer {
  type: "text";
  content: string;
  order: number;
}
export interface OakMatchAnswer {
  matchOption: { type: "text"; content: string };
  correctChoice: { type: "text"; content: string };
}
export interface OakQuestion {
  question: string;
  questionType: "multiple-choice" | "short-answer" | "match" | "order" | string;
  questionImage?: OakImage;
  answers: Array<OakTextAnswer | OakImageAnswer | OakOrderAnswer | OakMatchAnswer>;
  /** Not in the v0 spec; used if Oak ever adds feedback/explanations. */
  explanation?: string;
  feedback?: string;
}
export interface OakQuizResponse {
  starterQuiz?: OakQuestion[];
  exitQuiz?: OakQuestion[];
}
export interface OakLessonQuestions extends OakQuizResponse {
  lessonSlug: string;
  lessonTitle?: string;
}
export interface OakLessonSummary {
  lessonTitle: string;
  canonicalUrl?: string;
  oakUrl?: string;
  units?: Array<{ unitSlug: string; unitTitle: string }>;
  subjectSlug: string;
  subjectTitle?: string;
  keyStageSlug: string;
  keyStageTitle?: string;
  lessonKeywords?: Array<{ keyword: string; description: string }>;
  keyLearningPoints?: Array<{ keyLearningPoint: string }>;
  misconceptionsAndCommonMistakes?: Array<{ misconception: string; response: string }>;
  pupilLessonOutcome?: string;
  teacherTips?: Array<{ teacherTip: string }>;
  contentGuidance?: Array<{
    contentGuidanceArea: string;
    supervisionlevel_id: number;
    contentGuidanceLabel: string;
    contentGuidanceDescription: string;
  }> | null;
  supervisionLevel?: string | null;
  downloadsAvailable?: boolean;
}
export interface OakTranscript {
  transcript: string;
  vtt?: string;
}
export interface OakAssets {
  oakUrl?: string;
  attribution?: string[];
  assets?: Array<{ type: string; label: string; url: string }>;
}
export interface OakKsSubjectLessons {
  unitSlug: string;
  unitTitle: string;
  lessons: Array<{ lessonSlug: string; lessonTitle: string }>;
}
/** check-restricted endpoints: { [lessonSlug]: "ogl-compatible" | "restricted" } */
export type OakRestrictions = Record<string, "ogl-compatible" | "restricted" | string>;

// ---------------------------------------------------------------- helpers

export const sha256 = (s: string | Buffer) => crypto.createHash("sha256").update(s).digest("hex");
export const lessonIdFor = (slug: string) => `oak:lesson:${slug}`;
export const unitIdFor = (slug: string) => `oak:unit:${slug}`;

/** Provenance block written on every oak_api record. */
export interface ProvBlock {
  source_id: string;
  source_url: string | null;
  licence_id: string;
  attribution_text: string;
  retrieved_at: string;
  third_party_flag: 0 | 1;
  checksum: string | null;
}

export function makeProv(
  sourceUrl: string,
  checksum: string | null,
  attribution: string,
  thirdParty: boolean,
  retrievedAt: string,
): ProvBlock {
  return {
    source_id: OAK_API_SOURCE_ID,
    source_url: sourceUrl,
    licence_id: OAK_LICENCE_ID,
    attribution_text: attribution,
    retrieved_at: retrievedAt,
    third_party_flag: thirdParty ? 1 : 0,
    checksum,
  };
}

const txt = (s: unknown) => (typeof s === "string" ? s.trim() : "");

/** Strict plain-number check (integers, decimals, thousands separators, leading minus). Fractions and units stay 'exact'. */
export function isNumericAnswer(s: string): boolean {
  const t = s.trim().replace(/−/g, "-");
  return /^-?(\d{1,3}(,\d{3})+|\d+)(\.\d+)?$/.test(t);
}

/** Stable content hash used to deduplicate batch-endpoint questions against lesson quizzes. */
export function questionContentHash(q: OakQuestion): string {
  const norm = (s: unknown) => (typeof s === "string" ? s.normalize("NFKC").replace(/\s+/g, " ").trim().toLowerCase() : s);
  const answers = (q.answers ?? []).map((a) => {
    if ("matchOption" in a) return { m: norm(a.matchOption?.content), c: norm(a.correctChoice?.content) };
    if (a.type === "image") return { i: (a as OakImageAnswer).content?.url, t: norm((a as OakImageAnswer).content?.text), d: a.distractor };
    return { t: norm(a.content), d: (a as OakTextAnswer).distractor, o: (a as OakOrderAnswer).order };
  });
  return sha256(JSON.stringify({ k: q.questionType, q: norm(q.question), img: q.questionImage?.url ?? null, a: answers }));
}

// ---------------------------------------------------------------- questions

export interface QuestionContext {
  id: string;
  lessonId: string | null;
  quizKind: "starter" | "exit" | "oak_question_bank";
  position: number; // 1-based
  subjectId: string | null;
  keyStageId: string | null;
  yearGroupId: string | null;
  prov: ProvBlock;
  extra?: Record<string, unknown>;
}

export interface MappedQuestion {
  question: Row;
  options: Row[];
  answers: Row[];
  /** Data problems in Oak's payload (logged as warnings; never "fixed"). */
  issues: string[];
  /** Things that could not be represented (image-only option etc.); lower confidence, needs review. */
  dropped: string[];
  contentHash: string;
}

const LABELS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

function imageJson(img: OakImage) {
  return {
    path: img.url,
    alt: img.alt ?? null,
    ...(img.text ? { text: img.text } : {}),
    ...(img.width ? { width: img.width, height: img.height } : {}),
    ...(img.attribution ? { attribution: img.attribution } : {}),
  };
}

/**
 * Map one Oak quiz question to questions / question_options / accepted_answers rows.
 * Returns null for a question type the contract cannot represent (caller logs it).
 */
export function mapQuestion(q: OakQuestion, c: QuestionContext): MappedQuestion | null {
  const issues: string[] = [];
  const dropped: string[] = [];
  const options: Row[] = [];
  const answers: Row[] = [];
  const id = c.id;
  const prompt = txt(q.question);
  const answersIn = Array.isArray(q.answers) ? q.answers : [];
  let qtype: QuestionType;
  const imageAttributions: string[] = [];
  if (q.questionImage?.attribution) imageAttributions.push(q.questionImage.attribution);

  if (!prompt && !q.questionImage) issues.push("empty_prompt");
  if (!answersIn.length) issues.push("no_answers");

  switch (q.questionType) {
    case "multiple-choice": {
      let correct = 0;
      const seen = new Set<string>();
      answersIn.forEach((a, i) => {
        const isCorrect = (a as OakTextAnswer).distractor === false;
        if (isCorrect) correct++;
        let text = "";
        let image: string | null = null;
        if ((a as OakImageAnswer).type === "image") {
          const img = (a as OakImageAnswer).content ?? ({} as OakImage);
          image = img.url ?? null;
          text = txt(img.text) || "";
          if (img.attribution) imageAttributions.push(img.attribution);
          if (!text) dropped.push(`option_${i + 1}_image_only`);
        } else {
          text = txt((a as OakTextAnswer).content);
          if (!text) issues.push(`option_${i + 1}_empty`);
        }
        if (typeof (a as OakTextAnswer).distractor !== "boolean") issues.push(`option_${i + 1}_no_distractor_flag`);
        const key = `${text}|${image ?? ""}`.toLowerCase();
        if (seen.has(key)) issues.push("duplicate_options");
        seen.add(key);
        options.push({
          id: `${id}:o${i + 1}`,
          question_id: id,
          label: LABELS[i] ?? String(i + 1),
          text,
          image_path: image,
          is_correct: isCorrect ? 1 : 0,
          match_key: null,
          side: null,
          correct_position: null,
          sort: i,
        });
      });
      if (correct === 0) issues.push("no_correct_option");
      if (correct === answersIn.length && answersIn.length > 0) issues.push("all_options_correct");
      qtype = correct > 1 ? "multi_select" : "mcq";
      break;
    }
    case "short-answer": {
      qtype = "text_exact";
      const seen = new Set<string>();
      answersIn.forEach((a, i) => {
        const t = txt((a as OakTextAnswer).content);
        if (!t) {
          issues.push(`answer_${i + 1}_empty`);
          return;
        }
        if (seen.has(t.toLowerCase())) return; // exact duplicate alternative; nothing lost
        seen.add(t.toLowerCase());
        answers.push({
          id: `${id}:a${i + 1}`,
          question_id: id,
          part: "main",
          answer: t,
          kind: isNumericAnswer(t) ? "numeric" : "exact",
          tolerance: null,
          case_sensitive: 0,
          marks: null,
        });
      });
      if (!answers.length) issues.push("no_accepted_answer");
      break;
    }
    case "order": {
      qtype = "ordering";
      const positions: number[] = [];
      answersIn.forEach((a, i) => {
        const o = a as OakOrderAnswer;
        const t = txt(o.content);
        if (!t) issues.push(`item_${i + 1}_empty`);
        const pos = typeof o.order === "number" && Number.isFinite(o.order) ? o.order : null;
        if (pos === null) issues.push(`item_${i + 1}_no_order`);
        else positions.push(pos);
        options.push({
          id: `${id}:o${i + 1}`,
          question_id: id,
          label: null,
          text: t,
          image_path: null,
          is_correct: 0,
          match_key: null,
          side: null,
          correct_position: pos,
          sort: i,
        });
      });
      const sorted = [...positions].sort((a, b) => a - b);
      if (positions.length && !sorted.every((p, i) => p === i + 1)) issues.push("order_positions_not_1_to_n");
      break;
    }
    case "match": {
      qtype = "matching";
      const lefts = new Set<string>();
      const rights = new Set<string>();
      answersIn.forEach((a, i) => {
        const m = a as OakMatchAnswer;
        const l = txt(m.matchOption?.content);
        const r = txt(m.correctChoice?.content);
        if (!l || !r) issues.push(`pair_${i + 1}_empty`);
        if (lefts.has(l.toLowerCase())) issues.push("duplicate_left_items");
        if (rights.has(r.toLowerCase())) issues.push("duplicate_right_items");
        lefts.add(l.toLowerCase());
        rights.add(r.toLowerCase());
        const key = `m${i + 1}`;
        options.push({ id: `${id}:L${i + 1}`, question_id: id, label: null, text: l, image_path: null, is_correct: 0, match_key: key, side: "L", correct_position: null, sort: i });
        options.push({ id: `${id}:R${i + 1}`, question_id: id, label: null, text: r, image_path: null, is_correct: 0, match_key: key, side: "R", correct_position: null, sort: answersIn.length + i });
      });
      break;
    }
    default:
      return null;
  }

  const uniqueIssues = [...new Set(issues)];
  const reviewStatus: ReviewStatus = uniqueIssues.length || dropped.length ? "needs_review" : "auto_ok";
  const confidence = uniqueIssues.length ? 0.5 : dropped.length ? 0.8 : 1;
  const explanation = txt(q.explanation) || txt(q.feedback) || null;
  const thirdParty = c.prov.third_party_flag === 1 || imageAttributions.length > 0;
  const attribution = imageAttributions.length
    ? `${c.prov.attribution_text}. Images: ${[...new Set(imageAttributions)].join("; ")}`
    : c.prov.attribution_text;
  const contentHash = questionContentHash(q);
  const notes = [...uniqueIssues, ...dropped];

  const question: Row = {
    id,
    paper_id: null,
    lesson_id: c.lessonId,
    quiz_kind: c.quizKind,
    qtype,
    number: String(c.position),
    sort: c.position,
    marks: 1,
    time_hint_seconds: null,
    prompt_text: prompt,
    prompt_images_json: q.questionImage?.url ? JSON.stringify([imageJson(q.questionImage)]) : null,
    prompt_extra_json: JSON.stringify({ oak_question_type: q.questionType, oak_content_hash: contentHash, ...(c.extra ?? {}) }),
    explanation,
    subject_id: c.subjectId,
    key_stage_id: c.keyStageId,
    year_group_id: c.yearGroupId,
    difficulty_id: null,
    content_domain_ref: null,
    extraction_confidence: confidence,
    review_status: reviewStatus,
    review_notes: notes.length ? `oak_api: ${notes.join(", ")}` : null,
    reviewed_at: null,
    ...c.prov,
    attribution_text: attribution,
    third_party_flag: thirdParty ? 1 : 0,
  };
  return { question, options, answers, issues: uniqueIssues, dropped, contentHash };
}

/** Map a lesson's starter + exit quiz. Unsupported question types are returned in `skipped`. */
export function mapQuiz(
  quiz: OakQuizResponse,
  base: Omit<QuestionContext, "id" | "quizKind" | "position">,
  idFor: (kind: "starter" | "exit", position: number) => string,
): { mapped: MappedQuestion[]; skipped: Array<{ kind: string; position: number; questionType: string }> } {
  const mapped: MappedQuestion[] = [];
  const skipped: Array<{ kind: string; position: number; questionType: string }> = [];
  for (const [kind, list] of [
    ["starter", quiz.starterQuiz ?? []],
    ["exit", quiz.exitQuiz ?? []],
  ] as const) {
    list.forEach((q, i) => {
      const m = mapQuestion(q, { ...base, id: idFor(kind, i + 1), quizKind: kind, position: i + 1 });
      if (m) mapped.push(m);
      else skipped.push({ kind, position: i + 1, questionType: String(q?.questionType) });
    });
  }
  return { mapped, skipped };
}

// ---------------------------------------------------------------- lesson content

export function mapSummaryBlocks(slug: string, lessonId: string, unitId: string | null, s: OakLessonSummary, prov: ProvBlock): Row[] {
  const rows: Row[] = [];
  const block = (kind: string, n: number, title: string | null, body: string, extra?: unknown): Row => ({
    id: `oakapi:${slug}:${kind}:${n}`,
    lesson_id: lessonId,
    unit_id: unitId,
    kind,
    title,
    body,
    extra_json: extra === undefined ? null : JSON.stringify(extra),
    sort: n - 1,
    ...prov,
  });
  (s.keyLearningPoints ?? []).forEach((k, i) => {
    const b = txt(k?.keyLearningPoint);
    if (b) rows.push(block("key_learning_point", i + 1, null, b));
  });
  (s.lessonKeywords ?? []).forEach((k, i) => {
    const t = txt(k?.keyword);
    if (t) rows.push(block("keyword", i + 1, t, txt(k?.description)));
  });
  (s.misconceptionsAndCommonMistakes ?? []).forEach((m, i) => {
    const t = txt(m?.misconception);
    if (t) rows.push(block("misconception", i + 1, t, txt(m?.response)));
  });
  (s.teacherTips ?? []).forEach((t, i) => {
    const b = txt(t?.teacherTip);
    if (b) rows.push(block("teacher_tip", i + 1, null, b));
  });
  (s.contentGuidance ?? []).forEach((g, i) => {
    if (!g) return;
    rows.push(
      block("content_guidance", i + 1, txt(g.contentGuidanceLabel) || null, txt(g.contentGuidanceDescription), {
        area: g.contentGuidanceArea ?? null,
        supervisionlevel_id: g.supervisionlevel_id ?? null,
        supervisionLevel: s.supervisionLevel ?? null,
      }),
    );
  });
  return rows;
}

export function mapTranscriptBlock(slug: string, lessonId: string, unitId: string | null, t: OakTranscript, prov: ProvBlock): Row | null {
  const body = txt(t?.transcript);
  if (!body) return null;
  return {
    id: `oakapi:${slug}:transcript:1`,
    lesson_id: lessonId,
    unit_id: unitId,
    kind: "transcript",
    title: null,
    body,
    extra_json: JSON.stringify({ has_vtt: !!t.vtt }),
    sort: 0,
    ...prov,
  };
}

export const ASSET_KIND: Record<string, string> = {
  slideDeck: "slides",
  worksheet: "worksheet",
  worksheetAnswers: "worksheet_answers",
  video: "video",
};

/** Asset links only (no downloads). Third-party attributions on the lesson's resources flag the assets. */
export function mapAssets(slug: string, lessonId: string, a: OakAssets, prov: ProvBlock): { rows: Row[]; skippedTypes: string[]; thirdParty: boolean } {
  const attributions = (a?.attribution ?? []).map(txt).filter(Boolean);
  const thirdParty = prov.third_party_flag === 1 || attributions.length > 0;
  const attribution = attributions.length ? `${prov.attribution_text}. Third-party: ${attributions.join("; ")}` : prov.attribution_text;
  const rows: Row[] = [];
  const skippedTypes: string[] = [];
  for (const x of a?.assets ?? []) {
    const kind = ASSET_KIND[x.type];
    if (!kind) {
      skippedTypes.push(x.type);
      continue;
    }
    rows.push({
      id: `oakapi:${slug}:asset:${x.type}`,
      lesson_id: lessonId,
      question_id: null,
      paper_id: null,
      kind,
      title: txt(x.label) || null,
      url: x.url,
      local_path: null,
      mime: null,
      ...prov,
      attribution_text: attribution,
      third_party_flag: thirdParty ? 1 : 0,
    });
  }
  return { rows, skippedTypes, thirdParty };
}

/**
 * Merge API lesson data into an existing lessons row (usually from oak_ontology) without
 * replacing its provenance. Returns a patch for an existing row, or a full row to insert.
 */
export function mergeLesson(
  existing: Row | undefined,
  incoming: { id: string; slug: string; title: string; unitId: string | null; pupilOutcome: string | null; externalUrl: string | null; hasQuiz: boolean; thirdParty: boolean; sort: number },
  prov: ProvBlock,
): { op: "insert"; row: Row } | { op: "update"; patch: Row } {
  if (!existing) {
    return {
      op: "insert",
      row: {
        id: incoming.id,
        unit_id: incoming.unitId,
        slug: incoming.slug,
        title: incoming.title,
        pupil_outcome: incoming.pupilOutcome,
        sort: incoming.sort,
        external_id: null,
        external_url: incoming.externalUrl,
        has_quiz: incoming.hasQuiz ? 1 : 0,
        ...prov,
        third_party_flag: incoming.thirdParty ? 1 : 0,
      },
    };
  }
  const patch: Row = {};
  if (incoming.hasQuiz && Number(existing.has_quiz) !== 1) patch.has_quiz = 1;
  if (!txt(existing.pupil_outcome) && incoming.pupilOutcome) patch.pupil_outcome = incoming.pupilOutcome;
  if (!existing.unit_id && incoming.unitId) patch.unit_id = incoming.unitId;
  if (!existing.external_url && incoming.externalUrl) patch.external_url = incoming.externalUrl;
  if (incoming.thirdParty && Number(existing.third_party_flag) !== 1) patch.third_party_flag = 1;
  return { op: "update", patch };
}

/** Link questions to the statements already mapped to their lesson's unit(s). */
export function questionStatementLinks(
  questionIds: string[],
  unitLinks: Array<{ statement_id: string; confidence: number; review_status: string }>,
): Row[] {
  const best = new Map<string, { confidence: number; review_status: string }>();
  for (const l of unitLinks) {
    const cur = best.get(l.statement_id);
    if (!cur || Number(l.confidence) > cur.confidence) best.set(l.statement_id, { confidence: Number(l.confidence), review_status: l.review_status });
  }
  const rows: Row[] = [];
  for (const qid of questionIds)
    for (const [sid, l] of best)
      rows.push({ question_id: qid, statement_id: sid, method: "oak_mapping", confidence: Math.min(l.confidence, 0.9), review_status: l.review_status });
  return rows;
}

/** Tiny .env parser (KEY=VALUE, optional quotes, `export ` prefix, # comments). */
export function parseDotEnv(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const m = line.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!m) continue;
    let v = m[2].trim();
    const q = v.match(/^(["'])(.*?)\1(\s+#.*)?$/);
    if (q) v = q[2];
    else v = v.replace(/\s+#.*$/, "");
    out[m[1]] = v;
  }
  return out;
}

/** Parse an RFC 8288 Link header and say whether it has rel="next". */
export function hasNextLink(link: string | undefined | null): boolean {
  return !!link && /rel="?next"?/i.test(link);
}
