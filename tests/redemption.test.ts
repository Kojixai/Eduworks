import { beforeEach, describe, expect, it } from "vitest";
import { SqliteStore } from "../src/lib/db/sqlite";
import { redeemCode, validateRedemption, normaliseOrder, type RedemptionInput } from "../src/lib/redemption";
import { seedDemo } from "../scripts/seed-demo";

const good: RedemptionInput = {
  code: "demo-ks2-maths",
  parentName: "Alex Parent",
  email: "Alex@Example.com ",
  amazonOrderNumber: "202-1234567-7654321",
  password: "longenough",
  acceptTerms: true,
  marketingOptIn: false,
};

let store: SqliteStore;
beforeEach(async () => {
  store = new SqliteStore(":memory:");
  await store.migrate();
  await seedDemo(store);
});

describe("validation", () => {
  it("accepts a complete form", () => expect(validateRedemption(good)).toEqual({}));
  it("checks the Amazon order number format 3-7-7 digits", () => {
    expect(validateRedemption({ ...good, amazonOrderNumber: "12-1234567-1234567" }).amazonOrderNumber).toBeTruthy();
    expect(validateRedemption({ ...good, amazonOrderNumber: "abc" }).amazonOrderNumber).toBeTruthy();
    expect(normaliseOrder("202 1234567 7654321")).toBe("202-1234567-7654321");
    expect(validateRedemption({ ...good, amazonOrderNumber: "20212345677654321" }).amazonOrderNumber).toBeUndefined();
  });
  it("requires terms but never requires marketing consent", () => {
    expect(validateRedemption({ ...good, acceptTerms: false }).acceptTerms).toBeTruthy();
    expect(validateRedemption({ ...good, marketingOptIn: false })).toEqual({});
  });
  it("checks email and password", () => {
    expect(validateRedemption({ ...good, email: "nope" }).email).toBeTruthy();
    expect(validateRedemption({ ...good, password: "short" }).password).toBeTruthy();
  });
});

describe("redeemCode", () => {
  it("creates a parent and a redemption without marketing consent by default", async () => {
    const r = await redeemCode(store, good, "2026-01-01T10:00:00.000Z");
    expect(r.ok).toBe(true);
    const red = await store.first<Record<string, unknown>>("redemptions", { where: { parent_id: r.parentId! } });
    expect(red).toMatchObject({ email: "alex@example.com", amazon_order_number: "202-1234567-7654321", marketing_opt_in: 0, consent_timestamp: null, book_id: "book-ks2-maths-y6" });
    const parent = await store.first<Record<string, unknown>>("parents", { where: { id: r.parentId! } });
    expect(parent?.password_hash).not.toBe("longenough");
  });
  it("stores the consent timestamp only when the parent opts in", async () => {
    const r = await redeemCode(store, { ...good, marketingOptIn: true }, "2026-02-02T09:00:00.000Z");
    const red = await store.first<Record<string, unknown>>("redemptions", { where: { parent_id: r.parentId! } });
    expect(red).toMatchObject({ marketing_opt_in: 1, consent_timestamp: "2026-02-02T09:00:00.000Z" });
  });
  it("rejects unknown and inactive codes", async () => {
    expect((await redeemCode(store, { ...good, code: "NOPE" })).errors?.code).toBeTruthy();
    await store.update("book_codes", { code: "DEMO-KS2-MATHS" }, { active: 0 });
    expect((await redeemCode(store, good)).ok).toBe(false);
  });
  it("adds a second book to an existing account only with the right password", async () => {
    const first = await redeemCode(store, good);
    const wrong = await redeemCode(store, { ...good, code: "DEMO-Y4-TABLES", password: "wrongpassword" });
    expect(wrong.ok).toBe(false);
    const second = await redeemCode(store, { ...good, code: "DEMO-Y4-TABLES" });
    expect(second).toMatchObject({ ok: true, parentId: first.parentId, existingAccount: true });
    expect(await store.count("redemptions", { parent_id: first.parentId! })).toBe(2);
  });
  it("is idempotent for the same book", async () => {
    const a = await redeemCode(store, good);
    await redeemCode(store, good);
    expect(await store.count("redemptions", { parent_id: a.parentId! })).toBe(1);
  });
});
