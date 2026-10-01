import { beforeEach, describe, expect, it } from "vitest";
import { SqliteStore } from "../src/lib/db/sqlite";
import { redeemCode, validateRedemption, type RedemptionInput } from "../src/lib/redemption";
import { importInkworks } from "../src/practice/importer";
import { hashCode, hashOrder } from "../src/practice/hash";
import { seedDemo } from "../scripts/seed-demo";

const PEPPER = "test-pepper";
const good: RedemptionInput = {
  code: "demo-y3maths",
  parentName: "Alex Parent",
  email: "Alex@Example.com ",
  orderNumber: "202-1234567-7654321",
  password: "longenough",
  acceptTerms: true,
  ageConfirmed: true,
  marketingOptIn: false,
};
const NOW = new Date("2026-01-01T10:00:00.000Z");
const ctx = (extra = {}) => ({ now: NOW, ip: "1.2.3.4", pepper: PEPPER, accessMonths: 6, orderMode: "optional" as const, ...extra });

let store: SqliteStore;
beforeEach(async () => {
  store = new SqliteStore(":memory:");
  await store.migrate();
  await importInkworks(store, { demoCodesActive: true });
  await seedDemo(store);
});

describe("validation", () => {
  it("accepts a complete form, with or without an order number", () => {
    expect(validateRedemption(good, "optional")).toEqual({});
    expect(validateRedemption({ ...good, orderNumber: "" }, "optional")).toEqual({});
  });
  it("checks the order number format (3-7-7) only when one is given", () => {
    expect(validateRedemption({ ...good, orderNumber: "12-1234567-1234567" }, "optional").orderNumber).toBeTruthy();
    expect(validateRedemption({ ...good, orderNumber: "20212345677654321" }, "optional").orderNumber).toBeUndefined();
    expect(validateRedemption({ ...good, orderNumber: "" }, "required").orderNumber).toBeTruthy();
    expect(validateRedemption({ ...good, orderNumber: "garbage" }, "off").orderNumber).toBeUndefined();
  });
  it("requires terms and age confirmation but never marketing consent", () => {
    expect(validateRedemption({ ...good, acceptTerms: false }).acceptTerms).toBeTruthy();
    expect(validateRedemption({ ...good, ageConfirmed: false }).ageConfirmed).toBeTruthy();
    expect(validateRedemption({ ...good, marketingOptIn: false })).toEqual({});
  });
  it("needs a year group for a student account", () => {
    expect(validateRedemption({ ...good, accountType: "student" }).yearGroupId).toBeTruthy();
  });
});

describe("redeemCode: accounts and access", () => {
  it("creates an adult account with expiry, no marketing consent by default, and a hashed order number", async () => {
    const r = await redeemCode(store, good, ctx());
    expect(r.ok).toBe(true);
    const red = await store.first<Record<string, unknown>>("redemptions", { where: { parent_id: r.parentId! } });
    expect(red).toMatchObject({ email: "alex@example.com", marketing_opt_in: 0, consent_timestamp: null, book_id: "y3maths", expires_at: "2026-07-01T10:00:00.000Z" });
    expect(red?.order_hash).toBe(hashOrder("202-1234567-7654321", "y3maths", PEPPER));
    expect(JSON.stringify(red)).not.toContain("1234567");
    const parent = await store.first<Record<string, unknown>>("parents", { where: { id: r.parentId! } });
    expect(parent).toMatchObject({ account_type: "parent" });
    expect(parent?.password_hash).not.toBe("longenough");
  });
  it("stores no order hash when none is given", async () => {
    const r = await redeemCode(store, { ...good, orderNumber: "" }, ctx());
    expect((await store.first<{ order_hash: string | null }>("redemptions", { where: { parent_id: r.parentId! } }))?.order_hash).toBeNull();
  });
  it("records mailing consent with its wording only when the adult opts in", async () => {
    const a = await redeemCode(store, { ...good, marketingOptIn: true }, ctx());
    expect(await store.first("mailing_consent", { where: { parent_id: a.parentId! } })).toMatchObject({ consented: 1, source: "redeem" });
    const red = await store.first<Record<string, unknown>>("redemptions", { where: { parent_id: a.parentId! } });
    expect(red).toMatchObject({ marketing_opt_in: 1, consent_timestamp: NOW.toISOString() });
    const b = await redeemCode(store, { ...good, email: "b@example.com" }, ctx());
    expect(await store.first("mailing_consent", { where: { parent_id: b.parentId! } })).toMatchObject({ consented: 0 });
  });
  it("lets a 13+ student unlock a KS3/KS4 book, makes their own profile and never records mailing consent", async () => {
    const r = await redeemCode(store, { ...good, code: "DEMO-KS3ENGLISH", accountType: "student", yearGroupId: "y8", marketingOptIn: true }, ctx());
    expect(r.ok).toBe(true);
    expect(await store.first("parents", { where: { id: r.parentId! } })).toMatchObject({ account_type: "student" });
    expect(await store.count("students", { parent_id: r.parentId! })).toBe(1);
    expect(await store.count("mailing_consent", { parent_id: r.parentId! })).toBe(0);
    expect(await store.first("redemptions", { where: { parent_id: r.parentId! } })).toMatchObject({ marketing_opt_in: 0 });
  });
  it("refuses a student on a KS1/KS2 book", async () => {
    const r = await redeemCode(store, { ...good, accountType: "student", yearGroupId: "y8" }, ctx());
    expect(r).toMatchObject({ ok: false, failure: "parent_only" });
  });
  it("rejects unknown and inactive codes with the same message", async () => {
    const a = await redeemCode(store, { ...good, code: "NOPE" }, ctx());
    await store.update("book_codes", { code: "DEMO-Y3MATHS" }, { active: 0 });
    const b = await redeemCode(store, good, ctx({ ip: "9.9.9.9" }));
    expect(a.errors?.code).toBeTruthy();
    expect(b.errors?.code).toBe(a.errors?.code);
  });
  it("adds a second book only with the right password, and is idempotent for the same book", async () => {
    const first = await redeemCode(store, good, ctx());
    const wrong = await redeemCode(store, { ...good, code: "DEMO-Y8MATHS", password: "wrongpassword" }, ctx());
    expect(wrong.ok).toBe(false);
    const second = await redeemCode(store, { ...good, code: "DEMO-Y8MATHS" }, ctx());
    expect(second).toMatchObject({ ok: true, parentId: first.parentId, existingAccount: true });
    await redeemCode(store, good, ctx());
    expect(await store.count("redemptions", { parent_id: first.parentId! })).toBe(2);
  });
  it("renews an expired book from the day of the new redemption", async () => {
    const r = await redeemCode(store, good, ctx());
    const later = new Date("2027-02-01T00:00:00.000Z");
    const again = await redeemCode(store, good, ctx({ now: later }));
    expect(again).toMatchObject({ ok: true, renewed: true });
    expect(await store.count("redemptions", { parent_id: r.parentId! })).toBe(1);
    expect(again.expiresAt).toBe("2027-08-01T00:00:00.000Z");
  });
});

