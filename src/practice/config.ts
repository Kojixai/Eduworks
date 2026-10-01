// Site-wide settings. Read from the server .env (restart the app after changing).

/** How long one book code unlocks a book for, in months. Default 6. (CGP gives 3 years.) */
export const ACCESS_MONTHS = clampInt(process.env.ACCESS_MONTHS, 6, 1, 120);

/**
 * Which kind of code is printed in the books.
 *  "title": one code per title (or per print run), shared by every copy. Cheap to print.
 *  "copy":  a unique code in every copy, each usable by one account (the CGP model). Needs variable-data printing.
 * The database and the redeem logic accept both kinds at the same time; this setting decides what the code
 * generator makes by default and how the redeem page describes the code.
 */
export type CodeMode = "title" | "copy";
export const CODE_MODE: CodeMode = process.env.CODE_MODE === "copy" ? "copy" : "title";

/**
 * The Amazon order number.
 *  "optional": asked for, but the adult can leave it blank (default with per-title codes).
 *  "required": must be given (stronger brake on a shared per-title code being passed around).
 *  "off":      not asked for at all (default with per-copy codes, which control sharing on their own).
 * Whatever the setting, only the format is checked (3-7-7 digits). We never check it with Amazon, only a salted
 * hash is stored, and the hash is deleted when that book's access ends.
 */
export type OrderMode = "optional" | "required" | "off";
const om = process.env.ORDER_NUMBER;
export const ORDER_MODE: OrderMode = om === "required" || om === "optional" || om === "off" ? om : CODE_MODE === "copy" ? "off" : "optional";

/** One order number can unlock the same book on at most this many accounts (a family with two adults, a gift). */
export const MAX_ACCOUNTS_PER_ORDER = 3;

export const SUPPORT_EMAIL = "support@inkworkspress.co.uk"; // TODO(Tom): confirm the real support address

export { MAILING_WORDING_VERSION, MAILING_WORDING, ORDER_WHY } from "./config-public";

export function accessLength(months = ACCESS_MONTHS): string {
  if (months % 12 === 0) return months === 12 ? "1 year" : `${months / 12} years`;
  return months === 1 ? "1 month" : `${months} months`;
}

function clampInt(v: string | undefined, dflt: number, min: number, max: number): number {
  const n = Number.parseInt(v ?? "", 10);
  return Number.isFinite(n) && n >= min && n <= max ? n : dflt;
}
