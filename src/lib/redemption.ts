/**
 * Book-code redemption: validation, access rules and account creation.
 * Rules (docs/INKWORKS_MERGE_BRIEF.txt):
 *  - Accounts are for adults (18+), or students 13+ on KS3/KS4 books only. Children under 13 are profiles, never accounts.
 *  - Access codes are stored as a peppered hash (demo codes excepted); per-title and per-copy codes both work.
 *  - The order number is required by default (ORDER_NUMBER=optional|off to relax), format-checked only, stored as a keyed hash,
 *    cleared when access ends, and one order unlocks a book on at most 3 accounts.
 *  - Mailing list is a separate, unticked, adult-only choice; access never depends on it.
 *  - Redeeming is rate limited: 5 failures an hour per account or 20 per IP, then a 15-minute cool-down.
 */
import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import type { DataStore } from "./db/store";
import { ACCESS_MONTHS, MAILING_WORDING, MAILING_WORDING_VERSION, MAX_ACCOUNTS_PER_ORDER, ORDER_MODE } from "@/practice/config";
import { isValidOrderNumber, normaliseCode, normaliseOrderNumber } from "@/practice/codes";
import { hashCode, hashIp, hashOrder } from "@/practice/hash";
import { demoCodesAllowed } from "@/practice/importer";
import { REDEEM_MESSAGES, type RedeemFailure } from "@/practice/redeemMessages";
import { addMonths } from "@/practice/mastery";
import { studentMayUnlock } from "@/practice/accounts";

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
export const normaliseEmail = (e: string) => e.trim().toLowerCase();

export interface RedemptionInput {
  code: string;
  parentName: string;
  email: string;
  /** "" when not given. */
  orderNumber: string;
  password: string;
  acceptTerms: boolean;
  /** Parent: "I am 18 or over and a parent, guardian or teacher". Student: "I am 13 or over". */
  ageConfirmed: boolean;
  accountType?: "parent" | "student";
  /** Students only: their year group id (used for their own learner profile). */
  yearGroupId?: string;
  marketingOptIn: boolean;
}

export type FieldErrors = Partial<Record<keyof RedemptionInput | "form", string>>;

export interface RedeemContext {
  now?: Date;
  ip?: string;
  pepper?: string;
  accessMonths?: number;
  orderMode?: "optional" | "required" | "off";
}

export function pepper(ctx?: RedeemContext): string {
  const p = ctx?.pepper ?? process.env.CODE_PEPPER;
  if (p) return p;
  if (process.env.NODE_ENV === "production") throw new Error("CODE_PEPPER is not set");
  return "dev-only-pepper";
}

export function validateRedemption(input: RedemptionInput, orderMode: "optional" | "required" | "off" = ORDER_MODE): FieldErrors {
  const e: FieldErrors = {};
  const student = input.accountType === "student";
  if (!normaliseCode(input.code)) e.code = "Enter the code printed in your book.";
  if (input.parentName.trim().length < 2) e.parentName = student ? "Enter your first name." : "Enter your name.";
  if (!EMAIL_RE.test(normaliseEmail(input.email))) e.email = "Enter a valid email address.";
  const o = input.orderNumber.trim();
  if (orderMode === "required" && !o) e.orderNumber = REDEEM_MESSAGES.missing_order.error;
  else if (o && orderMode !== "off" && !isValidOrderNumber(o)) e.orderNumber = REDEEM_MESSAGES.bad_order.error;
  if (input.password.length < 8) e.password = "Use at least 8 characters.";
  if (!input.ageConfirmed) e.ageConfirmed = student ? "Please confirm you are 13 or over." : "Please confirm you are 18 or over and a parent, guardian or teacher.";
  if (!input.acceptTerms) e.acceptTerms = "Please accept the terms and privacy notice to continue.";
  if (student && !input.yearGroupId) e.yearGroupId = "Choose your year group.";
  return e;
}

export interface RedeemResult {
  ok: boolean;
  errors?: FieldErrors;
  parentId?: string;
  bookId?: string;
  expiresAt?: string;
  existingAccount?: boolean;
  renewed?: boolean;
  failure?: RedeemFailure;
}

const id = () => crypto.randomUUID();

async function logAttempt(store: DataStore, emailHash: string, ipHash: string, ok: boolean, nowIso: string) {
  await store.insert("redeem_attempts", { id: id(), email_hash: emailHash, ip_hash: ipHash, ok: ok ? 1 : 0, created_at: nowIso });
}

function fail(f: RedeemFailure): RedeemResult {
  const m = REDEEM_MESSAGES[f];
  return { ok: false, failure: f, errors: { [m.field === "orderNumber" ? "orderNumber" : m.field === "accountType" ? "form" : "code"]: m.error } as FieldErrors };
}

