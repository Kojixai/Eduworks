// Validates a book content file against CONTENT_SCHEMA.txt.
// Errors stop the build. Warnings are printed but do not stop it.

import { DIAGRAM_KINDS, QUESTION_TYPES } from "./types";

export interface ValidationResult {
  ok: boolean;
  errors: string[];
  warnings: string[];
}

const KEY_STAGES = ["KS1", "KS2", "KS3", "KS4"];
const SUBJECTS = ["Maths", "English", "English Literature", "English Language"];
const TEXT_KINDS = ["prose", "poem", "playscript", "nonfiction"];
const HEX = /^#[0-9a-fA-F]{6}$/;

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === "string";
const isNonEmptyStr = (v: unknown): v is string => typeof v === "string" && v.trim().length > 0;
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const isInt = (v: unknown): v is number => Number.isInteger(v);
const isStrArr = (v: unknown): v is string[] => Array.isArray(v) && v.every(isStr);
const show = (v: unknown) => {
  const s = JSON.stringify(v);
  return s === undefined ? "nothing" : s.length > 60 ? s.slice(0, 57) + "..." : s;
};

export function countGaps(prompt: string): number {
  return (prompt.match(/_{3,}/g) || []).length;
}

export function validateBook(data: unknown, fileName = "book.json"): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const err = (where: string, msg: string) => errors.push(`${fileName} > ${where}: ${msg}`);
  const warn = (where: string, msg: string) => warnings.push(`${fileName} > ${where}: ${msg}`);

  if (!isObj(data)) {
    err("(top level)", "the file must contain one JSON object with \"book\", \"texts\" and \"units\"");
    return { ok: false, errors, warnings };
  }

  // ---- book ----
  const book = data.book;
  const sectionIds = new Set<string>();
  let bookId = "";
  if (!isObj(book)) {
    err("book", "missing or not an object");
  } else {
    if (!isNonEmptyStr(book.id)) err("book.id", "must be a non-empty string");
    else {
      bookId = book.id;
      if (!/^[a-z0-9][a-z0-9_-]*$/.test(bookId))
        err("book.id", `must use lowercase letters, numbers, hyphens or underscores only (it becomes part of the web address), got ${show(bookId)}`);
      const stem = fileName.replace(/\.json$/, "");
      if (!stem.startsWith("_") && stem !== bookId)
        err("book.id", `must match the file name: file is "${fileName}" so book.id should be "${stem}", got "${bookId}"`);
    }
    if (!isNonEmptyStr(book.title)) err("book.title", "must be a non-empty string");
    if (!KEY_STAGES.includes(book.keyStage as string)) err("book.keyStage", `must be one of ${KEY_STAGES.join(", ")}, got ${show(book.keyStage)}`);
    if (!isNonEmptyStr(book.year)) err("book.year", "must be a string such as \"Year 4\" or \"GCSE\"");
    if (!SUBJECTS.includes(book.subject as string)) err("book.subject", `must be one of ${SUBJECTS.join(", ")}, got ${show(book.subject)}`);
    if (!isInt(book.pages) || (book.pages as number) < 1) err("book.pages", `must be a whole number of pages, got ${show(book.pages)}`);
    if (!isNonEmptyStr(book.ageRange)) err("book.ageRange", "must be a string such as \"8-9\"");
    if (!Array.isArray(book.sections) || book.sections.length === 0) err("book.sections", "must be a non-empty list");
    else
      book.sections.forEach((s, i) => {
        const w = `book.sections[${i}]`;
        if (!isObj(s)) return err(w, "must be an object with id, name, colour");
        if (!isNonEmptyStr(s.id)) err(`${w}.id`, "must be a non-empty string");
        else if (sectionIds.has(s.id)) err(`${w}.id`, `duplicate section id "${s.id}"`);
        else sectionIds.add(s.id);
        if (!isNonEmptyStr(s.name)) err(`${w}.name`, "must be a non-empty string");
        if (!isStr(s.colour) || !HEX.test(s.colour)) err(`${w}.colour`, `must be a 6-digit hex colour like "#2360A8", got ${show(s.colour)}`);
      });
  }

  // ---- texts ----
  const textIds = new Map<string, number>();
  if (!Array.isArray(data.texts)) err("texts", "must be a list (use [] if the book has no reading texts)");
  else
    data.texts.forEach((t, i) => {
      const w = `texts[${i}]`;
      if (!isObj(t)) return err(w, "must be an object");
      const tw = isStr(t.id) ? `texts[${i}] (${t.id})` : w;
      if (!isNonEmptyStr(t.id)) err(`${w}.id`, "must be a non-empty string");
      else if (textIds.has(t.id)) err(`${tw}.id`, `duplicate text id "${t.id}"`);
      if (!isNonEmptyStr(t.title)) err(`${tw}.title`, "must be a non-empty string");
      if (!isStr(t.author)) err(`${tw}.author`, "must be a string");
      if (!isNonEmptyStr(t.source)) err(`${tw}.source`, "must say where the text comes from");
      if (!TEXT_KINDS.includes(t.kind as string)) err(`${tw}.kind`, `must be one of ${TEXT_KINDS.join(", ")}, got ${show(t.kind)}`);
      if (!isStrArr(t.lines) || t.lines.length === 0) err(`${tw}.lines`, "must be a non-empty list of strings");
      else if (isStr(t.id)) textIds.set(t.id, t.lines.length);
      if (t.glossary !== undefined) {
        if (!Array.isArray(t.glossary) || !t.glossary.every((g) => Array.isArray(g) && g.length === 2 && g.every(isNonEmptyStr)))
          err(`${tw}.glossary`, "must be a list of [\"word\", \"meaning\"] pairs");
      }
    });

  // ---- units ----
  const unitIds = new Set<string>();
  const questionIds = new Set<string>();
  if (!Array.isArray(data.units) || data.units.length === 0) err("units", "must be a non-empty list");
  else
    data.units.forEach((u, i) => {
      if (!isObj(u)) return err(`units[${i}]`, "must be an object");
      const uw = isStr(u.id) ? `units[${i}] (${u.id})` : `units[${i}]`;
      if (!isNonEmptyStr(u.id)) err(`${uw}.id`, "must be a non-empty string");
      else {
        if (unitIds.has(u.id)) err(`${uw}.id`, `duplicate unit id "${u.id}"`);
        unitIds.add(u.id);
        if (!/^[A-Za-z0-9_-]+$/.test(u.id)) err(`${uw}.id`, "must use letters, numbers, hyphens only (it becomes part of the web address)");
        if (bookId && !u.id.startsWith(bookId)) warn(`${uw}.id`, `expected to start with the book id "${bookId}"`);
      }
      if (!isStr(u.section) || !sectionIds.has(u.section))
        err(`${uw}.section`, `must be one of the section ids in book.sections (${[...sectionIds].join(", ")}), got ${show(u.section)}`);
      if (!isNonEmptyStr(u.title)) err(`${uw}.title`, "must be a non-empty string");
      if (!Array.isArray(u.bookPages) || !u.bookPages.every((p) => isInt(p) && p > 0))
        err(`${uw}.bookPages`, `must be a list of page numbers like [4] or [4, 5], got ${show(u.bookPages)}`);
      if (!isStrArr(u.curriculum)) err(`${uw}.curriculum`, "must be a list of curriculum id strings");
      if (!isNonEmptyStr(u.summary)) err(`${uw}.summary`, "must be a 1-2 sentence 'Remember' summary");
      let lineCount = 0;
      if (u.textId !== null && u.textId !== undefined) {
        if (!isStr(u.textId) || !textIds.has(u.textId)) err(`${uw}.textId`, `must be null or the id of one of the texts, got ${show(u.textId)}`);
        else lineCount = textIds.get(u.textId) || 0;
      } else if (u.textId === undefined) {
        err(`${uw}.textId`, "is missing (use null when the unit has no reading text)");
      }
      if (!Array.isArray(u.questions) || u.questions.length === 0) return err(`${uw}.questions`, "must be a non-empty list");
      if (u.questions.length !== 10) warn(`${uw}.questions`, `the schema expects 10 questions per unit, found ${u.questions.length}`);
      u.questions.forEach((q, j) => validateQuestion(q, `${uw} > questions[${j}]`, err, warn, questionIds, lineCount));
    });

  return { ok: errors.length === 0, errors, warnings };
}

