import type { Metadata } from "next";
import { LegalPage, Section, Callout, DefList, type TocItem } from "@/components/legal/LegalPage";
import { COMPANY, COMPANY_ADDRESS } from "@/lib/company";
import { accessLength, MAX_ACCOUNTS_PER_ORDER } from "@/practice/config";

export const metadata: Metadata = { title: "Terms of use" };

const TOC: TocItem[] = [
  { id: "short-version", title: "The short version" },
  { id: "who-we-are", title: "Who we are" },
  { id: "accounts", title: "Who can use the site" },
  { id: "codes", title: "Book codes and access" },
  { id: "when-access-ends", title: "When access ends" },
  { id: "acceptable-use", title: "Using the site properly" },
  { id: "content", title: "Accuracy of the content" },
  { id: "ip", title: "Who owns what" },
  { id: "availability", title: "Availability and changes" },
  { id: "suspension", title: "Suspending access" },
  { id: "liability", title: "Our responsibility to you" },
  { id: "law", title: "Governing law" },
  { id: "contact", title: "Contact" },
];

export default function Terms() {
  const length = accessLength();
  return (
    <LegalPage
      title="Terms of use"
      summary={`The rules for using ${COMPANY.siteName}: who can have an account, how book codes work, and what you can expect from us. We have tried to keep it fair and short.`}
      toc={TOC}
      related={[
        { href: "/privacy", label: "Privacy notice" },
        { href: "/credits", label: "Credits and licences" },
      ]}
    >
      <Section id="short-version" title="The short version">
        <Callout title="In plain English" tone="aqua">
          <ul>
            <li>{COMPANY.siteName} is free practice that goes with {COMPANY.imprint} books. A code in your book unlocks it for {length}.</li>
            <li>Adults make accounts. Children use profiles inside an adult&apos;s account.</li>
            <li>Please do not share your code or account around.</li>
            <li>The practice helps you prepare. It cannot promise a grade.</li>
            <li>This does not take away any rights you have by law.</li>
          </ul>
        </Callout>
        <p>By creating an account you agree to these terms and confirm you have read the <a href="/privacy">privacy notice</a>.</p>
      </Section>

      <Section id="who-we-are" title="Who we are">
        <p>
          {COMPANY.siteName} ({COMPANY.siteUrl.replace("https://", "")}) is run by {COMPANY.name} (Learn Works is a service of {COMPANY.name}), a company registered in {COMPANY.jurisdiction} with number {COMPANY.number}.
          Our registered office is {COMPANY_ADDRESS}. The printed books are published by {COMPANY.imprint}, an imprint of {COMPANY.name}.
        </p>
      </Section>

      <Section id="accounts" title="Who can use the site">
        <DefList
          items={[
            {
              term: "Parents, guardians and teachers",
              def: "You must be 18 or over to make an account. You are responsible for the children who use it.",
            },
            {
              term: "Students aged 13 or over",
              def: "You can make your own account to unlock a KS3 or KS4 book. KS1 and KS2 books need an adult account.",
            },
            {
              term: "Children under 13",
              def: "Children do not have accounts. An adult adds them as a profile (first name, year group and a colour) inside the adult's account.",
            },
          ]}
        />
        <p>
          Give true details and keep your password private. You are responsible for what happens under your account. The parent PIN only stops children opening the parent area by accident. It is not a security measure, so the account password is what protects the account.
        </p>
        <p>Practice from the national curriculum (lessons, quizzes, past papers and checks) is open to any account. The {COMPANY.imprint} book practice needs a book code.</p>
      </Section>

      <Section id="codes" title="Book codes and access">
        <ul>
          <li><strong>One code unlocks one book</strong>, for {length} from the day you enter it. Each book has its own code.</li>
          <li><strong>Some books have a code that is the same in every copy</strong> of that title. Others have a unique code in each copy, which works on one account only.</li>
          <li><strong>You will be asked for the order number from your purchase.</strong> We only check that it looks like a valid order number, keep a scrambled version and delete it when your access ends. One order can unlock a book on up to {MAX_ACCOUNTS_PER_ORDER} accounts, for example 2 adults in a family. See the <a href="/privacy">privacy notice</a> for how we handle it.</li>
          <li><strong>Please do not share a code.</strong> Do not post it online, sell it or pass it to people who have not bought the book. A code is for the buyer&apos;s family or class.</li>
          <li><strong>Second-hand books:</strong> if a unique code has already been used, it cannot be used again. Ask the seller whether the code is still fresh before you buy. We cannot unlock a book with a code that is already in use on another account.</li>
          <li><strong>Problem with a code?</strong> Email <a href={`mailto:${COMPANY.email}`}>{COMPANY.email}</a> and tell us the book. Never send us your password.</li>
        </ul>
      </Section>

      <Section id="when-access-ends" title="When access ends">
        <p>
          When the {length} are over, you can still log in, but that book&apos;s practice is locked. Your progress is not lost. Once a year we review inactive accounts and delete any whose access ended more than 12 months ago and that have not been used since (see the <a href="/privacy#keeping">privacy notice</a>).
        </p>
        <p>To carry on, enter a valid code for the same book while your account is still open. Your earlier progress will be there.</p>
        <p>You can stop using the site and delete your account at any time from the Account page.</p>
      </Section>

      <Section id="acceptable-use" title="Using the site properly">
        <p>Please do not:</p>
        <ul>
          <li>share codes, or log in as someone else;</li>
          <li>try to guess codes or passwords, or get round limits we have set;</li>
          <li>copy, scrape or resell the questions, books or other content;</li>
          <li>interfere with the site or try to break into it; or</li>
          <li>use it for anything unlawful.</li>
        </ul>
        <p>There is no chat on the site and nothing you or your children write is shown to other people. We do not host user-generated content.</p>
      </Section>

      <Section id="content" title="Accuracy of the content">
        <p>
          We check our questions and answers carefully, but we are human and mistakes happen. If you spot one, please tell us at <a href={`mailto:${COMPANY.email}`}>{COMPANY.email}</a>.
        </p>
        <p>
          The practice is study material. It is designed to help, but it does not guarantee any exam result. Real papers and mark schemes belong to the exam boards and the Standards and Testing Agency. Where we use their material it is as credited on the <a href="/credits">credits page</a>.
        </p>
      </Section>

      <Section id="ip" title="Who owns what">
        <ul>
          <li>The {COMPANY.imprint} books and the content we wrote for this site (questions, explanations, texts, diagrams and software) are copyright {COMPANY.name}. You may use them for your own or your own children&apos;s or class&apos;s learning. You may not copy or share them more widely without asking us.</li>
          <li>Curriculum content from Oak National Academy, the Department for Education and the Standards and Testing Agency is used under the Open Government Licence v3.0. You may reuse that material under that licence. The credits page gives the details.</li>
          <li>Texts that are in the public domain, and open-licensed fonts and software, stay under their own terms. See <a href="/credits">Credits and licences</a>.</li>
        </ul>
      </Section>

      <Section id="availability" title="Availability and changes">
        <p>
          We aim to keep the site running, but we do not promise it will always be available or error-free. We may need to pause it for maintenance, and things outside our control can go wrong.
        </p>
        <p>
          We may improve, change or remove parts of the site. If we remove something you have paid for through a book, we will give you reasonable notice and, where fair, a way to continue. We may update these terms. If a change matters, we will tell account holders before it applies, and the date at the top will change.
        </p>
      </Section>

      <Section id="suspension" title="Suspending access">
        <p>
          We may suspend or end access if a code is shared or misused, if someone breaks these terms, or if we must by law. Where we can, we will tell you why and give you a chance to put it right first. If we end access because of a mistake on our side, we will restore it.
        </p>
      </Section>

      <Section id="liability" title="Our responsibility to you">
        <p>
          Nothing in these terms limits or excludes our liability for death or personal injury caused by negligence, for fraud, or for anything else the law does not allow us to limit. Your statutory consumer rights are not affected. This includes your rights under the Consumer Rights Act 2015 for digital content.
        </p>
        <p>
          Subject to that, we are not responsible for losses that were not a reasonably foreseeable result of our breach, nor for any loss of business or profit, as the site is for personal and family learning. Our total liability to you for any one issue is limited to the amount you paid for the book that the access relates to. We are not responsible for delays or failures caused by events outside our reasonable control.
        </p>
      </Section>

      <Section id="law" title="Governing law">
        <p>
          These terms are governed by the law of England and Wales. If you live in Scotland or Northern Ireland you can also bring a claim in your local courts. If you live in England or Wales, the courts of England and Wales have jurisdiction.
        </p>
      </Section>

      <Section id="contact" title="Contact">
        <DefList
          items={[
            { term: "Email", def: <a href={`mailto:${COMPANY.email}`}>{COMPANY.email}</a> },
            { term: "Company", def: `${COMPANY.name}, company number ${COMPANY.number}` },
            { term: "Registered office", def: COMPANY_ADDRESS },
          ]}
        />
        <p>We will reply as soon as we can. For privacy matters, see the <a href="/privacy">privacy notice</a>.</p>
      </Section>
    </LegalPage>
  );
}
