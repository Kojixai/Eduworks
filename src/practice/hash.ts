import { createHash, createHmac } from "node:crypto";
import { normaliseCode, normaliseOrderNumber } from "./codes";

/** Salted SHA-256 of a normalised access code. Used by the redeem route and the code generator. */
export function hashCode(code: string, pepper: string): string {
  return createHash("sha256").update(`${pepper}:code:${normaliseCode(code)}`).digest("hex");
}

export function hashIp(ip: string, pepper: string): string {
  return createHash("sha256").update(`${pepper}:ip:${ip}`).digest("hex");
}

/**
 * Keyed (salted) hash of an order number, per book. The same order number for the same book always gives the
 * same hash, so we can limit how many accounts use it, but the number itself cannot be read back from the database.
 */
export function hashOrder(order: string, bookId: string, pepper: string): string {
  return createHmac("sha256", pepper).update(`order:${bookId}:${normaliseOrderNumber(order)}`).digest("hex");
}