function validateQuestion(
  q: unknown,
  where: string,
  err: (w: string, m: string) => void,
  warn: (w: string, m: string) => void,
  ids: Set<string>,
  textLines: number,
) {
  if (!isObj(q)) return err(where, "must be an object");
  const w = isStr(q.id) ? `${where} (${q.id})` : where;
  if (!isNonEmptyStr(q.id)) err(`${w}.id`, "must be a non-empty string");
  else if (ids.has(q.id)) err(`${w}.id`, `duplicate question id "${q.id}"`);
  else ids.add(q.id);

  const type = q.type as string;
  if (!QUESTION_TYPES.includes(type as never)) {
    err(`${w}.type`, `must be one of ${QUESTION_TYPES.join(", ")}, got ${show(q.type)}`);
    return;
  }
  if (!isNonEmptyStr(q.prompt)) err(`${w}.prompt`, "must be non-empty text");
  if (!isInt(q.difficulty) || (q.difficulty as number) < 1 || (q.difficulty as number) > 5)
    err(`${w}.difficulty`, `must be a whole number 1-5, got ${show(q.difficulty)}`);
  const maxMarks = type === "extended" ? 8 : 3;
  if (!isInt(q.marks) || (q.marks as number) < 1 || (q.marks as number) > maxMarks)
    err(`${w}.marks`, `must be a whole number 1-${maxMarks}, got ${show(q.marks)}`);
  if (!isNonEmptyStr(q.explanation)) err(`${w}.explanation`, "must explain the answer");
  if (q.misconception !== undefined && !isStr(q.misconception)) err(`${w}.misconception`, "must be text if given");
  if (q.curriculum !== undefined && !isStrArr(q.curriculum)) err(`${w}.curriculum`, "must be a list of strings if given");

  if (isStr(q.prompt) && textLines > 0) {
    for (const m of q.prompt.matchAll(/\blines? (\d+)(?:\s*(?:-|to|and)\s*(\d+))?/gi)) {
      for (const n of [m[1], m[2]].filter(Boolean).map(Number)) {
        if (n > textLines) err(`${w}.prompt`, `refers to line ${n} but the unit's text only has ${textLines} lines`);
      }
    }
  }

  const options = q.options;
  const checkOptions = () => {
    if (!isStrArr(options) || options.length < 2) {
      err(`${w}.options`, "must be a list of at least 2 option strings");
      return 0;
    }
    if (options.length < 3 || options.length > 5) warn(`${w}.options`, `the schema expects 3-5 options, found ${options.length}`);
    if (new Set(options).size !== options.length) err(`${w}.options`, "contains the same option twice");
    return options.length;
  };

  switch (type) {
    case "mcq": {
      const n = checkOptions();
      if (!isInt(q.answer) || (n && ((q.answer as number) < 0 || (q.answer as number) >= n)))
        err(`${w}.answer`, `must be the 0-based index of the right option (0 to ${Math.max(0, n - 1)}), got ${show(q.answer)}`);
      break;
    }
    case "multi": {
      const n = checkOptions();
      if (!Array.isArray(q.answer) || q.answer.length === 0 || !q.answer.every((a) => isInt(a) && a >= 0 && a < n))
        err(`${w}.answer`, `must be a non-empty list of 0-based option indices (0 to ${Math.max(0, n - 1)}), got ${show(q.answer)}`);
      else if (new Set(q.answer).size !== q.answer.length) err(`${w}.answer`, "lists the same index twice");
      break;
    }
    case "numeric":
      if (!isNum(q.answer)) err(`${w}.answer`, `must be a number (not a string), got ${show(q.answer)}`);
      if (q.tolerance !== undefined && (!isNum(q.tolerance) || (q.tolerance as number) < 0)) err(`${w}.tolerance`, "must be a number 0 or more");
      if (q.unit !== undefined && !isStr(q.unit)) err(`${w}.unit`, "must be text such as \"cm\"");
      if (q.accept !== undefined && !isStrArr(q.accept)) err(`${w}.accept`, "must be a list of strings");
      break;
    case "text":
      if (!isNonEmptyStr(q.answer)) err(`${w}.answer`, "must be a non-empty string");
      if (q.accept !== undefined && !isStrArr(q.accept)) err(`${w}.accept`, "must be a list of strings");
      break;
    case "order":
      if (!isStrArr(q.items) || q.items.length < 2) err(`${w}.items`, "must be a list of at least 2 strings, in the correct order");
      else if (new Set(q.items).size !== q.items.length) err(`${w}.items`, "contains the same item twice, so the order would be ambiguous");
      break;
    case "match":
      if (!Array.isArray(q.pairs) || !q.pairs.every((p) => Array.isArray(p) && p.length === 2 && p.every(isNonEmptyStr)))
        err(`${w}.pairs`, "must be a list of [\"left\", \"right\"] pairs");
      else {
        if (q.pairs.length < 2) err(`${w}.pairs`, "needs at least 2 pairs");
        else if (q.pairs.length < 3 || q.pairs.length > 5) warn(`${w}.pairs`, `the schema expects 3-5 pairs, found ${q.pairs.length}`);
        const rights = q.pairs.map((p) => (p as string[])[1]);
        if (new Set(rights).size !== rights.length) err(`${w}.pairs`, "two pairs share the same right-hand side, so marking would be ambiguous");
      }
      break;
    case "truefalse":
      if (!Array.isArray(q.statements) || q.statements.length === 0 || !q.statements.every((s) => isObj(s) && isNonEmptyStr(s.s) && typeof s.a === "boolean"))
        err(`${w}.statements`, "must be a list of {\"s\": \"statement\", \"a\": true/false}");
      else if (q.statements.length < 3 || q.statements.length > 5) warn(`${w}.statements`, `the schema expects 3-5 statements, found ${q.statements.length}`);
      break;
    case "cloze": {
      const gaps = isStr(q.prompt) ? countGaps(q.prompt) : 0;
      if (gaps < 1 || gaps > 3) err(`${w}.prompt`, `a cloze prompt must contain 1-3 gaps written as ___, found ${gaps}`);
      if (!isStrArr(q.answer) || !q.answer.every(isNonEmptyStr)) err(`${w}.answer`, "must be a list of strings, one per gap");
      else if (q.answer.length !== gaps) err(`${w}.answer`, `has ${q.answer.length} answers but the prompt has ${gaps} gaps`);
      if (q.accept !== undefined) {
        if (!Array.isArray(q.accept) || !q.accept.every(isStrArr)) err(`${w}.accept`, "must be a list of lists, e.g. [[\"alt for gap 1\"], []]");
        else if (q.accept.length > gaps) err(`${w}.accept`, `has ${q.accept.length} lists but the prompt has ${gaps} gaps`);
      }
      break;
    }
    case "extended":
      if (!isNonEmptyStr(q.model)) err(`${w}.model`, "must be a model answer");
      if (!isStrArr(q.checklist) || q.checklist.length === 0) err(`${w}.checklist`, "must be a non-empty list of points");
      break;
  }

  if (q.diagram !== undefined) validateDiagram(q.diagram, `${w}.diagram`, err);
}

