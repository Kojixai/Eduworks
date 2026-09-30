import { beforeEach, describe, expect, it } from "vitest";
import { SqliteStore } from "../src/lib/db/sqlite";
import {
  answerText,
  auditRow,
  coverageTone,
  csvEscape,
  editQuestion,
  hrefWith,
  isExportable,
  mailingList,
  pagedRows,
  parseAnswerLines,
  setLinkReview,
  setQuestionReview,
  toCsv,
  writeAudit,
  type RedemptionRow,
} from "../src/lib/admin";

describe("csv", () => {
  it("escapes quotes, commas and newlines", () => {
    expect(csvEscape("plain")).toBe("plain");
    expect(csvEscape('say "hi"')).toBe('"say ""hi"""');
    expect(csvEscape("a,b")).toBe('"a,b"');
    expect(csvEscape("line1\nline2")).toBe('"line1\nline2"');
    expect(csvEscape("x\r\ny")).toBe('"x\r\ny"');
    expect(csvEscape(" padded ")).toBe('" padded "');
  });
  it("renders null/undefined as empty and numbers as-is", () => {
    expect(csvEscape(null)).toBe("");
    expect(csvEscape(undefined)).toBe("");
    expect(csvEscape(0)).toBe("0");
    expect(csvEscape(-3.5)).toBe("-3.5");
  });
  it("neutralises spreadsheet formulas", () => {
    expect(csvEscape("=SUM(A1)")).toBe("'=SUM(A1)");
    expect(csvEscape("@cmd")).toBe("'@cmd");
    expect(csvEscape("+1+2")).toBe("'+1+2");
    expect(csvEscape("-2")).toBe("-2");
  });
  it("serialises objects as JSON and builds whole documents", () => {
    expect(csvEscape({ a: 1 })).toBe('"{""a"":1}"');
    const out = toCsv([
      { id: 1, t: "a,b" },
      { id: 2, t: null },
    ]);
    expect(out).toBe('id,t\r\n1,"a,b"\r\n2,\r\n');
    expect(toCsv([], ["x", "y"])).toBe("x,y\r\n");
  });
});

describe("mailing list", () => {
  const base = { consent_timestamp: null, created_at: "2026-01-01T00:00:00Z" };
  const rows: RedemptionRow[] = [
    { ...base, parent_name: "Ann", email: "ann@example.com", marketing_opt_in: 1, consent_timestamp: "2026-02-01T00:00:00Z", book_title: "Maths Y6" },
    { ...base, parent_name: "Ann B", email: " ANN@example.com ", marketing_opt_in: 1, consent_timestamp: "2026-03-01T00:00:00Z", book_title: "English Y6" },
    { ...base, parent_name: "Bob", email: "bob@example.com", marketing_opt_in: 0, book_title: "Maths Y6" },
    { ...base, parent_name: "Cat", email: "cat@example.com", marketing_opt_in: true, consent_timestamp: "2026-04-01T00:00:00Z", book_title: "Maths Y5" },
  ];
  it("keeps only opted-in rows", () => {
    const list = mailingList(rows);
    expect(list.map((r) => r.email)).toEqual(["ann@example.com", "cat@example.com"]);
    expect(list.find((r) => r.email === "bob@example.com")).toBeUndefined();
  });
  it("dedupes by email case-insensitively, keeping latest consent and all books", () => {
    const ann = mailingList(rows).find((r) => r.email === "ann@example.com")!;
    expect(ann.name).toBe("Ann B");
    expect(ann.consent_timestamp).toBe("2026-03-01T00:00:00Z");
    expect(ann.book).toBe("Maths Y6; English Y6");
    expect(Object.keys(ann).sort()).toEqual(["book", "consent_timestamp", "email", "name"]);
  });
  it("returns an empty list when nobody opted in", () => {
    expect(mailingList([rows[2]])).toEqual([]);
  });
});

