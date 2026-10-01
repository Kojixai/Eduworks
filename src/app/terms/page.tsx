import type { Metadata } from "next";
import { accessLength, CODE_MODE, MAX_ACCOUNTS_PER_ORDER, ORDER_MODE, SUPPORT_EMAIL } from "@/practice/config";

export const metadata: Metadata = { title: "Terms of use" };

const LEGAL_POINTS = [
  "Children's contracts: the account is a contract with the adult (or the 13+ student). Confirm the terms work for a 13 to 17 year old account holder, since contract law on minors is untouched by UK GDPR Art 8(3).",
  `Access length: currently ${accessLength()} from the day the code is entered. CGP gives 3 years from first use. Confirm the length and say what happens to progress when access ends.`,
  "Amazon selling policy: the site must not divert Amazon customers to buy elsewhere. Keep it free of checkout, discount codes and anything asking buyers to do something on Amazon. 'Buy' links, if ever added, go only to Amazon listings.",
  "Codes: confirm the wording on shared or misused codes, per-copy codes bought second-hand, and our right to withdraw access.",
  "Liability, availability, changes to the service, governing law (England and Wales), consumer rights for free digital content, and contact details.",
  "Accessibility: the Equality Act 2010 duty to make reasonable adjustments applies to free services too. Add an accessibility statement with a contact route.",
];

export default function Terms() {
  return (
    <div className="pr"><div className="wrap wrap-narrow page stack">
      <div className="legal-flag" role="note">
        <p style={{ margin: "0 0 8px" }}>
          <strong>DRAFT, NOT YET CHECKED BY A LAWYER.</strong> These terms must be checked and completed before the site goes live. Points to settle:
        </p>
        <ol className="legal-points">
          {LEGAL_POINTS.map((p) => <li key={p}>{p}</li>)}
        </ol>
      </div>
      <h1>Terms of use</h1>
      <h2>The service</h2>
      <p>Inkworks Practice gives free online practice questions to people who have an Inkworks Press book. Each book code unlocks practice for that book for {accessLength()} from the day it is entered.</p>
      <h2>Accounts</h2>
      <p>An account can be created by a parent, guardian or teacher aged 18 or over, who is responsible for the children using it, or by a student aged 13 or over for KS3 and GCSE books. Keep your password private. The parent PIN only stops children opening the parent area by accident.</p>
      <h2>Book codes</h2>
      <p>
        {CODE_MODE === "copy"
          ? "Each book has its own code, which can be used on one account."
          : "A code is printed inside each book."}{" "}
        {ORDER_MODE !== "off" &&
          `You may be asked for the Amazon order number for the book${ORDER_MODE === "optional" ? " (this is optional)" : ""}. One order number can unlock a book on up to ${MAX_ACCOUNTS_PER_ORDER} accounts. `}
        We may remove access if codes are shared or misused. If you have a problem with a code, email {SUPPORT_EMAIL}.
      </p>
      <h2>Availability</h2>
      <p>[Service availability, changes to the service, liability, governing law (England and Wales) and contact details to be added once checked by a lawyer.]</p>
    </div></div>
  );
}
