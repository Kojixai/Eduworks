import Link from "next/link";
import type { Recommendation, StrugglingArea } from "@/lib/recommend";
import { IconLock, IconSpark } from "./icons";

const KIND: Record<Recommendation["kind"], { chip: string; bg: string }> = {
  review: { chip: "Ready again", bg: "var(--gold)" },
  strengthen: { chip: "Build on it", bg: "var(--violet)" },
  next: { chip: "Up next", bg: "var(--aqua)" },
  unlock: { chip: "In the book", bg: "var(--peach-deep)" },
};

/** The right-hand panel: what to do next, and why. Playable items first, locked books last. */
export function Recommended({ items, struggling, heading = "Recommended for you" }: { items: Recommendation[]; struggling: StrugglingArea[]; heading?: string }) {
  return (
    <aside aria-labelledby="rec-h" className="grid content-start gap-3">
      <h2 id="rec-h" className="m-0 flex items-center gap-2 font-[family-name:var(--font-head)] text-xl">
        <IconSpark /> {heading}
      </h2>
      {struggling.length > 0 && (
        <p className="m-0 text-sm text-muted">
          Keeping an eye on: {struggling.map((s) => <span key={s.word} className="mr-1 inline-block rounded-full bg-[var(--peach)] px-2.5 py-0.5 text-[var(--ink)]">{s.word}</span>)}
        </p>
      )}
      {items.length === 0 && <p className="m-0 rounded-[var(--radius-lg)] border-[1.5px] border-dashed border-[var(--ink)]/40 p-4 text-sm text-muted">Recommendations appear after the first practice.</p>}
      <ul className="m-0 grid list-none gap-3 p-0">
        {items.map((r) => {
          const k = KIND[r.kind];
          const locked = r.kind === "unlock";
          return (
            <li key={r.id}>
              <Link href={r.href} className="block rounded-[var(--radius-lg)] border-[1.5px] border-[var(--ink)] bg-surface p-4 text-[var(--ink)] no-underline shadow-[3px_3px_0_var(--ink)] transition-transform hover:-translate-y-0.5">
                <span className="mb-2 flex items-center justify-between gap-2">
                  <span className="rounded-full border border-[var(--ink)] px-2.5 py-0.5 text-xs font-semibold" style={{ background: k.bg }}>{k.chip}</span>
                  {locked ? <IconLock /> : r.pct !== null && <span className="text-sm font-semibold">{r.pct}%</span>}
                </span>
                <span className="block font-[family-name:var(--font-head)] text-[1.05rem] leading-snug">{r.title}</span>
                <span className="mt-1 block text-sm text-muted">{r.reason}</span>
                {!locked && <span className="mt-2 block text-xs font-medium text-muted">{r.bookTitle}</span>}
              </Link>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}
