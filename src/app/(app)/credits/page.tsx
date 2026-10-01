import type { Metadata } from "next";
import { getStore } from "@/lib/db";
import { LegalPage, Section, Callout, CardGrid, SourceCard, Tag, TableCard, type TocItem } from "@/components/legal/LegalPage";
import { COMPANY } from "@/lib/company";

export const metadata: Metadata = { title: "Credits and licences" };

const OGL_URL = "https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/";
const OFL_URL = "https://openfontlicense.org/";

/** Photographers whose Pexels photos appear on the site (see docs/IMAGE_CREDITS.md): { name, url of one photo }. */
const PHOTO_CREDITS: { name: string; url: string }[] = [
  { name: "Mikhail Nilov", url: "https://www.pexels.com/photo/little-girl-with-drawings-of-numbers-8923557/" },
  { name: "Max Fischer", url: "https://www.pexels.com/photo/boy-in-red-hoodie-5212319/" },
  { name: "RDNE Stock project", url: "https://www.pexels.com/photo/girl-studying-in-the-library-8500350/" },
  { name: "Julia M Cameron", url: "https://www.pexels.com/photo/girl-in-pink-shirt-holding-notebook-4143799/" },
  { name: "Karola G", url: "https://www.pexels.com/photo/a-girl-in-hoodie-sweater-holding-a-notebook-8005438/" },
  { name: "Timur Weber", url: "https://www.pexels.com/photo/a-boy-sitting-on-the-bed-9127717/" },
  { name: "Jessica Pope", url: "https://www.pexels.com/photo/a-girl-with-a-backpack-holding-a-book-13198533/" },
  { name: "Annushka Ahuja", url: "https://www.pexels.com/photo/a-girl-sitting-at-the-table-8055143/" },
  { name: "Mary Taylor", url: "https://www.pexels.com/photo/5896921/" },
  { name: "Katerina Holmes", url: "https://www.pexels.com/photo/5905513/" },
];

const TOC: TocItem[] = [
  { id: "short-version", title: "The short version" },
  { id: "curriculum", title: "Curriculum content" },
  { id: "books", title: "Reading texts and facts" },
  { id: "fonts", title: "Fonts" },
  { id: "photography", title: "Photography" },
  { id: "software", title: "Software" },
  { id: "ours", title: "Our own content" },
];

type Source = { id: string; name: string; publisher: string; home_url: string; licence_id: string; attribution_text: string };

const GROUPS: { title: string; ids: string[] }[] = [
  { title: "Oak National Academy", ids: ["oak_ontology", "oak_graphs", "oak_api"] },
  { title: "Department for Education", ids: ["nc_govuk", "dfe_subject_content"] },
  { title: "Standards and Testing Agency", ids: ["sta_ks2", "sta_ks1", "sta_phonics", "sta_mtc"] },
  { title: "The National Archives", ids: ["national_archives"] },
];

const SOFTWARE: { name: string; what: string; licence: string; href: string }[] = [
  { name: "Next.js", what: "The web framework", licence: "MIT", href: "https://github.com/vercel/next.js" },
  { name: "React", what: "The user interface library", licence: "MIT", href: "https://react.dev" },
  { name: "Tailwind CSS", what: "Styling", licence: "MIT", href: "https://tailwindcss.com" },
  { name: "better-sqlite3", what: "The database driver (SQLite)", licence: "MIT", href: "https://github.com/WiseLibs/better-sqlite3" },
  { name: "bcryptjs", what: "Password hashing", licence: "BSD-3-Clause", href: "https://github.com/dcodeIO/bcrypt.js" },
  { name: "Zod", what: "Checking data", licence: "MIT", href: "https://zod.dev" },
  { name: "undici", what: "Web requests", licence: "MIT", href: "https://github.com/nodejs/undici" },
  { name: "N3.js", what: "Reading curriculum data", licence: "MIT", href: "https://github.com/rdfjs/N3.js" },
  { name: "Supabase JavaScript client", what: "Data tools", licence: "MIT", href: "https://github.com/supabase/supabase-js" },
];

