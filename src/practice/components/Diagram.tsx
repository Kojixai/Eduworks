// Renders the simple diagram specs from the content schema as accessible SVG.
// Labels never reveal an answer: arrows on number lines, clock times and angle sizes are described, not stated.
import type { BarPart, Diagram as DiagramSpec } from "@/practice/types";
import { formatNumber } from "@/practice/marking";

const INK = "#2b2f36";
const SOFT = "#8a8f98";
const ACCENT = { fill: "var(--c)" } as const;
const ACCENT_STROKE = { stroke: "var(--c)" } as const;
const TINT = { fill: "var(--cb)" } as const;
const FONT = 20;

export function Diagram({ spec }: { spec: DiagramSpec }) {
  const { node, label, maxWidth } = render(spec);
  return (
    <figure className="diagram" style={{ margin: "22px 0 6px" }}>
      <div style={{ width: "100%", maxWidth }} role="img" aria-label={label}>
        {node}
      </div>
    </figure>
  );
}

function render(d: DiagramSpec): { node: React.ReactNode; label: string; maxWidth: number } {
  switch (d.kind) {
    case "numberline": return numberLine(d);
    case "bar_model": return barModel(d);
    case "fraction_bar": return fractionBar(d);
    case "clock": return clock(d);
    case "array": return array(d);
    case "coordinates": return coordinates(d);
    case "angle": return angle(d);
    case "polygon": return polygon(d);
    case "bar_chart": return barChart(d);
  }
}

const fmt = (n: number) => formatNumber(Number(n.toFixed(6)));

function numberLine(d: Extract<DiagramSpec, { kind: "numberline" }>) {
  const W = 600, H = 120, L = 34, R = W - 34, Y = 74;
  const count = Math.round((d.max - d.min) / d.step);
  const x = (v: number) => L + ((v - d.min) / (d.max - d.min)) * (R - L);
  const every = d.labelEvery ? Math.max(1, Math.round(d.labelEvery / d.step)) : Math.max(1, Math.ceil((count + 1) / 11));
  const ticks = Array.from({ length: count + 1 }, (_, i) => d.min + i * d.step);
  const node = (
    <svg viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
      <line x1={L - 18} y1={Y} x2={R + 18} y2={Y} stroke={INK} strokeWidth="2.5" />
      <path d={`M${L - 18} ${Y} l10 -7 v14 z M${R + 18} ${Y} l-10 -7 v14 z`} fill={INK} />
      {ticks.map((v, i) => (
        <g key={i}>
          <line x1={x(v)} y1={Y - (i % every === 0 ? 12 : 8)} x2={x(v)} y2={Y + (i % every === 0 ? 12 : 8)} stroke={INK} strokeWidth="2" />
          {i % every === 0 && (
            <text x={x(v)} y={Y + 38} textAnchor="middle" fontSize={FONT} fill={INK}>{fmt(v)}</text>
          )}
        </g>
      ))}
      {(d.marks ?? []).map((m, i) => (
        <g key={`m${i}`} style={ACCENT}>
          <path d={`M${x(m)} ${Y - 14} l-11 -20 h22 z`} />
          <rect x={x(m) - 4} y={Y - 50} width="8" height="18" rx="2" />
        </g>
      ))}
    </svg>
  );
  const marks = d.marks?.length ? `, with ${d.marks.length === 1 ? "an arrow pointing to one point" : `${d.marks.length} arrows`}` : "";
  return { node, label: `Number line from ${fmt(d.min)} to ${fmt(d.max)}, with a mark every ${fmt(d.step)}${marks}.`, maxWidth: 620 };
}

function partInfo(p: BarPart): { label: string; value: number | null } {
  if (typeof p === "number") return { label: fmt(p), value: p };
  if (typeof p === "string") return { label: p, value: null };
  return { label: p.label ?? (p.value !== undefined ? fmt(p.value) : "?"), value: p.value ?? null };
}

