import { BRAND } from "@/lib/brand";

/** The Learn Works wordmark. Styled inline so it looks identical on the marketing pages and inside the app. */
export function Wordmark({ size = "2.2rem" }: { size?: string }) {
  const base = { fontFamily: 'gloock, Georgia, "Times New Roman", serif', fontWeight: 400, fontSize: size, lineHeight: 1, color: "var(--ink)", letterSpacing: "-0.01em", whiteSpace: "nowrap" as const };
  return (
    <span aria-label={BRAND} style={{ ...base, display: "inline-flex", alignItems: "baseline", gap: ".26em" }}>
      <span aria-hidden="true">Learn</span>
      <span aria-hidden="true" style={{ background: "linear-gradient(transparent 62%, var(--c-lime) 62%)", padding: "0 .06em" }}>Works</span>
    </span>
  );
}
