import type { Metadata } from "next";
import { ACCESS_MONTHS, accessLength, ORDER_MODE, SUPPORT_EMAIL } from "@/practice/config";

export const metadata: Metadata = { title: "Privacy notice" };

// DRAFT. Every point in the yellow box must be settled by a lawyer (and in the DPIA) before launch.
const LEGAL_POINTS = [
  "Complete a Data Protection Impact Assessment (DPIA) before launch. The ICO treats an online service likely to be used by children as high-risk processing, so a DPIA is mandatory.",
  "Confirm the lawful bases: contract with the account holder for the account and progress tracking (UK GDPR Art 6(1)(b)); legitimate interests for security, rate limiting and the order-number check (needs a short balancing test); consent for the mailing list only.",
  "Children under 13 cannot consent for themselves (UK GDPR Art 8). Confirm that adult-only sign-up with a tick-box declaration (18+, parent, guardian or teacher) counts as 'reasonable efforts' for a low-risk service, and that 13+ self-registration for KS3 and GCSE books only is acceptable.",
  "Children's Code standard 11 (parental controls): children are told on their home page that their grown-up can see their scores. Confirm the wording suits each age band (6 to 9, 10 to 12, 13 to 17) and that a separate child-friendly notice is enough.",
  "Retention periods: confirm how long accounts and progress are kept after access ends (suggested: deleted 12 months after access ends with no login), rate-limit logs (30 days), and the order-number hash (deleted when access ends).",
  "Name every processor and where data is stored: Hetzner Online GmbH (the server, Germany; check the UK adequacy position for EU transfers and the data processing agreement) and the email provider for password-reset emails and the mailing list (not yet chosen).",
  "Amazon: the order number is the buyer's own data given to us. Confirm that format-checking it, storing only a salted hash and using it only to limit redemptions per order is compatible with Amazon's rule that customer information is used only to fulfil orders. Nothing here is matched against Seller Central data.",
  "Complaints: from 19 June 2026 data-protection complaints must be acknowledged within 30 days and people must be able to complain electronically. Confirm the complaints email and process, and add the right to complain to the ICO.",
  "Add the legal entity name, registered address, company number and ICO registration (data protection fee) number. Decide whether a Data Protection Officer is needed.",
  "Storage on the device: the site uses browser storage only to keep the login session, the chosen learner and the parent-area lock. Confirm this is 'strictly necessary' so no cookie banner is needed, and keep it that way (no analytics or advertising cookies).",
];

export default function Privacy() {
  return (
    <div className="pr"><div className="wrap wrap-narrow page stack">
      <div className="legal-flag" role="note">
        <p style={{ margin: "0 0 8px" }}>
          <strong>DRAFT, NOT YET CHECKED BY A LAWYER.</strong> This privacy notice must be checked and completed before the site goes live.
          Points the lawyer needs to settle:
        </p>
        <ol className="legal-points">
          {LEGAL_POINTS.map((p) => <li key={p}>{p}</li>)}
        </ol>
      </div>
      <h1>Privacy notice</h1>
      <p className="lead">How Inkworks Practice uses personal information. Written for adults and older students; a short version for children is at the end.</p>

      <h2>Who we are</h2>
      <p>[Legal entity name, registered address, company number and ICO registration number to be added.] Contact: {SUPPORT_EMAIL}.</p>

      <h2>What we collect</h2>
      <ul>
        <li><strong>The account holder</strong> (a parent, guardian or teacher aged 18 or over, or a student aged 13 or over using a KS3 or GCSE book): name, email address, a password (kept only as a one-way hash that nobody can read back, including us), whether the account is a parent or student account, and the date each book was unlocked.</li>
        <li><strong>Learner profiles:</strong> a first name, a year group and a profile colour. We do not ask for a child&apos;s surname, email address, photo, school or date of birth.</li>
        <li><strong>Practice records:</strong> each answer given, whether it was right, scores and dates, so that progress and &quot;ready for another go&quot; suggestions work.</li>
        {ORDER_MODE !== "off" && (
          <li>
            <strong>Amazon order number{ORDER_MODE === "optional" ? " (optional)" : ""}:</strong> we only check that it looks like an Amazon order number. We never send it to
            Amazon or match it against Amazon&apos;s records. We store a scrambled version (a salted hash) so we can stop one order being used on lots of accounts,
            and we delete that when your access to the book ends ({accessLength(ACCESS_MONTHS)} after you enter the code).
          </li>
        )}
        <li><strong>Mailing list choice (adults only):</strong> whether you opted in, when, and the exact wording you saw. Students and children are never offered the mailing list.</li>
        <li><strong>Parent PIN:</strong> a scrambled version of the 4-digit PIN that keeps children out of the parent area.</li>
        <li><strong>Security:</strong> scrambled versions of the email address and IP address used when entering a book code or a parent PIN, kept to stop people guessing codes. These are cleared on a schedule (the retention period is one of the points above).</li>
      </ul>

      <h2>Why we use it (lawful basis)</h2>
      <p>[To be confirmed with legal advice. Expected: contract, to provide the practice that comes with the book; legitimate interests, for security and to stop codes being shared; consent, for the mailing list only. You can withdraw consent to the mailing list at any time on the Account page or with the link in every email.]</p>

      <h2>Children</h2>
      <p>The site follows the ICO Age Appropriate Design Code. Accounts belong to adults, or to students aged 13 or over. Children&apos;s profiles are private, there are no adverts, no chat, no sharing or social features, no leaderboards, no streaks and no marketing to children. We do not use children&apos;s data for profiling, we make no automated decisions about anyone, and the site has no AI features. Children are told that their grown-up can see their progress.</p>

      <h2>Who we share it with</h2>
      <p>[Processors to be confirmed: Hetzner Online GmbH (hosting and database, Germany) and the email provider for password-reset emails and the mailing list.] We never sell personal information and never share it for advertising.</p>

      <h2>How long we keep it</h2>
      <p>[Retention periods to be confirmed. Suggested: account and progress kept while the account is open, and deleted on request or 12 months after access ends without a login. Order-number hashes are deleted when access ends. Security logs are deleted after 30 days.]</p>

      <h2>Your rights</h2>
      <p>You can download your data and delete your account at any time from the Account page. You can also ask us to correct or delete your data, or object to how we use it, at {SUPPORT_EMAIL}. We will acknowledge a complaint within 30 days. You can also complain to the Information Commissioner&apos;s Office (ico.org.uk).</p>

      <h2>For children</h2>
      <p>We keep your first name, your year group, your answers and your scores so you can see how you are getting on. Your grown-up can see them too. Nobody else can. We never email you and we never show you adverts.</p>
    </div></div>
  );
}
