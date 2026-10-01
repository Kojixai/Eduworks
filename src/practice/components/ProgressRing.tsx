import type { UnitStatus } from "@/practice/mastery";

/** A ring showing the best score for a unit, green when secure. */
export function ProgressRing({ status, size = 56 }: { status: UnitStatus; size?: number }) {
  const r = (size - 8) / 2;
  const c = 2 * Math.PI * r;
  const pct = status.state === "not-started" ? 0 : status.bestPct;
  const colour = status.state === "secure" ? "var(--ok)" : "var(--ct)";
  const label =
    status.state === "not-started"
      ? "Not started"
      : status.state === "secure"
        ? `Secure, best score ${Math.round(pct * 100)}%`
        : `Best score ${Math.round(pct * 100)}%`;
  return (
    <svg className="ring" width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={label}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#e7e4dc" strokeWidth="6" />
      {pct > 0 && (
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={colour}
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={`${c * pct} ${c}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      )}
      {status.state === "secure" ? (
        <path d={`M${size * 0.32} ${size * 0.52} l${size * 0.12} ${size * 0.12} l${size * 0.24} -${size * 0.26}`} fill="none" stroke="var(--ok)" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      ) : (
        <text x="50%" y="50%" dominantBaseline="central" textAnchor="middle" fontSize={size * 0.26} fill={pct > 0 ? "var(--ct)" : "#767b84"}>
          {pct > 0 ? `${Math.round(pct * 100)}` : "-"}
        </text>
      )}
    </svg>
  );
}