describe("redeemCode: codes", () => {
  it("accepts a hashed real code and never stores it in plain text", async () => {
    await store.insert("book_codes", { id: "real1", book_id: "y8maths", code: null, code_hash: hashCode("INKABCDEFGH", PEPPER), kind: "title", active: 1, is_demo: 0, created_at: NOW.toISOString() });
    const r = await redeemCode(store, { ...good, code: "ink-abcd-efgh" }, ctx());
    expect(r).toMatchObject({ ok: true, bookId: "y8maths" });
    expect(JSON.stringify(await store.select("book_codes"))).not.toContain("INKABCDEFGH");
  });
  it("lets a per-copy code work for one account only, for good", async () => {
    await store.insert("book_codes", { id: "copy1", book_id: "y3maths", code: null, code_hash: hashCode("INKCOPY0001", PEPPER), kind: "copy", active: 1, is_demo: 0, created_at: NOW.toISOString() });
    const a = await redeemCode(store, { ...good, code: "INKCOPY0001" }, ctx());
    expect(a.ok).toBe(true);
    const b = await redeemCode(store, { ...good, email: "other@example.com", code: "INKCOPY0001" }, ctx());
    expect(b).toMatchObject({ ok: false, failure: "bad_code" });
    expect((await redeemCode(store, { ...good, code: "INKCOPY0001" }, ctx())).ok).toBe(true); // the owner can re-enter it
  });
  it("does not accept demo codes where they are not allowed", async () => {
    const prev = process.env.NODE_ENV;
    (process.env as Record<string, string>).NODE_ENV = "production";
    try {
      const r = await redeemCode(store, good, ctx());
      expect(r).toMatchObject({ ok: false, failure: "bad_code" });
    } finally {
      (process.env as Record<string, string>).NODE_ENV = prev;
    }
  });
});

describe("redeemCode: order numbers and rate limiting", () => {
  it("lets one order unlock a book on at most 3 accounts", async () => {
    for (const n of [1, 2, 3]) expect((await redeemCode(store, { ...good, email: `u${n}@example.com` }, ctx({ ip: `10.0.0.${n}` }))).ok).toBe(true);
    const fourth = await redeemCode(store, { ...good, email: "u4@example.com" }, ctx({ ip: "10.0.0.4" }));
    expect(fourth).toMatchObject({ ok: false, failure: "order_overused" });
  });
  it("deletes the order hash when access ends", async () => {
    const r = await redeemCode(store, good, ctx());
    await redeemCode(store, { ...good, email: "later@example.com", orderNumber: "" }, ctx({ now: new Date("2026-08-01T00:00:00.000Z") }));
    expect((await store.first<{ order_hash: string | null }>("redemptions", { where: { parent_id: r.parentId! } }))?.order_hash).toBeNull();
  });
  it("blocks an account after 5 wrong codes, then lets it try again after 15 minutes", async () => {
    for (let i = 0; i < 5; i++) await redeemCode(store, { ...good, code: `WRONG${i}` }, ctx());
    expect(await redeemCode(store, good, ctx())).toMatchObject({ ok: false, failure: "rate_limited" });
    const after = new Date(NOW.getTime() + 16 * 60_000);
    expect((await redeemCode(store, good, ctx({ now: after }))).ok).toBe(true);
  });
  it("blocks an IP address after 20 wrong tries across accounts", async () => {
    for (let i = 0; i < 20; i++) await redeemCode(store, { ...good, email: `x${i}@example.com`, code: `WRONG${i}` }, ctx());
    expect(await redeemCode(store, { ...good, email: "fresh@example.com" }, ctx())).toMatchObject({ failure: "rate_limited" });
  });
});