function barModel(d: Extract<DiagramSpec, { kind: "bar_model" }>) {
  const parts = d.parts.map(partInfo);
  const known = parts.filter((p) => p.value !== null && p.value > 0).map((p) => p.value as number);
  const unknownCount = parts.length - known.length;
  const totalNum = typeof d.total === "number" ? d.total : null;
  const sumKnown = known.reduce((a, b) => a + b, 0);
  let unknownW = known.length ? sumKnown / known.length : 1;
  if (totalNum !== null && unknownCount > 0 && totalNum > sumKnown) unknownW = (totalNum - sumKnown) / unknownCount;
  const widths = parts.map((p) => (p.value !== null && p.value > 0 ? p.value : unknownW));
  const minShare = 0.12; // keep every part wide enough for its label
  const sum = widths.reduce((a, b) => a + b, 0);
  const shares = widths.map((w) => Math.max(minShare, w / sum));
  const shareSum = shares.reduce((a, b) => a + b, 0);
  const W = 600, L = 20, BW = W - 40;
  const hasTotal = d.total !== undefined;
  const top = hasTotal ? 58 : 14;
  const H = top + 64 + 12;
  let xPos = L;
  const node = (
    <svg viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
      {hasTotal && (
        <g>
          <path d={`M${L} ${top - 10} v-14 H${L + BW} v14`} fill="none" stroke={INK} strokeWidth="2" />
          <rect x={W / 2 - 46} y={top - 46} width="92" height="30" fill="#fff" />
          <text x={W / 2} y={top - 24} textAnchor="middle" fontSize={FONT + 2} fontWeight="600" fill={INK}>
            {typeof d.total === "number" ? fmt(d.total) : d.total}
          </text>
        </g>
      )}
      {parts.map((p, i) => {
        const w = (shares[i] / shareSum) * BW;
        const x0 = xPos;
        xPos += w;
        const unknown = p.value === null;
        return (
          <g key={i}>
            <rect x={x0} y={top} width={w} height="64" style={unknown ? { fill: "#fff" } : TINT} stroke={INK} strokeWidth="2.5" strokeDasharray={unknown ? "7 5" : undefined} />
            <text x={x0 + w / 2} y={top + 39} textAnchor="middle" fontSize={FONT + 2} fontWeight="600" fill={INK}>{p.label}</text>
          </g>
        );
      })}
    </svg>
  );
  const desc = parts.map((p) => p.label).join(", ");
  return { node, label: `Bar model${hasTotal ? ` with a whole of ${d.total}` : ""}, split into parts: ${desc}.`, maxWidth: 600 };
}

function fractionBar(d: Extract<DiagramSpec, { kind: "fraction_bar" }>) {
  const bars = Math.max(1, Math.ceil(d.shaded / d.n));
  const W = 600, L = 20, BW = W - 40, BH = 54, GAP = 16;
  const H = bars * BH + (bars - 1) * GAP + 8;
  const seg = BW / d.n;
  const node = (
    <svg viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
      {Array.from({ length: bars }, (_, b) => (
        <g key={b}>
          {Array.from({ length: d.n }, (_, i) => {
            const shaded = b * d.n + i < d.shaded;
            return <rect key={i} x={L + i * seg} y={4 + b * (BH + GAP)} width={seg} height={BH} style={shaded ? ACCENT : { fill: "#fff" }} stroke={INK} strokeWidth="2.5" />;
          })}
        </g>
      ))}
    </svg>
  );
  return {
    node,
    label: `${bars > 1 ? `${bars} fraction bars, each` : "A fraction bar"} split into ${d.n} equal parts, with ${d.shaded} part${d.shaded === 1 ? "" : "s"} shaded.`,
    maxWidth: 600,
  };
}