describe("coverage shading", () => {
  it("uses 80/50 thresholds", () => {
    expect(coverageTone(100)).toBe("success");
    expect(coverageTone(80)).toBe("success");
    expect(coverageTone(79)).toBe("warning");
    expect(coverageTone(50)).toBe("warning");
    expect(coverageTone(49)).toBe("danger");
    expect(coverageTone(0)).toBe("danger");
  });
});

describe("small helpers", () => {
  it("parses answer lines", () => {
    expect(parseAnswerLines(" 12 \r\n\n0.5\n  ")).toEqual(["12", "0.5"]);
  });
  it("builds hrefs keeping params", () => {
    expect(hrefWith("/admin/questions", { a: "1", page: "3", empty: "" }, { page: 4, b: "x" })).toBe("/admin/questions?a=1&page=4&b=x");
    expect(hrefWith("/p", { page: "2" }, { page: undefined })).toBe("/p");
  });
  it("only exports content tables, redemptions and the mailing list", () => {
    expect(isExportable("questions")).toBe(true);
    expect(isExportable("redemptions")).toBe(true);
    expect(isExportable("mailing_list")).toBe(true);
    expect(isExportable("parents")).toBe(false);
    expect(isExportable("auth_sessions")).toBe(false);
    expect(isExportable("admin_audit")).toBe(false);
  });
  it("formats answers per question type", () => {
    const opts = [
      { text: "A", is_correct: 0, side: "L", match_key: "1" },
      { text: "B", is_correct: 1, side: "R", match_key: "1" },
    ];
    expect(answerText("mcq", opts, [])).toBe("B");
    expect(answerText("matching", opts, [])).toBe("A → B");
    expect(answerText("numeric", [], [{ part: "main", answer: "42" }])).toBe("42");
    expect(answerText("self_mark", [], [], ["Any sensible answer"])).toBe("Any sensible answer");
  });
  it("builds audit rows with JSON payloads", () => {
    const r = auditRow({ actor: "a@x", action: "approve", entity: "questions", entityId: "q1", before: { s: 1 } }, new Date("2026-01-01T00:00:00Z"));
    expect(r).toMatchObject({ actor: "a@x", action: "approve", entity: "questions", entity_id: "q1", before_json: '{"s":1}', after_json: null, created_at: "2026-01-01T00:00:00.000Z" });
    expect(r.id).toMatch(/[0-9a-f-]{36}/);
  });
});

