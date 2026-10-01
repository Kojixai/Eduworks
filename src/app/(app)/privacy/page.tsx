import type { Metadata } from "next";
import { LegalPage, Section, Callout, TableCard, DefList, type TocItem } from "@/components/legal/LegalPage";
import { COMPANY, COMPANY_ADDRESS } from "@/lib/company";
import { ACCESS_MONTHS, accessLength, MAX_ACCOUNTS_PER_ORDER } from "@/practice/config";

export const metadata: Metadata = { title: "Privacy notice" };

const TOC: TocItem[] = [
  { id: "short-version", title: "The short version" },
  { id: "who-we-are", title: "Who we are" },
  { id: "what-we-collect", title: "What we collect and why" },
  { id: "lawful-bases", title: "Our reasons for using it" },
  { id: "children", title: "Children" },
  { id: "sharing", title: "Who we share it with" },
  { id: "transfers", title: "Where it is stored" },
  { id: "keeping", title: "How long we keep it" },
  { id: "security", title: "How we keep it safe" },
  { id: "cookies", title: "Cookies and storage" },
  { id: "rights", title: "Your rights" },
  { id: "complaints", title: "Complaints" },
  { id: "changes", title: "Changes to this notice" },
  { id: "for-children", title: "For children" },
];

export default function Privacy() {
  return (
    <LegalPage
      title="Privacy notice"
      summary={`How ${COMPANY.siteName} looks after personal information. It is written for parents, guardians, teachers and older students. A short version for children is at the end.`}
      toc={TOC}
      related={[
        { href: "/terms", label: "Terms of use" },
        { href: "/credits", label: "Credits and licences" },
      ]}
    >
      <Section id="short-version" title="The short version">
        <Callout title="Five things to know" tone="aqua">
          <ul>
            <li>We collect only what we need to run your account and show progress. Nothing more.</li>
            <li>There are no adverts, no analytics, no trackers and no chat. We never sell personal information.</li>
            <li>Children are never given an account or an email address. A child is a first name, a year group and a colour inside an adult&apos;s account.</li>
            <li>Your data is stored on one server in Germany (EU). It is not sent anywhere else.</li>
            <li>You can download everything we hold, or delete your account, yourself on the Account page. Questions go to <a href={`mailto:${COMPANY.email}`}>{COMPANY.email}</a>.</li>
          </ul>
        </Callout>
        <p>The rest of this page gives the detail, so you can check every point.</p>
      </Section>

      <Section id="who-we-are" title="Who we are">
        <p>
          {COMPANY.siteName} ({COMPANY.siteUrl.replace("https://", "")}) is run by <strong>{COMPANY.name}</strong>. We are a company registered in {COMPANY.jurisdiction}.
          The printed {COMPANY.imprint} books are published by {COMPANY.imprint}, an imprint of the same company.
        </p>
        <DefList
          items={[
            { term: "Company", def: COMPANY.name },
            { term: "Company number", def: COMPANY.number },
            { term: "Registered office", def: COMPANY_ADDRESS },
            { term: "Email", def: <a href={`mailto:${COMPANY.email}`}>{COMPANY.email}</a> },
          ]}
        />
        <p>
          {COMPANY.name} is the <strong>data controller</strong>. That means we decide why and how your personal information is used. Use the email address above for anything about
          privacy, data requests, complaints or support. We have not appointed a Data Protection Officer.
        </p>
      </Section>

      <Section id="what-we-collect" title="What we collect and why">
        <p>This table lists everything we hold. The last column says how long we keep it. The full retention rules are in <a href="#keeping">How long we keep it</a>.</p>
        <TableCard caption="Personal information we hold, whose it is, why, and for how long" minWidth={740}>
          <thead>
            <tr>
              <th scope="col">What</th>
              <th scope="col">Whose</th>
              <th scope="col">Why we use it</th>
              <th scope="col">How long</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Name, email address, account type (parent or student) and the time you confirmed your age</td>
              <td>The account holder</td>
              <td>To create your account, let you log in and contact you about your account.</td>
              <td>While the account is open. Inactive accounts are reviewed once a year (see How long we keep it).</td>
            </tr>
            <tr>
              <td>Password</td>
              <td>The account holder</td>
              <td>To check it is you. We keep only a one-way scrambled version (a bcrypt hash). Nobody can read your password back, including us.</td>
              <td>As the account.</td>
            </tr>
            <tr>
              <td>Learner profile: first name, year group and a profile colour</td>
              <td>Each child or student</td>
              <td>To show the right books and keep each learner&apos;s progress apart.</td>
              <td>As the account.</td>
            </tr>
            <tr>
              <td>Practice records: each answer, whether it was right, scores, topics and dates</td>
              <td>Each learner</td>
              <td>To show progress, give the parent dashboard, and suggest what to practise next.</td>
              <td>As the account.</td>
            </tr>
            <tr>
              <td>Book access: which book, when it was unlocked and when access ends, when you accepted the terms, and which code was used</td>
              <td>The account holder</td>
              <td>To unlock the book and end access on time. Codes are stored only as keyed hashes, never in plain text.</td>
              <td>As the account.</td>
            </tr>
            <tr>
                <td>Order number from your purchase</td>
                <td>The account holder</td>
                <td>You give it when you sign up, to stop one order unlocking a book on lots of accounts. We only check that it looks like a valid order number. We keep only a scrambled version (a keyed hash), not the number itself.</td>
                <td>Deleted when access to that book ends.</td>
              </tr>
            <tr>
              <td>Mailing list choice: whether you ticked the box, the exact wording shown and the time</td>
              <td>Adults only</td>
              <td>To email you about new books, only if you ticked the box. Access never depends on it. Children and students are never offered it.</td>
              <td>Until you untick it or delete your account. Consent records are deleted when you delete your account.</td>
            </tr>
            <tr>
              <td>Parent PIN</td>
              <td>The account holder</td>
              <td>To keep children out of the parent area on a shared device. We keep only a keyed hash of the 4 digits.</td>
              <td>Until you remove it or delete the account.</td>
            </tr>
            <tr>
              <td>Login sessions: a scrambled token and the start and end time</td>
              <td>The account holder</td>
              <td>To keep you logged in on your device.</td>
              <td>Up to 30 days, or until you log out.</td>
            </tr>
            <tr>
              <td>Security records: scrambled versions of the email address and IP address used when entering a code, the parent PIN or a password</td>
              <td>Anyone using those forms</td>
              <td>To slow down people guessing codes, PINs and passwords.</td>
              <td>Deleted after 30 days.</td>
            </tr>
            <tr>
              <td>Web server logs: IP address, time, page asked for and browser type</td>
              <td>Every visitor</td>
              <td>To keep the site running and secure, and to investigate misuse.</td>
              <td>Up to 30 days.</td>
            </tr>
            <tr>
              <td>Staff activity log: which administrator changed which record, and when</td>
              <td>Account holders, if staff change their records</td>
              <td>To keep a trail of changes made in the back office, in case something goes wrong.</td>
              <td>Deleted after 12 months.</td>
            </tr>
          </tbody>
        </TableCard>
        <p>
          We do not ask for a child&apos;s surname, email address, photo, school or date of birth. Our staff can see account names, email addresses and book access in the back office,
          to give support and run the service.
        </p>
        <p>
          Book access lasts {accessLength(ACCESS_MONTHS)} from the day the code is entered. One order number can unlock the same book on up to {MAX_ACCOUNTS_PER_ORDER} accounts, for example two adults in one family.
        </p>
      </Section>

      <Section id="lawful-bases" title="Our reasons for using it">
        <p>The law (UK GDPR) says we must have a lawful reason for each use of personal information. Ours are:</p>
        <DefList
          items=
          {[
            {
              term: "Contract",
              def: "To give you the account, unlock the book you bought and record your progress. Without this we cannot provide the service.",
            },
            {
              term: "Legitimate interests",
              def: (
                <>
                  To keep the site secure, to slow down code and password guessing, and to check an order number so a code is not shared with large numbers of people. These are things you would reasonably expect, they use very little information, most of it is scrambled, and it is kept for a short time. Weighing this against your rights, we do not think they are overridden. You can object at any time (see <a href="#rights">Your rights</a>).
                </>
              ),
            },
            {
              term: "Consent",
              def: "For the mailing list only. It is a separate tick box, unticked to start with, and adults only. You can withdraw it at any time on the Account page.",
            },
            {
              term: "Legal obligation",
              def: "Where the law requires it, for example answering a lawful request from a court or regulator.",
            },
          ]}
        />
      </Section>

      <Section id="children" title="Children">
        <p>We follow the ICO&apos;s Age Appropriate Design Code (the Children&apos;s Code). In practice:</p>
        <ul>
          <li><strong>Adults hold the accounts.</strong> An account is made by a parent, guardian or teacher aged 18 or over, or by a student aged 13 or over using a KS3 or KS4 book. Children under 13 are profiles inside an adult&apos;s account. They have no email address and no password.</li>
          <li><strong>We collect the minimum</strong> for a child: first name, year group, a colour, and their practice records.</li>
          <li><strong>No profiling, no adverts, no chat.</strong> We do not use children&apos;s information to profile them, to advertise to them or to market to them. There is no chat, no sharing, no public profile, no leaderboard and no streaks. Nothing a child does is visible to other families.</li>
          <li><strong>No automated decisions.</strong> The &quot;ready for another go&quot; suggestions only choose the next practice from a child&apos;s own scores. They do not affect anything else.</li>
          <li><strong>Children are told</strong> that their grown-up can see their scores.</li>
          <li><strong>Private by default.</strong> Nothing is shared outside the account. We never email children.</li>
        </ul>
      </Section>

      <Section id="sharing" title="Who we share it with">
        <p>We share personal information with one organisation:</p>
        <DefList
          items={[
            {
              term: "Hetzner Online GmbH",
              def: "Our hosting provider in Germany. It runs the server that holds the website and the database. It acts as our processor: it stores the data for us and may use it only on our instructions.",
            },
          ]}
        />
        <p>
          We do not share personal information with anyone else. We never sell it and we never share it for advertising. We may disclose information if the law requires it, for example to a court or the police.
        </p>
        <p>
          The headings on the site use a font delivered by Adobe Fonts. When a page loads, your browser asks Adobe&apos;s servers for the font, so Adobe receives your IP address and browser details, as happens on any site that uses a hosted font. We send Adobe nothing from your account.
        </p>
        <p>
          We do not yet send any email. When we start sending email (for example password resets or the mailing list), we will use a UK or EU provider, and we will update this notice before we do.
        </p>
        <p>
          If we later sell books through this site, payments will be handled by a payment provider, and we will update this notice first.
        </p>
      </Section>

      <Section id="transfers" title="Where it is stored">
        <p>
          Your information is stored on a single server in Germany, which is in the European Union. We do not send it outside the EU. The UK recognises the EU as providing adequate protection for personal information (an &quot;adequacy&quot; decision), so no extra safeguards are needed for it to be held there.
        </p>
      </Section>

      <Section id="keeping" title="How long we keep it">
        <TableCard caption="How long each kind of information is kept" minWidth={560}>
          <thead>
            <tr>
              <th scope="col">Information</th>
              <th scope="col">How long</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Account, learner profiles, practice records and book access</td>
              <td>While the account is open. Once a year we review inactive accounts and delete any whose access ended more than 12 months ago and that have not been used since. You can delete your account sooner yourself.</td>
            </tr>
            <tr>
              <td>Order number (keyed hash)</td>
              <td>Deleted when access to that book ends.</td>
            </tr>
            <tr>
              <td>Login sessions</td>
              <td>Up to 30 days, or until you log out. Expired sessions are deleted.</td>
            </tr>
            <tr>
              <td>Security records and web server logs</td>
              <td>Up to 30 days.</td>
            </tr>
            <tr>
              <td>Backups</td>
              <td>We keep the latest 14 nightly copies and delete older ones. So after you delete your account, your information can remain in backups for up to 14 days more.</td>
            </tr>
            <tr>
              <td>Mailing list consent records</td>
              <td>Deleted when you delete your account.</td>
            </tr>
            <tr>
              <td>Staff activity log</td>
              <td>Deleted after 12 months.</td>
            </tr>
          </tbody>
        </TableCard>
      </Section>

      <Section id="security" title="How we keep it safe">
        <ul>
          <li>Passwords are stored only as bcrypt hashes. Book codes, order numbers, parent PINs and the scrambled email and IP records are stored only as keyed hashes, so they cannot be read back.</li>
          <li>The site is served over an encrypted connection (HTTPS) and the login cookie is set so that scripts on the page cannot read it.</li>
          <li>Guessing is slowed down. Too many wrong tries on a book code, a parent PIN or a password lock that form for 15 minutes.</li>
          <li>Children cannot reach the parent area while the PIN lock is on. The account password remains the real protection.</li>
          <li>The database is backed up every night and access to the server and the back office is limited to staff who need it.</li>
          <li>Learner pages show only that family&apos;s learners.</li>
        </ul>
        <p>No system is perfect. If there were a breach that put people at risk, we would tell the ICO within 72 hours and tell the people affected without delay.</p>
      </Section>

      <Section id="cookies" title="Cookies and storage">
        <p>
          We use only the cookies the site needs to work. We do not use analytics, advertising or social media cookies, so there is no cookie banner. Each cookie below is set by us, is not readable by scripts on the page, and is used only for the purpose given.
        </p>
        <TableCard caption="Cookies used on this site" minWidth={640}>
          <thead>
            <tr>
              <th scope="col">Name</th>
              <th scope="col">What it does</th>
              <th scope="col">How long</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td><code>edu_session</code></td>
              <td>Keeps you logged in.</td>
              <td>30 days, or until you log out.</td>
            </tr>
            <tr>
              <td><code>edu_child</code></td>
              <td>Remembers which learner is practising on this device.</td>
              <td>90 days, or until you log out.</td>
            </tr>
            <tr>
              <td><code>edu_lock</code></td>
              <td>Remembers that the parent area is locked, when a PIN has been set and the device is handed to a child.</td>
              <td>30 days, or until the PIN is entered.</td>
            </tr>
            <tr>
              <td><code>edu_view</code></td>
              <td>Staff only. Remembers which preview (admin, parent or child) is open.</td>
              <td>30 days.</td>
            </tr>
          </tbody>
        </TableCard>
        <p>You can delete these in your browser settings. If you do, you will be logged out.</p>
      </Section>

      <Section id="rights" title="Your rights">
        <p>You have the right to:</p>
        <ul>
          <li>be told what we hold about you and get a copy (access);</li>
          <li>have wrong information corrected (rectification);</li>
          <li>have your information deleted (erasure);</li>
          <li>ask us to pause using it (restriction);</li>
          <li>object to uses based on our legitimate interests;</li>
          <li>receive your information in a form you can reuse (portability); and</li>
          <li>withdraw consent to the mailing list at any time.</li>
        </ul>
        <Callout title="Do it yourself on the Account page" tone="peach">
          <ul>
            <li><strong>Download my data</strong> gives you a file with your account, learners, book access, mailing choices and every practice record. Hashes are left out.</li>
            <li><strong>Delete my account</strong> removes your account, every learner profile, all practice records, book access, your mailing list records and your login sessions. This cannot be undone.</li>
            <li>The mailing list box can be unticked at any time.</li>
          </ul>
        </Callout>
        <p>
          For anything else, email <a href={`mailto:${COMPANY.email}`}>{COMPANY.email}</a>. We will reply within 1 month. We may need to check it is really you before sharing information. We do not charge for this.
        </p>
        <p>The parent or guardian can use these rights for a child on the child&apos;s behalf.</p>
      </Section>

      <Section id="complaints" title="Complaints">
        <p>
          If you are unhappy about how we have used personal information, tell us first at <a href={`mailto:${COMPANY.email}`}>{COMPANY.email}</a>. You can complain this way electronically at any time. We will acknowledge your complaint within 30 days and tell you what we find.
        </p>
        <p>You can also complain to the Information Commissioner&apos;s Office (ICO), the UK data protection regulator:</p>
        <DefList
          items={[
            { term: "Website", def: <a href="https://ico.org.uk" rel="noopener noreferrer">ico.org.uk</a> },
            { term: "Telephone", def: <a href="tel:03031231113">0303 123 1113</a> },
          ]}
        />
      </Section>

      <Section id="changes" title="Changes to this notice">
        <p>
          If we change how we use personal information, we will update this page and the date at the top. If a change matters to you, for example we start sending email or taking payments, we will tell account holders before it starts.
        </p>
      </Section>

      <Section id="for-children" title="For children">
        <div className="my-6 rounded-[var(--radius-lg)] border-[1.5px] border-[var(--ink)] bg-[var(--gold)] p-6 text-ink sm:p-8 print:break-inside-avoid">
          <p className="!mt-0 font-[family-name:var(--font-head)] text-[1.6rem] leading-tight">Hello! Here is what we know about you.</p>
          <ul className="!mb-0 text-[1.125rem] leading-relaxed">
            <li>We know your <strong>first name</strong>, your <strong>year group</strong> and the <strong>colour</strong> you picked.</li>
            <li>We know which questions you answered and how many you got right. That is how we show you how you are getting on.</li>
            <li><strong>Your grown-up can see your scores.</strong> Nobody else can.</li>
            <li>We never show you adverts. We never email you. There is no chatting on this site.</li>
            <li>We do not sell anything about you.</li>
            <li>Got a question? Ask your grown-up. They can write to us at <a href={`mailto:${COMPANY.email}`}>{COMPANY.email}</a>.</li>
          </ul>
        </div>
      </Section>
    </LegalPage>
  );
}