function clock(d: Extract<DiagramSpec, { kind: "clock" }>) {
  const S = 260, C = S / 2, R = 116;
  const hourAngle = ((d.h % 12) + d.m / 60) * 30;
  const minAngle = d.m * 6;
  const hand = (deg: number, len: number) => {
    const a = ((deg - 90) * Math.PI) / 180;
    return { x: C + Math.cos(a) * len, y: C + Math.sin(a) * len };
  };
  const hEnd = hand(hourAngle, 58), mEnd = hand(minAngle, 92);
  const node = (
    <svg viewBox={`0 0 ${S} ${S}`} aria-hidden="true">
      <circle cx={C} cy={C} r={R} fill="#fff" stroke={INK} strokeWidth="4" />
      {Array.from({ length: 60 }, (_, i) => {
        const a = ((i * 6 - 90) * Math.PI) / 180;
        const big = i % 5 === 0;
        const r1 = R - (big ? 14 : 7);
        return <line key={i} x1={C + Math.cos(a) * r1} y1={C + Math.sin(a) * r1} x2={C + Math.cos(a) * (R - 3)} y2={C + Math.sin(a) * (R - 3)} stroke={big ? INK : SOFT} strokeWidth={big ? 3 : 1.5} />;
      })}
      {Array.from({ length: 12 }, (_, i) => {
        const n = i + 1;
        const a = ((n * 30 - 90) * Math.PI) / 180;
        return <text key={n} x={C + Math.cos(a) * (R - 32)} y={C + Math.sin(a) * (R - 32)} textAnchor="middle" dominantBaseline="central" fontSize="19" fontWeight="600" fill={INK}>{n}</text>;
      })}
      <line x1={C} y1={C} x2={hEnd.x} y2={hEnd.y} stroke={INK} strokeWidth="8" strokeLinecap="round" />
      <line x1={C} y1={C} x2={mEnd.x} y2={mEnd.y} style={ACCENT_STROKE} strokeWidth="5" strokeLinecap="round" />
      <circle cx={C} cy={C} r="7" fill={INK} />
    </svg>
  );
  return { node, label: "An analogue clock face with an hour hand and a minute hand.", maxWidth: 260 };
}

function array(d: Extract<DiagramSpec, { kind: "array" }>) {
  const gap = 44, r = 14, pad = 24;
  const W = pad * 2 + (d.cols - 1) * gap, H = pad * 2 + (d.rows - 1) * gap;
  const node = (
    <svg viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
      {Array.from({ length: d.rows }, (_, i) =>
        Array.from({ length: d.cols }, (_, j) => <circle key={`${i}-${j}`} cx={pad + j * gap} cy={pad + i * gap} r={r} style={ACCENT} />),
      )}
    </svg>
  );
  return { node, label: `An array of dots in ${d.rows} row${d.rows === 1 ? "" : "s"} and ${d.cols} column${d.cols === 1 ? "" : "s"}.`, maxWidth: Math.min(560, W * 1.1) };
}

/** Negative numbers with a true minus sign, as in printed maths. */
const signed = (v: number) => (v < 0 ? `\u2212${-v}` : String(v));