export function validateDiagram(d: unknown, w: string, err: (w: string, m: string) => void) {
  if (!isObj(d)) return err(w, "must be an object with a \"kind\"");
  const kind = d.kind as string;
  if (!DIAGRAM_KINDS.includes(kind as never)) return err(`${w}.kind`, `must be one of ${DIAGRAM_KINDS.join(", ")}, got ${show(d.kind)}`);
  const need = (k: string, test: (v: unknown) => boolean, desc: string) => {
    if (!test(d[k])) err(`${w}.${k}`, `${kind} needs "${k}" (${desc}), got ${show(d[k])}`);
  };
  const posInt = (v: unknown) => isInt(v) && (v as number) > 0;
  switch (kind) {
    case "numberline":
      need("min", isNum, "a number");
      need("max", isNum, "a number");
      need("step", (v) => isNum(v) && (v as number) > 0, "a positive number");
      if (isNum(d.min) && isNum(d.max) && d.max <= d.min) err(`${w}.max`, "must be bigger than min");
      if (isNum(d.min) && isNum(d.max) && isNum(d.step) && (d.max - d.min) / d.step > 100) err(`${w}.step`, "gives more than 100 ticks; use a bigger step");
      if (d.marks !== undefined) need("marks", (v) => Array.isArray(v) && v.every(isNum), "a list of numbers");
      if (Array.isArray(d.marks) && isNum(d.min) && isNum(d.max))
        for (const m of d.marks) if (isNum(m) && (m < d.min || m > d.max)) err(`${w}.marks`, `mark ${m} is off the number line (${d.min} to ${d.max})`);
      break;
    case "bar_model":
      need("parts", (v) => Array.isArray(v) && v.length > 0 && v.every((p) => isNum(p) || isStr(p) || (isObj(p) && (isStr(p.label) || isNum(p.value)))), "a list of numbers or labels");
      break;
    case "fraction_bar":
      need("n", (v) => posInt(v) && (v as number) <= 24, "a whole number of parts, 1-24");
      need("shaded", (v) => isInt(v) && (v as number) >= 0, "a whole number of shaded parts");
      if (isInt(d.n) && isInt(d.shaded) && (d.shaded as number) > (d.n as number) * 3) err(`${w}.shaded`, "more than 3 whole bars is not supported");
      break;
    case "clock":
      need("h", (v) => isInt(v) && (v as number) >= 0 && (v as number) <= 23, "an hour 0-23");
      need("m", (v) => isInt(v) && (v as number) >= 0 && (v as number) <= 59, "minutes 0-59");
      break;
    case "array":
      need("rows", (v) => posInt(v) && (v as number) <= 20, "a whole number 1-20");
      need("cols", (v) => posInt(v) && (v as number) <= 20, "a whole number 1-20");
      break;
    case "coordinates":
      need("max", (v) => posInt(v) && (v as number) <= 20, "a whole number 1-20");
      if (d.min !== undefined) need("min", (v) => isInt(v) && (v as number) >= -20 && (v as number) <= 0, "a whole number -20 to 0");
      need("points", (v) => Array.isArray(v) && v.every((p) => Array.isArray(p) && p.length >= 2 && p.length <= 3 && isNum(p[0]) && isNum(p[1]) && (p[2] === undefined || isStr(p[2]))), "a list of [x, y, \"label\"]");
      if (Array.isArray(d.points) && isInt(d.max)) {
        const lo = isInt(d.min) ? (d.min as number) : 0;
        for (const p of d.points as unknown[][]) {
          if (isNum(p[0]) && isNum(p[1]) && (p[0] < lo || p[0] > (d.max as number) || p[1] < lo || p[1] > (d.max as number)))
            err(`${w}.points`, `point ${show(p)} is outside the grid (${lo} to ${d.max}); set "min" (e.g. ${-Math.ceil(Math.max(Math.abs(p[0]), Math.abs(p[1])))}) or "max" so every point shows`);
        }
      }
      break;
    case "angle":
      need("deg", (v) => isNum(v) && (v as number) > 0 && (v as number) < 360, "degrees between 0 and 360");
      break;
    case "polygon":
      need("sides", (v) => isInt(v) && (v as number) >= 3 && (v as number) <= 12, "a whole number 3-12");
      break;
    case "bar_chart":
      need("labels", (v) => isStrArr(v) && v.length > 0, "a list of strings");
      need("values", (v) => Array.isArray(v) && v.every((x) => isNum(x) && x >= 0), "a list of numbers 0 or more");
      need("step", (v) => isNum(v) && (v as number) > 0, "a positive number");
      if (Array.isArray(d.labels) && Array.isArray(d.values) && d.labels.length !== d.values.length)
        err(`${w}.values`, `has ${d.values.length} values but ${d.labels.length} labels`);
      break;
  }
}