export default async function Credits() {
  const store = await getStore();
  const sources = await store.select<Source>("sources", { orderBy: [["name", "asc"]] });
  const byId = new Map(sources.map((s) => [s.id, s]));
  const known = new Set(GROUPS.flatMap((g) => g.ids).concat("eduworks_original"));
  const others = sources.filter((s) => !known.has(s.id));

  const card = (s: Source) => (
    <SourceCard
      key={s.id}
      name={s.name}
      by={s.publisher}
      href={s.home_url || undefined}
      tag={<Tag>{s.licence_id === "OGL-3.0" ? "Open Government Licence v3.0" : s.licence_id}</Tag>}
    >
      <p>
        {s.attribution_text.includes("{subject}")
          ? `Each lesson page carries a line such as: “${s.attribution_text.replace("{subject}", "maths")}”.`
          : s.attribution_text}
      </p>
    </SourceCard>
  );

  return (
    <LegalPage
      title="Credits and licences"
      summary={`Where the content on ${COMPANY.siteName} comes from, who made it, and the licence it comes under. Thank you to everyone who shares their work openly.`}
      toc={TOC}
      related={[
        { href: "/privacy", label: "Privacy notice" },
        { href: "/terms", label: "Terms of use" },
      ]}
    >
      <Section id="short-version" title="The short version">
        <Callout title="Standing on shoulders" tone="aqua">
          <ul>
            <li>Curriculum practice uses public sector information from Oak National Academy, the Department for Education and the Standards and Testing Agency, under the Open Government Licence v3.0.</li>
            <li>Reading texts are in the public domain, or were written for {COMPANY.imprint}.</li>
            <li>Fonts and software are open source, each under its own licence.</li>
            <li>The {COMPANY.imprint} books and the questions in them are our own work.</li>
          </ul>
        </Callout>
      </Section>

      <Section id="curriculum" title="Curriculum content">
        <p>
          Contains public sector information licensed under the{" "}
          <a href={OGL_URL} rel="noopener noreferrer">Open Government Licence v3.0</a>.
        </p>
        <p>
          Oak National Academy lesson content is used under that licence. Each page that shows it carries a line saying so. Material that the Standards and Testing Agency lists as owned by a third party in its copyright reports is never shown. Logos are not reproduced. The licence does not cover third-party rights, logos or personal data.
        </p>
        {GROUPS.map((g) => {
          const items = g.ids.map((id) => byId.get(id)).filter((s): s is Source => !!s);
          if (!items.length) return null;
          return (
            <div key={g.title}>
              <h3>{g.title}</h3>
              <CardGrid>{items.map(card)}</CardGrid>
            </div>
          );
        })}
        {others.length > 0 && (
          <div>
            <h3>Other sources</h3>
            <CardGrid>{others.map(card)}</CardGrid>
          </div>
        )}
      </Section>

      <Section id="books" title="Reading texts and facts">
        <p>The reading units in the books use extracts from older works. Each extract is credited where it appears, with its source and any changes we made. Here is where they come from.</p>
        <CardGrid>
          <SourceCard
            name="Project Gutenberg"
            by="Public domain texts"
            href="https://www.gutenberg.org"
            tag={<Tag>Public domain in the UK</Tag>}
          >
            <p>
              Extracts from novels, poems, plays, essays and journals whose authors died long ago, including Charles Dickens, Jane Austen, the Brontë sisters, Robert Louis Stevenson, Rudyard Kipling, E. Nesbit, Christina Rossetti, William Shakespeare, Virginia Woolf and Katherine Mansfield. We note the Project Gutenberg ebook number next to each extract. We have not used the Project Gutenberg name or logo.
            </p>
          </SourceCard>
          <SourceCard name="Shakespeare" by="Plays used in extracts" tag={<Tag>Public domain in the UK</Tag>}>
            <p>Wording comes from Project Gutenberg. Line numbers follow the Folger Shakespeare edition, and we say where they differ.</p>
          </SourceCard>
          <SourceCard name="Written for the books" by={COMPANY.imprint} tag={<Tag>Copyright {COMPANY.name}</Tag>}>
            <p>Other texts were written for the books. Where a text uses facts from other organisations, it says so, for example English Heritage, Royal Museums Greenwich, the Natural History Museum, the British Museum, UK Parliament, NASA and the British Geological Survey. We use their facts, not their wording or pictures.</p>
          </SourceCard>
          <SourceCard name="An Inspector Calls" by="J. B. Priestley" tag={<Tag>In copyright</Tag>}>
            <p>This play is still in copyright. Practice uses only short quotations, each checked against the published text, for study and criticism.</p>
          </SourceCard>
        </CardGrid>
      </Section>

      <Section id="fonts" title="Fonts">
        <TableCard caption="Fonts used on this site" minWidth={600}>
          <thead>
            <tr>
              <th scope="col">Font</th>
              <th scope="col">Used for</th>
              <th scope="col">Licence</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Gloock</td>
              <td>Headings. Delivered by <a href="https://fonts.adobe.com/fonts/gloock" rel="noopener noreferrer">Adobe Fonts</a>.</td>
              <td>Adobe Fonts terms</td>
            </tr>
            <tr>
              <td>Inter</td>
              <td>Text and menus</td>
              <td><a href={OFL_URL} rel="noopener noreferrer">SIL Open Font Licence 1.1</a></td>
            </tr>
            <tr>
              <td>Lexend and Andika</td>
              <td>Practice pages, chosen to be easy to read</td>
              <td><a href={OFL_URL} rel="noopener noreferrer">SIL Open Font Licence 1.1</a></td>
            </tr>
            <tr>
              <td>Montserrat</td>
              <td>Artwork and sharing images</td>
              <td><a href={OFL_URL} rel="noopener noreferrer">SIL Open Font Licence 1.1</a></td>
            </tr>
          </tbody>
        </TableCard>
      </Section>

      <Section id="photography" title="Photography">
        <p>
          Photographs on this site come from <a href="https://www.pexels.com" rel="noopener noreferrer">Pexels</a> and are used under the{" "}
          <a href="https://www.pexels.com/license/" rel="noopener noreferrer">Pexels licence</a>. Our thanks to the photographers.
        </p>
        {PHOTO_CREDITS.length > 0 && (
          <ul>
            {PHOTO_CREDITS.map((p) => (
              <li key={p.url}>
                <a href={p.url} rel="noopener noreferrer">{p.name}</a>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section id="software" title="Software">
        <p>The site is built with open-source software. These are the main packages. The full list, with versions, is in the project&apos;s <code>package.json</code>, and each package carries its own licence.</p>
        <TableCard caption="Main open-source packages and their licences" minWidth={560}>
          <thead>
            <tr>
              <th scope="col">Package</th>
              <th scope="col">What it does</th>
              <th scope="col">Licence</th>
            </tr>
          </thead>
          <tbody>
            {SOFTWARE.map((s) => (
              <tr key={s.name}>
                <td><a href={s.href} rel="noopener noreferrer">{s.name}</a></td>
                <td>{s.what}</td>
                <td>{s.licence}</td>
              </tr>
            ))}
          </tbody>
        </TableCard>
      </Section>

      <Section id="ours" title="Our own content">
        <p>
          The {COMPANY.imprint} books, and the questions, explanations, diagrams and other practice content written for this site, are copyright {COMPANY.name}. Please see the <a href="/terms#ip">terms of use</a> for what you may do with them. To ask about reuse or to report a missing credit, write to <a href={`mailto:${COMPANY.email}`}>{COMPANY.email}</a>.
        </p>
      </Section>
    </LegalPage>
  );
}