function coordinates(d: Extract<DiagramSpec, { kind: "coordinates" }>) {
  // A grid with negative points but no "min" would hide those points, so fall back to four quadrants.
  const min = d.min ?? (d.points.some(([px, py]) => px < 0 || py < 0) ? -d.max : 0), max = d.max;
  const span = max - min;
  const cell = Math.max(26, Math.min(52, 320 / span));
  const padL = 44, padB = 40, padT = 26, padR = 26;
  const G = span * cell;
  const W = padL + G + padR, H = padT + G + padB;
  const X = (v: number) => padL + (v - min) * cell;
  const Y = (v: number) => padT + (max - v) * cell;
  const labelEvery = span > 12 ? 2 : 1;
  const node = (
    <svg viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
      {Array.from({ length: span + 1 }, (_, i) => min + i).map((v) => (
        <g key={v}>
          <line x1={X(v)} y1={Y(min)} x2={X(v)} y2={Y(max)} stroke="#d5d2ca" strokeWidth="1.5" />
          <line x1={X(min)} y1={Y(v)} x2={X(max)} y2={Y(v)} stroke="#d5d2ca" strokeWidth="1.5" />
          {v % labelEvery === 0 && (v !== 0 || min === 0) && <text x={X(v) + (v < 0 ? -3 : 0)} y={Y(Math.max(min, 0)) + 24} textAnchor="middle" fontSize="17" fill={INK}>{signed(v)}</text>}
          {v % labelEvery === 0 && v !== 0 && <text x={X(Math.max(min, 0)) - 8} y={Y(v)} textAnchor="end" dominantBaseline="central" fontSize="17" fill={INK}>{signed(v)}</text>}
        </g>
      ))}
      <line x1={X(min)} y1={Y(Math.max(min, 0))} x2={X(max) + 14} y2={Y(Math.max(min, 0))} stroke={INK} strokeWidth="2.5" />
      <line x1={X(Math.max(min, 0))} y1={Y(min)} x2={X(Math.max(min, 0))} y2={Y(max) - 14} stroke={INK} strokeWidth="2.5" />
      {min < 0 && <text x={X(0) - 8} y={Y(0) + 22} textAnchor="end" fontSize="17" fill={INK}>0</text>}
      <text x={X(max) + 14} y={Y(Math.max(min, 0)) - 10} fontSize="18" fontStyle="italic" fill={INK} textAnchor="end">x</text>
      <text x={X(Math.max(min, 0)) + 10} y={Y(max) - 4} fontSize="18" fontStyle="italic" fill={INK}>y</text>
      {d.points.map(([px, py, lab], i) => (
        <g key={i}>
          <circle cx={X(px)} cy={Y(py)} r="7" style={ACCENT} stroke="#fff" strokeWidth="2" />
          {lab && <text x={X(px) + 10} y={py < 0 && min < 0 ? Y(py) + 24 : Y(py) - 10} fontSize="20" fontWeight="700" style={{ fill: "var(--ct)" }}>{lab}</text>}
        </g>
      ))}
    </svg>
  );
  const names = d.points.map((p) => p[2]).filter(Boolean);
  return {
    node,
    label: `A coordinate grid from ${min} to ${max} on both axes, with ${d.points.length} plotted point${d.points.length === 1 ? "" : "s"}${names.length ? ` labelled ${names.join(", ")}` : ""}.`,
    maxWidth: Math.min(460, W),
  };
}

function angle(d: Extract<DiagramSpec, { kind: "angle" }>) {
  const len = 150, rArc = 44;
  const a = (d.deg * Math.PI) / 180;
  const p1 = { x: len, y: 0 };
  const p2 = { x: Math.cos(a) * len, y: -Math.sin(a) * len };
  const xs = [0, p1.x, p2.x, -rArc, rArc], ys = [0, p2.y, -rArc * (d.deg > 90 ? 1 : 0), d.deg > 180 ? rArc : 0];
  const pad = 30;
  const minX = Math.min(...xs) - pad, maxX = Math.max(...xs) + pad, minY = Math.min(...ys) - pad, maxY = Math.max(...ys) + pad;
  const large = d.deg > 180 ? 1 : 0;
  const arcEnd = { x: Math.cos(a) * rArc, y: -Math.sin(a) * rArc };
  const node = (
    <svg viewBox={`${minX} ${minY} ${maxX - minX} ${maxY - minY}`} aria-hidden="true">
      {d.deg === 90 ? (
        <path d={`M${rArc * 0.6} 0 v${-rArc * 0.6} h${-rArc * 0.6}`} fill="none" style={ACCENT_STROKE} strokeWidth="3" />
      ) : (
        <path d={`M${rArc} 0 A${rArc} ${rArc} 0 ${large} 0 ${arcEnd.x} ${arcEnd.y}`} fill="none" style={ACCENT_STROKE} strokeWidth="3.5" />
      )}
      <line x1="0" y1="0" x2={p1.x} y2={p1.y} stroke={INK} strokeWidth="4" strokeLinecap="round" />
      <line x1="0" y1="0" x2={p2.x} y2={p2.y} stroke={INK} strokeWidth="4" strokeLinecap="round" />
      <circle cx="0" cy="0" r="4.5" fill={INK} />
      {d.label && (
        <text x={Math.cos(a / 2) * (rArc + 22)} y={-Math.sin(a / 2) * (rArc + 22)} textAnchor="middle" dominantBaseline="central" fontSize="20" fontWeight="600" style={{ fill: "var(--ct)" }}>{d.label}</text>
      )}
    </svg>
  );
  return { node, label: `An angle between two straight lines${d.label ? `, labelled ${d.label}` : ""}.`, maxWidth: 340 };
}

