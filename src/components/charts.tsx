/**
 * Small, dependency-free SVG/CSS charts for the parent dashboard. Server components.
 * Every chart has a text alternative; colour is never the only signal (series are labelled).
 */
import type { DayPoint, TrendPoint } from "@/lib/dashboard";

export function BarChart({ data, label }: { data: DayPoint[]; label: string }) {
  const max = Math.max(5, ...data.map((d) => d.questions));
  const W = 560, H = 170, pad = { t: 10, r: 8, b: 26, l: 30 };
  const iw = W - pad.l - pad.r, ih = H - pad.t - pad.b;
  const bw = Math.min(28, (iw / data.length) * 0.62);
  const ticks = [0, Math.round(max / 2), max];
  return (
    <figure className="m-0">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} className="h-auto w-full">
        {ticks.map((t) => {
          const y = pad.t + ih - (t / max) * ih;
          return (
            <g key={t}>
              <line x1={pad.l} x2={W - pad.r} y1={y} y2={y} stroke="var(--chart-grid)" strokeWidth="1" />
              <text x={pad.l - 6} y={y + 4} textAnchor="end" fontSize="11" fill="var(--color-text-muted)">{t}</text>
            </g>
          );
        })}
        {data.map((d, i) => {
          const x = pad.l + (iw / data.length) * (i + 0.5);
          const h = (d.questions / max) * ih;
          return (
            <g key={d.day}>
              <rect x={x - bw / 2} y={pad.t + ih - h} width={bw} height={Math.max(h, d.questions ? 2 : 0)} rx="4" fill="var(--chart-1)">
                <title>{`${d.day}: ${d.questions} questions`}</title>
              </rect>
              <text x={x} y={H - 8} textAnchor="middle" fontSize="11" fill="var(--color-text-muted)">{d.label}</text>
            </g>
          );
        })}
      </svg>
      <figcaption className="sr-only">{data.map((d) => `${d.day}: ${d.questions}`).join("; ")}</figcaption>
    </figure>
  );
}

export function TrendChart({ data, label }: { data: TrendPoint[]; label: string }) {
  const W = 320, H = 170, pad = { t: 12, r: 12, b: 24, l: 32 };
  const iw = W - pad.l - pad.r, ih = H - pad.t - pad.b;
  if (data.length < 2)
    return <p className="m-0 text-sm text-muted">{data.length ? `Latest score: ${data[0].pct}%. A trend line appears after a second practice.` : "Scores will appear here."}</p>;
  const pts = data.map((d, i) => [pad.l + (iw / (data.length - 1)) * i, pad.t + ih - (d.pct / 100) * ih] as const);
  const line = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
  return (
    <figure className="m-0">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} className="h-auto w-full">
        {[0, 50, 80, 100].map((t) => {
          const y = pad.t + ih - (t / 100) * ih;
          return (
            <g key={t}>
              <line x1={pad.l} x2={W - pad.r} y1={y} y2={y} stroke={t === 80 ? "var(--chart-secure)" : "var(--chart-grid)"} strokeDasharray={t === 80 ? "4 4" : undefined} strokeWidth="1" />
              <text x={pad.l - 6} y={y + 4} textAnchor="end" fontSize="11" fill="var(--color-text-muted)">{t}%</text>
            </g>
          );
        })}
        <path d={line} fill="none" stroke="var(--chart-1)" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
        {pts.map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r="4" fill="var(--color-surface)" stroke="var(--chart-1)" strokeWidth="2">
            <title>{`${data[i].day}: ${data[i].pct}% (${data[i].title})`}</title>
          </circle>
        ))}
      </svg>
      <figcaption className="mt-1 text-xs text-muted">Dashed line: 80%, the level that counts as secure.</figcaption>
    </figure>
  );
}

/** Secure / practising / not started, as one stacked bar with a legend. */
export function MasteryBar({ secure, practising, notStarted, total }: { secure: number; practising: number; notStarted: number; total: number }) {
  const w = (n: number) => `${total ? (n / total) * 100 : 0}%`;
  return (
    <div>
      <div className="flex h-3 overflow-hidden rounded-full bg-[var(--chart-track)]" role="img" aria-label={`${secure} secure, ${practising} practising, ${notStarted} not started, out of ${total} topics`}>
        <span style={{ width: w(secure), background: "var(--chart-secure)" }} />
        <span style={{ width: w(practising), background: "var(--chart-practising)" }} />
        <span style={{ width: w(notStarted), background: "var(--chart-notstarted)" }} />
      </div>
      <ul className="m-0 mt-2 flex list-none flex-wrap gap-x-4 gap-y-1 p-0 text-xs text-muted">
        <li><span className="mr-1 inline-block h-2 w-2 rounded-full" style={{ background: "var(--chart-secure)" }} />{secure} secure</li>
        <li><span className="mr-1 inline-block h-2 w-2 rounded-full" style={{ background: "var(--chart-practising)" }} />{practising} practising</li>
        <li><span className="mr-1 inline-block h-2 w-2 rounded-full" style={{ background: "var(--chart-notstarted)" }} />{notStarted} to start</li>
      </ul>
    </div>
  );
}

/** Progress ring: share of topics secure, with the figure in the middle. */
export function Ring({ value, label, size = 112, colour = "var(--chart-2)" }: { value: number; label: string; size?: number; colour?: string }) {
  const r = (size - 14) / 2, c = 2 * Math.PI * r, v = Math.max(0, Math.min(1, value));
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={label} className="shrink-0">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--chart-track)" strokeWidth="12" />
      {v > 0 && <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={colour} strokeWidth="12" strokeLinecap="round" strokeDasharray={`${c * v} ${c}`} transform={`rotate(-90 ${size / 2} ${size / 2})`} />}
      <text x="50%" y="50%" dominantBaseline="central" textAnchor="middle" fontSize={size * 0.22} fontWeight="700" fill="var(--ink)" fontFamily="var(--font-head)">{Math.round(v * 100)}%</text>
    </svg>
  );
}
