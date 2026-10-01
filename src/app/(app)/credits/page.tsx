import type { Metadata } from "next";
import { LegalPage, Section, type TocItem } from "@/components/legal/LegalPage";
import { COMPANY } from "@/lib/company";

export const metadata: Metadata = { title: "Credits and licences" };

const OGL_URL = "https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/";

const TOC: TocItem[] = [
  { id: "curriculum", title: "Curriculum content" },
  { id: "our-content", title: "Our own content" },
];

export default function Credits() {
  return (
    <LegalPage
      title="Credits and licences"
      summary={`Where the curriculum content on ${COMPANY.siteName} comes from.`}
      toc={TOC}
      related={[
        { href: "/privacy", label: "Privacy notice" },
        { href: "/terms", label: "Terms of use" },
      ]}
    >
      <Section id="curriculum" title="Curriculum content">
        <p>
          Contains public sector information licensed under the{" "}
          <a href={OGL_URL} rel="noopener noreferrer">Open Government Licence v3.0</a>.
        </p>
        <p>
          The curriculum practice draws on material from Oak National Academy, the Department for Education, the Standards and
          Testing Agency and The National Archives.
        </p>
      </Section>

      <Section id="our-content" title="Our own content">
        <p>The books, their practice questions and the explanations were written for {COMPANY.siteName}.</p>
        <p>An Inspector Calls is still in copyright, so its practice uses only a small number of short quotations.</p>
      </Section>
    </LegalPage>
  );
}
