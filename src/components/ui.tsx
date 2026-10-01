/**
 * Shared component kit. Every page (student site and /admin) builds from these, and these only use
 * design tokens (src/styles/tokens.css), so a redesign happens here and in tokens.css.
 */
import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

const cx = (...c: Array<string | false | null | undefined>) => c.filter(Boolean).join(" ");

export function Page({ children, narrow }: { children: ReactNode; narrow?: boolean }) {
  return <main className={cx("mx-auto w-full px-4 py-5", narrow ? "max-w-xl" : "max-w-[960px]")}>{children}</main>;
}

export function PageHeader({ title, subtitle, back, actions }: { title: ReactNode; subtitle?: ReactNode; back?: { href: string; label: string }; actions?: ReactNode }) {
  return (
    <header className="mb-4">
      {back && (
        <Link href={back.href} className="mb-2 inline-flex min-h-[44px] items-center text-sm text-primary no-underline">
          ← {back.label}
        </Link>
      )}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-[length:var(--font-size-xl)] font-semibold leading-tight">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
        </div>
        {actions}
      </div>
    </header>
  );
}

export function Card({ children, className, title, id }: { children: ReactNode; className?: string; title?: ReactNode; id?: string }) {
  return (
    <section id={id} className={cx("rounded-[var(--radius-lg)] border-[1.5px] border-[var(--ink)] bg-surface p-4", className)}>
      {title && <h2 className="mb-2 text-[length:var(--font-size-lg)] font-semibold">{title}</h2>}
      {children}
    </section>
  );
}

type Variant = "primary" | "secondary" | "ghost" | "danger";
const btn = (v: Variant, full?: boolean) =>
  cx(
    "inline-flex min-h-[48px] items-center justify-center gap-2 rounded-full border-[1.5px] border-[var(--ink)] px-6 py-2 text-[length:var(--font-size-md)] font-semibold no-underline transition-colors disabled:opacity-50",
    v === "primary" && "bg-[var(--c-lime)] text-[var(--ink)] hover:brightness-95",
    v === "secondary" && "bg-surface text-ink hover:bg-surface-muted",
    v === "ghost" && "border-transparent text-ink underline hover:bg-primary-soft",
    v === "danger" && "bg-danger text-on-primary",
    full && "w-full",
  );

export function Button({ variant = "primary", full, className, ...p }: ComponentProps<"button"> & { variant?: Variant; full?: boolean }) {
  return <button {...p} className={cx(btn(variant, full), className)} />;
}

export function ButtonLink({ href, variant = "primary", full, children, className }: { href: string; variant?: Variant; full?: boolean; children: ReactNode; className?: string }) {
  return (
    <Link href={href} className={cx(btn(variant, full), className)}>
      {children}
    </Link>
  );
}

