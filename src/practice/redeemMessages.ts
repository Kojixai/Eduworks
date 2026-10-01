// Messages shown when a code cannot be redeemed. Shared by the live server route and the demo store so both say
// exactly the same thing. A wrong code and an already-used per-copy code get the same message on purpose.
import { CODE_MODE, SUPPORT_EMAIL } from "./config";

export type RedeemFailure = "rate_limited" | "bad_order" | "missing_order" | "bad_code" | "order_overused" | "parent_only";

export const REDEEM_MESSAGES: Record<RedeemFailure, { error: string; field: string; status: number }> = {
  rate_limited: { error: "Too many tries. Please wait 15 minutes and try again.", field: "code", status: 429 },
  bad_order: { error: "Order numbers look like 203-1234567-1234567 (3, 7 and 7 digits).", field: "orderNumber", status: 400 },
  missing_order: { error: "Enter your order number.", field: "orderNumber", status: 400 },
  bad_code: {
    error:
      CODE_MODE === "copy"
        ? `That code does not match a book, or it has already been used on another account. Check the code inside the front cover. If you bought the book second-hand, email ${SUPPORT_EMAIL} and we will help.`
        : "That code does not match any of our books. Check the code inside the front cover and try again.",
    field: "code",
    status: 400,
  },
  order_overused: {
    error: `This order number has already been used for this book on several accounts. Please email ${SUPPORT_EMAIL} and we will sort it out.`,
    field: "orderNumber",
    status: 400,
  },
  parent_only: {
    error: "This book is for younger children, so a parent or guardian needs to create the account. Please ask them to enter the code.",
    field: "accountType",
    status: 400,
  },
};
