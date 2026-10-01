import type { ReactNode } from "react";
import { COMPANY, LEGAL_UPDATED } from "@/lib/company";

export interface TocItem {
  id: string;
  title: string;
}

const focus = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)]";

/** Text styles for everything inside the content column. */
const prose = [
  "text-[1.0625rem] leading-[1.7] text-ink",
  "[&_p]:my-3 [&_p]:max-w-[70ch]",
  "[&_ul]:my-3 [&_ul]:max-w-[70ch] [&_ul]:list-disc [&_ul]:pl-6 [&_ul>li]:my-1.5 [&_ul>li]:pl-1",
  "[&_ol]:my-3 [&_ol]:max-w-[70ch] [&_ol]:list-decimal [&_ol]:pl-6 [&_ol>li]:my-1.5 [&_ol>li]:pl-1",
  "[&_a]:font-medium [&_a]:text-ink [&_a]:underline [&_a]:decoration-[var(--ink)] [&_a]:underline-offset-[3px] [&_a]:[overflow-wrap:anywhere]",
  `[&_a:focus-visible]:outline [&_a:focus-visible]:outline-2 [&_a:focus-visible]:outline-offset-2 [&_a:focus-visible]:outline-[var(--ink)]`,
  "[&_h3]:mb-1 [&_h3]:mt-6 [&_h3]:text-[1.1875rem] [&_h3]:font-semibold [&_h3]:leading-snug",
  "[&_strong]:font-semibold",
].join(" ");

export function LegalPage({
  title,
  summary,
  toc,
  children,
  related,
}: {
  title: string;
  summary: string;
  toc: TocItem[];
  children: ReactNode;
  related?: { href: string; label: string }[];
}) {
  const tocLinks = (
    <ol className="m-0 list-none p-0">
      {toc.map((t, i) => (
        <li key={t.id}>
          <a
            href={`#${t.id}`}
            className={`flex min-h-[44px] items-center gap-3 rounded-[var(--radius-md)] px-3 py-2 text-[0.95rem] leading-snug text-ink no-underline hover:bg-[var(--c-cream)] ${focus}`}
          >
            <span aria-hidden="true" className="w-5 shrink-0 text-right text-[0.8rem] tabular-nums text-muted">{i + 1}</span>
            <span>{t.title}</span>
          </a>
        </li>
      ))}
    </ol>
  );

  return (
    <article className="w-full overflow-x-clip pb-16 print:pb-0">
      {/* Header band */}
      <header className="border-b-[1.5px] border-[var(--ink)] bg-[var(--c-cream)] print:border-b print:bg-transparent">
        <div className="mx-auto max-w-[1240px] px-4 pb-8 pt-9 sm:px-6 sm:pb-10 sm:pt-12">
          <p className="m-0 text-[0.8rem] font-semibold uppercase tracking-[0.12em] text-muted">{COMPANY.siteName}</p>
          <h1 className="mb-0 mt-2 font-[family-name:var(--font-head)] text-[clamp(2.1rem,6vw,3.4rem)] font-normal leading-[1.08] text-ink">
            {title}
          </h1>
          <p className="mb-0 mt-4 max-w-[60ch] text-[1.125rem] leading-relaxed text-ink">{summary}</p>
          <div className="mt-6 flex flex-wrap items-center gap-2.5 text-[0.9rem]">
            <span className="inline-flex min-h-[44px] items-center rounded-full border-[1.5px] border-[var(--ink)] bg-surface px-4 text-ink">
              Last updated: <time className="ml-1 font-semibold">{LEGAL_UPDATED}</time>
            </span>
            <a
              href={`mailto:${COMPANY.email}`}
              className={`inline-flex min-h-[44px] items-center rounded-full border-[1.5px] border-[var(--ink)] bg-[var(--c-pink)] px-4 font-medium text-ink no-underline hover:brightness-95 ${focus}`}
            >
              Contact: {COMPANY.email}
            </a>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-[1240px] px-4 pt-6 sm:px-6 lg:grid lg:grid-cols-[250px_minmax(0,1fr)] lg:gap-12 lg:pt-10 print:block">
        {/* Mobile table of contents */}
        <details className="mb-6 rounded-[var(--radius-lg)] border-[1.5px] border-[var(--ink)] bg-surface lg:hidden print:hidden">
          <summary className={`flex min-h-[48px] cursor-pointer items-center px-5 py-3 text-[1rem] font-semibold text-ink ${focus}`}>
            On this page
          </summary>
          <nav aria-label="On this page" className="border-t border-border px-2 pb-3 pt-2">{tocLinks}</nav>
        </details>

        {/* Desktop table of contents */}
        <aside className="hidden lg:block print:hidden">
          <nav
            aria-label="On this page"
            className="sticky top-6 max-h-[calc(100vh-3rem)] overflow-y-auto rounded-[var(--radius-lg)] border-[1.5px] border-[var(--ink)] bg-surface p-3"
          >
            <p className="m-0 px-3 pb-2 pt-2 text-[0.8rem] font-semibold uppercase tracking-[0.12em] text-muted">On this page</p>
            {tocLinks}
          </nav>
        </aside>

        <div className="min-w-0">
          <div className={prose}>{children}</div>

          {related && related.length > 0 && (
            <nav aria-label="Other legal pages" className="mt-12 flex flex-wrap gap-2.5 print:hidden">
              {related.map((r) => (
                <a
                  key={r.href}
                  href={r.href}
                  className={`inline-flex min-h-[44px] items-center rounded-full border-[1.5px] border-[var(--ink)] bg-surface px-4 text-[0.95rem] font-medium text-ink no-underline hover:bg-[var(--c-cream)] ${focus}`}
                >
                  {r.label}
                </a>
              ))}
            </nav>
          )}

          <p className="mt-10 border-t border-border pt-5 text-[0.9rem] text-muted">
            This page was last updated on {LEGAL_UPDATED}. {COMPANY.siteName} is a service of {COMPANY.name}.
          </p>
        </div>
      </div>
    </article>
  );
}

