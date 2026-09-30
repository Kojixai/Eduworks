/**
 * Book-code redemption: validation and account creation.
 * One redeemable code per book title (printed in the book). A parent redeems it with their
 * Amazon order number; each redemption is stored with consent details.
 */
import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import type { DataStore } from "./db/store";

export const AMAZON_ORDER_RE = /^\d{3}-\d{7}-\d{7}$/;
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export interface RedemptionInput {
  code: string;
  parentName: string;
  email: string;
  amazonOrderNumber: string;
  password: string;
  acceptTerms: boolean;
  marketingOptIn: boolean;
}

export type FieldErrors = Partial<Record<keyof RedemptionInput | "form", string>>;

export const normaliseCode = (c: string) => c.trim().toUpperCase().replace(/\s+/g, "");
export const normaliseEmail = (e: string) => e.trim().toLowerCase();
/** Accepts the order number with spaces or without dashes and returns the canonical 000-0000000-0000000 form. */
export function normaliseOrder(o: string): string {
  const digits = o.replace(/\D/g, "");
  if (digits.length !== 17) return o.trim();
  return `${digits.slice(0, 3)}-${digits.slice(3, 10)}-${digits.slice(10)}`;
}

export function validateRedemption(input: RedemptionInput): FieldErrors {
  const e: FieldErrors = {};
  if (!normaliseCode(input.code)) e.code = "Enter the code printed in your book.";
  if (input.parentName.trim().length < 2) e.parentName = "Enter your name.";
  if (!EMAIL_RE.test(normaliseEmail(input.email))) e.email = "Enter a valid email address.";
  if (!AMAZON_ORDER_RE.test(normaliseOrder(input.amazonOrderNumber)))
    e.amazonOrderNumber = "Amazon order numbers look like 123-1234567-1234567.";
  if (input.password.length < 8) e.password = "Use at least 8 characters.";
  if (!input.acceptTerms) e.acceptTerms = "Please accept the terms and privacy notice to continue.";
  return e;
}

export interface RedeemResult {
  ok: boolean;
  errors?: FieldErrors;
  parentId?: string;
  bookId?: string;
  existingAccount?: boolean;
}

/**
 * Redeem a code. New email -> creates the parent account. Existing email -> the password must
 * match, and the book is added to that account (a family can own several books).
 */
export async function redeemCode(store: DataStore, input: RedemptionInput, nowIso = new Date().toISOString()): Promise<RedeemResult> {
  const errors = validateRedemption(input);
  if (Object.keys(errors).length) return { ok: false, errors };
  const code = await store.first<{ id: string; book_id: string; active: number }>("book_codes", { where: { code: normaliseCode(input.code) } });
  if (!code || !code.active) return { ok: false, errors: { code: "We don't recognise that code. Check the inside cover of your book." } };

  const email = normaliseEmail(input.email);
  let parent = await store.first<{ id: string; password_hash: string }>("parents", { where: { email } });
  let existingAccount = false;
  if (parent) {
    existingAccount = true;
    if (!(await bcrypt.compare(input.password, parent.password_hash)))
      return { ok: false, errors: { email: "An account with this email already exists. Enter its password to add this book, or log in." } };
    const dup = await store.first("redemptions", { where: { parent_id: parent.id, book_id: code.book_id } });
    if (dup) return { ok: true, parentId: parent.id, bookId: code.book_id, existingAccount };
  } else {
    parent = { id: crypto.randomUUID(), password_hash: await bcrypt.hash(input.password, 10) };
    await store.insert("parents", { id: parent.id, name: input.parentName.trim(), email, password_hash: parent.password_hash, is_admin: 0, created_at: nowIso });
  }
  await store.insert("redemptions", {
    id: crypto.randomUUID(),
    book_code_id: code.id,
    book_id: code.book_id,
    parent_id: parent.id,
    parent_name: input.parentName.trim(),
    email,
    amazon_order_number: normaliseOrder(input.amazonOrderNumber),
    marketing_opt_in: input.marketingOptIn ? 1 : 0,
    terms_accepted_at: nowIso,
    consent_timestamp: input.marketingOptIn ? nowIso : null,
    created_at: nowIso,
  });
  return { ok: true, parentId: parent.id, bookId: code.book_id, existingAccount };
}