function polygon(d: Extract<DiagramSpec, { kind: "polygon" }>) {
  const S = 240, C = S / 2, R = 96;
  const offset = Math.PI / 2 + (d.sides % 2 === 0 ? Math.PI / d.sides : 0);
  const pts = Array.from({ length: d.sides }, (_, i) => {
    const a = offset + (i * 2 * Math.PI) / d.sides;
    return `${(C + Math.cos(a) * R).toFixed(1)},${(C + Math.sin(a) * R).toFixed(1)}`;
  });
  const node = (
    <svg viewBox={`0 0 ${S} ${S}`} aria-hidden="true">
      <polygon points={pts.join(" ")} style={TINT} stroke={INK} strokeWidth="4" strokeLinejoin="round" />
    </svg>
  );
  return { node, label: "A 2D shape with straight sides of equal length.", maxWidth: 220 };
}

function barChart(d: Extract<DiagramSpec, { kind: "bar_chart" }>) {
  const n = d.labels.length;
  const top = Math.max(d.step, Math.ceil(Math.max(...d.values, 0) / d.step) * d.step);
  const ticks = Math.round(top / d.step);
  const padL = 56, padB = 46, padT = d.title ? 42 : 18, padR = 16;
  const slot = Math.max(70, Math.min(110, 520 / n));
  const plotW = slot * n, plotH = 240;
  const W = padL + plotW + padR, H = padT + plotH + padB;
  const Y = (v: number) => padT + plotH - (v / top) * plotH;
  const tickEvery = ticks > 10 ? Math.ceil(ticks / 10) : 1;
  const node = (
    <svg viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
      {d.title && <text x={padL + plotW / 2} y={24} textAnchor="middle" fontSize="19" fontWeight="600" fill={INK}>{d.title}</text>}
      {Array.from({ length: ticks + 1 }, (_, i) => i * d.step).map((v, i) => (
        <g key={i}>
          <line x1={padL} y1={Y(v)} x2={padL + plotW} y2={Y(v)} stroke={i === 0 ? INK : "#dedbd3"} strokeWidth={i === 0 ? 2.5 : 1.5} />
          {i % tickEvery === 0 && <text x={padL - 10} y={Y(v)} textAnchor="end" dominantBaseline="central" fontSize="17" fill={INK}>{fmt(v)}</text>}
        </g>
      ))}
      <line x1={padL} y1={padT - 6} x2={padL} y2={padT + plotH} stroke={INK} strokeWidth="2.5" />
      {d.values.map((v, i) => {
        const bw = slot * 0.58;
        const x0 = padL + i * slot + (slot - bw) / 2;
        return (
          <g key={i}>
            <rect x={x0} y={Y(v)} width={bw} height={Y(0) - Y(v)} style={ACCENT} />
            <text x={x0 + bw / 2} y={padT + plotH + 28} textAnchor="middle" fontSize="18" fill={INK}>{d.labels[i]}</text>
          </g>
        );
      })}
    </svg>
  );
  return {
    node,
    label: `Bar chart${d.title ? ` titled ${d.title}` : ""} with ${n} bars (${d.labels.join(", ")}). The scale goes up in steps of ${fmt(d.step)}.`,
    maxWidth: Math.min(620, W),
  };
}