/** Redeem a code. New email creates the account; an existing email must give its password and gains (or renews) the book. */
export async function redeemCode(store: DataStore, input: RedemptionInput, ctx: RedeemContext = {}): Promise<RedeemResult> {
  const now = ctx.now ?? new Date();
  const nowIso = now.toISOString();
  const orderMode = ctx.orderMode ?? ORDER_MODE;
  const months = ctx.accessMonths ?? ACCESS_MONTHS;
  const errors = validateRedemption(input, orderMode);
  if (Object.keys(errors).length) return { ok: false, errors };

  const pp = pepper(ctx);
  const email = normaliseEmail(input.email);
  const emailHash = hashIp(email, pp);
  const ipHash = hashIp(ctx.ip ?? "unknown", pp);
  const student = input.accountType === "student";

  // order numbers are deleted when access ends: do it on every call so it always happens
  await store.update("redemptions", { expires_at: { op: "lte", value: nowIso } }, { order_hash: null });

  // rate limit
  const hourAgo = new Date(now.getTime() - 3600_000).toISOString();
  const quarterAgo = new Date(now.getTime() - 900_000).toISOString();
  const recent = (await store.select<{ email_hash: string; ip_hash: string; created_at: string }>("redeem_attempts", { where: { ok: 0, created_at: { op: "gt", value: hourAgo } } }))
    .filter((a) => a.email_hash === emailHash || a.ip_hash === ipHash);
  const byEmail = recent.filter((a) => a.email_hash === emailHash).length;
  const byIp = recent.filter((a) => a.ip_hash === ipHash).length;
  const lastFail = recent.reduce((m, a) => (a.created_at > m ? a.created_at : m), "");
  if ((byIp >= 20 || byEmail >= 5) && lastFail > quarterAgo) return fail("rate_limited");

  const bad = async (f: RedeemFailure) => { await logAttempt(store, emailHash, ipHash, false, nowIso); return fail(f); };

  // find the code: hashed, or a demo code where demo codes are allowed
  const norm = normaliseCode(input.code);
  type CodeRow = { id: string; book_id: string; active: number; kind: string; is_demo: number; code: string | null; redeemed_by: string | null; redeemed_at: string | null };
  let code: CodeRow | undefined = await store.first<CodeRow>("book_codes", { where: { code_hash: hashCode(norm, pp) } });
  if (!code && demoCodesAllowed()) code = (await store.select<CodeRow>("book_codes", { where: { is_demo: 1 } })).find((c) => normaliseCode(c.code ?? "") === norm);
  if (!code || !code.active) return bad("bad_code");

  const book = await store.first<{ id: string; key_stage_id: string | null }>("books", { where: { id: code.book_id } });
  if (student && !studentMayUnlock(book?.key_stage_id?.toUpperCase())) return bad("parent_only");

  let parent = await store.first<{ id: string; password_hash: string }>("parents", { where: { email } });
  const orderHash = input.orderNumber.trim() && orderMode !== "off" ? hashOrder(normaliseOrderNumber(input.orderNumber), code.book_id, pp) : null;

  // a per-copy code works for one account only, for good
  if (code.kind === "copy" && code.redeemed_at && code.redeemed_by !== (parent?.id ?? null)) return bad("bad_code");

  if (orderHash) {
    const uses = (await store.select<{ parent_id: string }>("redemptions", { where: { order_hash: orderHash, book_id: code.book_id } })).filter((r) => r.parent_id !== parent?.id).length;
    if (uses >= MAX_ACCOUNTS_PER_ORDER) return bad("order_overused");
  }

  let existingAccount = false;
  if (parent) {
    existingAccount = true;
    if (!(await bcrypt.compare(input.password, parent.password_hash)))
      return bad("bad_code").then((r) => ({ ...r, failure: undefined, errors: { email: "An account with this email already exists. Enter its password to add this book, or log in." } }));
  } else {
    parent = { id: id(), password_hash: await bcrypt.hash(input.password, 10) };
    await store.insert("parents", {
      id: parent.id, name: input.parentName.trim(), email, password_hash: parent.password_hash, is_admin: 0, created_at: nowIso,
      account_type: student ? "student" : "parent", age_confirmed_at: nowIso,
    });
    if (student)
      await store.insert("students", { id: id(), parent_id: parent.id, first_name: input.parentName.trim().split(/\s+/)[0], year_group_id: input.yearGroupId ?? null, avatar: "sky", created_at: nowIso });
  }

  const expiresAt = addMonths(now, months).toISOString();
  const marketing = !student && input.marketingOptIn;
  const prior = await store.first<{ id: string; expires_at: string }>("redemptions", { where: { parent_id: parent.id, book_id: code.book_id } });
  let renewed = false;
  if (prior) {
    if (prior.expires_at > nowIso) { await logAttempt(store, emailHash, ipHash, true, nowIso); return { ok: true, parentId: parent.id, bookId: code.book_id, expiresAt: prior.expires_at, existingAccount }; }
    await store.update("redemptions", { id: prior.id }, { book_code_id: code.id, order_hash: orderHash, expires_at: expiresAt });
    renewed = true;
  } else {
    await store.insert("redemptions", {
      id: id(), book_code_id: code.id, book_id: code.book_id, parent_id: parent.id, parent_name: input.parentName.trim(), email, order_hash: orderHash,
      marketing_opt_in: marketing ? 1 : 0, terms_accepted_at: nowIso, consent_timestamp: marketing ? nowIso : null, expires_at: expiresAt, created_at: nowIso,
    });
  }
  if (code.kind === "copy" && !code.redeemed_at) await store.update("book_codes", { id: code.id }, { redeemed_by: parent.id, redeemed_at: nowIso });
  if (!student && !existingAccount)
    await store.insert("mailing_consent", { id: id(), parent_id: parent.id, consented: marketing ? 1 : 0, wording_version: MAILING_WORDING_VERSION, wording: MAILING_WORDING, source: "redeem", created_at: nowIso });
  await logAttempt(store, emailHash, ipHash, true, nowIso);
  return { ok: true, parentId: parent.id, bookId: code.book_id, expiresAt, existingAccount, renewed };
}