/** A numbered section with an anchor. Pass the same id and title as in the table of contents. */
export function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-h`} className="scroll-mt-6 border-t border-border pb-10 pt-8 first:border-t-0 first:pt-0 print:break-inside-avoid-page">
      <h2 id={`${id}-h`} className="m-0 font-[family-name:var(--font-head)] text-[clamp(1.6rem,4vw,2.1rem)] font-normal leading-tight text-ink">
        {title}
      </h2>
      <div className="mt-2">{children}</div>
    </section>
  );
}

const tones = {
  peach: "bg-[var(--c-cream)]",
  aqua: "bg-[var(--c-lime)]",
  violet: "bg-[var(--c-pink)]",
  gold: "bg-[var(--c-amber)]",
  plain: "bg-surface",
} as const;

/** A highlighted card for the points that matter most. */
export function Callout({
  title,
  tone = "peach",
  children,
  id,
}: {
  title: string;
  tone?: keyof typeof tones;
  children: ReactNode;
  id?: string;
}) {
  return (
    <aside id={id} className={`my-6 rounded-[var(--radius-lg)] border-[1.5px] border-[var(--ink)] ${tones[tone]} p-5 text-ink sm:p-6 print:break-inside-avoid`}>
      <p className="m-0 font-[family-name:var(--font-head)] text-[1.4rem] leading-tight">{title}</p>
      <div className="[&>*:first-child]:mt-3 [&>*:last-child]:mb-0 [&_ul]:mb-0">{children}</div>
    </aside>
  );
}

/** A card holding a wide table. The table scrolls inside the card, never the page. */
export function TableCard({ caption, children, minWidth = 640 }: { caption: string; children: ReactNode; minWidth?: number }) {
  return (
    <div className="my-6 overflow-hidden rounded-[var(--radius-lg)] border-[1.5px] border-[var(--ink)] bg-surface print:break-inside-avoid">
      <div
        className={`overflow-x-auto ${focus}`}
        role="region"
        aria-label={caption}
        tabIndex={0}
      >
        <table
          style={{ minWidth }}
          className="w-full border-collapse text-left text-[0.95rem] leading-snug [&_td]:border-t [&_td]:border-border [&_td]:px-4 [&_td]:py-3 [&_td]:align-top [&_th]:bg-[var(--c-cream)] [&_th]:px-4 [&_th]:py-3 [&_th]:text-[0.8rem] [&_th]:font-semibold [&_th]:uppercase [&_th]:tracking-[0.08em] [&_td:first-child]:font-medium"
        >
          <caption className="sr-only">{caption}</caption>
          {children}
        </table>
      </div>
      <p className="m-0 border-t border-border px-4 py-2 text-[0.8rem] text-muted print:hidden">Scroll sideways to see every column.</p>
    </div>
  );
}

/** A definition list as a card: term on the left, explanation on the right. */
export function DefList({ items }: { items: { term: string; def: ReactNode }[] }) {
  return (
    <dl className="my-6 overflow-hidden rounded-[var(--radius-lg)] border-[1.5px] border-[var(--ink)] bg-surface">
      {items.map((it, i) => (
        <div key={it.term} className={`grid gap-1 px-5 py-4 sm:grid-cols-[11rem_minmax(0,1fr)] sm:gap-6 ${i > 0 ? "border-t border-border" : ""}`}>
          <dt className="font-semibold">{it.term}</dt>
          <dd className="m-0 min-w-0 [&_a]:[overflow-wrap:anywhere]">{it.def}</dd>
        </div>
      ))}
    </dl>
  );
}

/** A grid of cards. */
export function CardGrid({ children }: { children: ReactNode }) {
  return <ul className="!my-5 grid !max-w-none list-none gap-4 !pl-0 sm:grid-cols-2">{children}</ul>;
}

/** Small tag, for example a licence name. */
export function Tag({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex min-h-[28px] items-center rounded-full border border-[var(--ink)] bg-[var(--c-cream)] px-3 text-[0.8rem] font-semibold leading-none text-ink">
      {children}
    </span>
  );
}

/** A source or font card used on the credits page. */
export function SourceCard({
  name,
  by,
  children,
  tag,
  href,
  linkLabel = "Visit the source",
}: {
  name: string;
  by?: string;
  children: ReactNode;
  tag?: ReactNode;
  href?: string;
  linkLabel?: string;
}) {
  return (
    <li className="flex flex-col !my-0 !pl-5 rounded-[var(--radius-lg)] border-[1.5px] border-[var(--ink)] bg-surface p-5 print:break-inside-avoid">
      <h3 className="!mt-0 mb-0 font-[family-name:var(--font-sans)] text-[1.1rem] font-semibold leading-snug">{name}</h3>
      {by && <p className="!my-0.5 text-[0.9rem] text-muted">{by}</p>}
      <div className="mt-2 text-[0.975rem] leading-relaxed [&>p]:!my-2">{children}</div>
      <div className="mt-auto flex flex-wrap items-center gap-3 pt-3">
        {tag}
        {href && (
          <a href={href} rel="noopener noreferrer" className="inline-flex min-h-[44px] items-center text-[0.95rem]">
            {linkLabel}
          </a>
        )}
      </div>
    </li>
  );
}