describe("audited review writes (in-memory SQLite)", () => {
  let store: SqliteStore;
  beforeEach(async () => {
    store = new SqliteStore(":memory:");
    await store.migrate();
    await store.insert("questions", {
      id: "q1",
      quiz_kind: "derived",
      qtype: "numeric",
      prompt_text: "What is 6 x 7?",
      marks: 1,
      review_status: "needs_review",
    });
    await store.insert("accepted_answers", { id: "a1", question_id: "q1", part: "main", answer: "41", kind: "numeric" });
  });

  it("writeAudit inserts a row", async () => {
    await writeAudit(store, { actor: "admin@example.com", action: "test", entity: "questions", entityId: "q1", before: null, after: { ok: true } });
    const rows = await store.select<{ actor: string; after_json: string }>("admin_audit");
    expect(rows).toHaveLength(1);
    expect(rows[0].actor).toBe("admin@example.com");
    expect(JSON.parse(rows[0].after_json)).toEqual({ ok: true });
  });

  it("approving sets auto_ok + reviewed_at and writes before/after audit", async () => {
    expect(await setQuestionReview(store, "admin@example.com", "q1", "auto_ok")).toBe(true);
    const q = await store.first<{ review_status: string; reviewed_at: string | null }>("questions", { where: { id: "q1" } });
    expect(q?.review_status).toBe("auto_ok");
    expect(q?.reviewed_at).toBeTruthy();
    const audit = await store.select<{ action: string; entity: string; entity_id: string; before_json: string; after_json: string }>("admin_audit");
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ action: "approve", entity: "questions", entity_id: "q1" });
    expect(JSON.parse(audit[0].before_json).review_status).toBe("needs_review");
    expect(JSON.parse(audit[0].after_json).review_status).toBe("auto_ok");
  });

  it("rejecting never deletes the question", async () => {
    await setQuestionReview(store, "admin@example.com", "q1", "rejected", "wrong answer");
    const q = await store.first<{ review_status: string; review_notes: string }>("questions", { where: { id: "q1" } });
    expect(q).toMatchObject({ review_status: "rejected", review_notes: "wrong answer" });
    expect(await store.count("questions")).toBe(1);
  });

  it("returns false for a missing question without auditing", async () => {
    expect(await setQuestionReview(store, "a", "nope", "auto_ok")).toBe(false);
    expect(await store.count("admin_audit")).toBe(0);
  });

  it("edits fields and accepted answers with one audit row", async () => {
    const err = await editQuestion(store, "admin@example.com", "q1", { prompt_text: "What is 6 × 7?", explanation: "6 lots of 7", marks: 2, qtype: "numeric", review_notes: null, answers: ["42", "forty-two"] });
    expect(err).toBeNull();
    const q = await store.first<{ prompt_text: string; marks: number; explanation: string }>("questions", { where: { id: "q1" } });
    expect(q).toMatchObject({ prompt_text: "What is 6 × 7?", marks: 2, explanation: "6 lots of 7" });
    const answers = await store.select<{ answer: string; kind: string }>("accepted_answers", { where: { question_id: "q1" } });
    expect(answers.map((a) => a.answer).sort()).toEqual(["42", "forty-two"]);
    expect(answers.every((a) => a.kind === "numeric")).toBe(true);
    const audit = await store.select<{ action: string; before_json: string; after_json: string }>("admin_audit");
    expect(audit).toHaveLength(1);
    expect(JSON.parse(audit[0].before_json).accepted_answers).toEqual(["41"]);
    expect(JSON.parse(audit[0].after_json).accepted_answers).toEqual(["42", "forty-two"]);
  });

  it("rejects invalid edits", async () => {
    expect(await editQuestion(store, "a", "q1", { prompt_text: " ", explanation: null, marks: 1, qtype: "numeric", review_notes: null })).toMatch(/Prompt/);
    expect(await editQuestion(store, "a", "q1", { prompt_text: "x", explanation: null, marks: 1.5, qtype: "numeric", review_notes: null })).toMatch(/Marks/);
    expect(await editQuestion(store, "a", "q1", { prompt_text: "x", explanation: null, marks: 1, qtype: "essay", review_notes: null })).toMatch(/type/);
    expect(await store.count("admin_audit")).toBe(0);
  });

  it("approves statement links with an audit row", async () => {
    await store.insert("unit_statement_links", { unit_id: "u1", statement_id: "s1", method: "reasoned", confidence: 0.6, review_status: "needs_review" });
    expect(await setLinkReview(store, "admin@example.com", "unit_statement_links", "u1", "s1", "auto_ok")).toBe(true);
    const l = await store.first<{ review_status: string }>("unit_statement_links", { where: { unit_id: "u1", statement_id: "s1" } });
    expect(l?.review_status).toBe("auto_ok");
    const audit = await store.first<{ entity: string; entity_id: string }>("admin_audit");
    expect(audit).toMatchObject({ entity: "unit_statement_links", entity_id: "u1|s1" });
  });

  it("pages rows in primary-key order", async () => {
    await store.insert("dataset_stats", [1, 2, 3, 4, 5].map((i) => ({ key: `k${i}`, value: String(i), computed_at: "x" })));
    const pages: number[] = [];
    for await (const p of pagedRows(store, "dataset_stats", {}, 2)) pages.push(p.length);
    expect(pages).toEqual([2, 2, 1]);
  });
});