export function Field({ label, error, hint, children, htmlFor }: { label: ReactNode; error?: string; hint?: ReactNode; children: ReactNode; htmlFor?: string }) {
  return (
    <div className="mb-3">
      <label htmlFor={htmlFor} className="mb-1 block text-sm font-medium">
        {label}
      </label>
      {children}
      {hint && !error && <p className="mt-1 text-xs text-muted">{hint}</p>}
      {error && (
        <p className="mt-1 text-sm text-danger" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

export function Input({ className, ...p }: ComponentProps<"input">) {
  return <input {...p} className={cx("block min-h-[44px] w-full rounded-[var(--radius-sm)] border border-border bg-surface px-3 py-2 text-[length:var(--font-size-md)]", className)} />;
}

export function Select({ className, ...p }: ComponentProps<"select">) {
  return <select {...p} className={cx("block min-h-[44px] w-full rounded-[var(--radius-sm)] border border-border bg-surface px-3 py-2", className)} />;
}

export function Checkbox({ label, ...p }: ComponentProps<"input"> & { label: ReactNode }) {
  return (
    <label className="flex min-h-[44px] cursor-pointer items-start gap-3 py-2 text-sm">
      <input type="checkbox" {...p} className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--color-primary)]" />
      <span>{label}</span>
    </label>
  );
}

type Tone = "neutral" | "primary" | "success" | "danger" | "warning";
export function Badge({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  const t = {
    neutral: "bg-surface-muted text-muted border-border",
    primary: "bg-primary-soft text-primary border-transparent",
    success: "bg-success-soft text-success border-transparent",
    danger: "bg-danger-soft text-danger border-transparent",
    warning: "bg-warning-soft text-warning border-transparent",
  }[tone];
  return <span className={cx("inline-flex items-center rounded-[var(--radius-pill)] border px-2 py-0.5 text-xs font-medium", t)}>{children}</span>;
}

export function Alert({ tone = "primary", children }: { tone?: Tone; children: ReactNode }) {
  const t = {
    neutral: "bg-surface-muted",
    primary: "bg-primary-soft",
    success: "bg-success-soft",
    danger: "bg-danger-soft",
    warning: "bg-warning-soft",
  }[tone];
  return <div className={cx("mb-4 rounded-[var(--radius-md)] p-3 text-sm", t)}>{children}</div>;
}

export function ProgressBar({ value, max = 100, tone = "primary", label }: { value: number; max?: number; tone?: "primary" | "success" | "danger" | "warning"; label?: string }) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  const bg = { primary: "bg-primary", success: "bg-success", danger: "bg-danger", warning: "bg-warning" }[tone];
  return (
    <div className="h-2.5 w-full overflow-hidden rounded-full bg-surface-muted" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
      <div className={cx("h-full rounded-full", bg)} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function Stat({ label, value, hint }: { label: ReactNode; value: ReactNode; hint?: ReactNode }) {
  return (
    <div className="rounded-[var(--radius-md)] border border-border bg-surface p-3">
      <div className="text-xs text-muted">{label}</div>
      <div className="text-[length:var(--font-size-xl)] font-semibold">{value}</div>
      {hint && <div className="text-xs text-muted">{hint}</div>}
    </div>
  );
}

export function Grid({ children, cols = 2 }: { children: ReactNode; cols?: 2 | 3 | 4 }) {
  const c = { 2: "sm:grid-cols-2", 3: "sm:grid-cols-3", 4: "grid-cols-2 sm:grid-cols-4" }[cols];
  return <div className={cx("grid gap-3", c)}>{children}</div>;
}

export function ListLink({ href, title, meta, right }: { href: string; title: ReactNode; meta?: ReactNode; right?: ReactNode }) {
  return (
    <Link href={href} className="flex min-h-[52px] items-center justify-between gap-3 border-b border-border px-1 py-3 text-ink no-underline last:border-b-0 hover:bg-surface-muted">
      <span className="min-w-0">
        <span className="block font-medium">{title}</span>
        {meta && <span className="block text-xs text-muted">{meta}</span>}
      </span>
      <span className="shrink-0 text-sm text-muted">{right ?? "›"}</span>
    </Link>
  );
}

export function EmptyState({ title, children }: { title: ReactNode; children?: ReactNode }) {
  return (
    <div className="rounded-[var(--radius-lg)] border border-dashed border-border bg-surface p-6 text-center">
      <p className="font-medium">{title}</p>
      {children && <div className="mt-2 text-sm text-muted">{children}</div>}
    </div>
  );
}

export function Stars({ n, of = 3 }: { n: number; of?: number }) {
  return (
    <span aria-label={`${n} of ${of} stars`} className="tracking-tight">
      {Array.from({ length: of }, (_, i) => (
        <span key={i} className={i < n ? "text-star" : "text-border"}>
          ★
        </span>
      ))}
    </span>
  );
}

/** Attribution lines for Oak- or STA-derived content shown on the page. */
export function AttributionFooter({ lines }: { lines: Array<string | null | undefined> }) {
  const uniq = [...new Set(lines.filter(Boolean) as string[])];
  if (!uniq.length) return null;
  return (
    <aside className="mx-auto mt-6 w-full max-w-[960px] px-4 text-xs text-muted" aria-label="Content attribution">
      <div className="rounded-[var(--radius-md)] border border-border bg-surface p-3">
        <p className="mb-1 font-medium">Content on this page</p>
        <ul className="list-disc space-y-0.5 pl-4">
          {uniq.map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
        <p className="mt-1">
          <Link href="/credits">Credits and licences</Link>
        </p>
      </div>
    </aside>
  );
}

/** Renders "[Fraction:3/4]" markup from the curriculum data as a readable fraction. */
export function CurriculumText({ text }: { text: string }) {
  return <>{text.replace(/\[Fraction:(\d+)\/(\d+)\]/g, "$1/$2")}</>;
}
