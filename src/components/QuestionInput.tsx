"use client";
/* eslint-disable @next/next/no-img-element */
import type { PlayableQuestion } from "@/lib/repo";
import type { Response } from "@/lib/questions/types";

export type Draft = Response | null;

const optBox = (selected: boolean, state?: "right" | "wrong") =>
  `flex min-h-[48px] w-full items-center gap-3 rounded-[var(--radius-md)] border px-3 py-2 text-left ${
    state === "right" ? "border-success bg-success-soft" : state === "wrong" ? "border-danger bg-danger-soft" : selected ? "border-primary bg-primary-soft" : "border-border bg-surface"
  }`;

export function QuestionPrompt({ q }: { q: PlayableQuestion }) {
  return (
    <div className="mb-3">
      <p className="whitespace-pre-line text-[length:var(--font-size-lg)]">{q.prompt}</p>
      {q.images.map((im) => (
        <img key={im.path} src={im.path.startsWith("http") || im.path.startsWith("/") ? im.path : `/${im.path}`} alt={im.alt ?? "Question image"} className="mt-2 max-w-full rounded-[var(--radius-md)] border border-border bg-surface" />
      ))}
      <p className="mt-1 text-xs text-muted">
        {q.marks} mark{q.marks === 1 ? "" : "s"}
      </p>
    </div>
  );
}

export function QuestionInput({
  q,
  value,
  onChange,
  disabled,
  parts,
  correctIds,
}: {
  q: PlayableQuestion;
  value: Draft;
  onChange: (v: Draft) => void;
  disabled?: boolean;
  parts?: Record<string, boolean> | null;
  correctIds?: string[];
}) {
  switch (q.qtype) {
    case "mcq": {
      const sel = value && "optionId" in value ? value.optionId : null;
      return (
        <div className="grid gap-2" role="radiogroup">
          {q.options.map((o) => (
            <button
              key={o.id}
              type="button"
              role="radio"
              aria-checked={sel === o.id}
              disabled={disabled}
              onClick={() => onChange({ optionId: o.id })}
              className={optBox(sel === o.id, disabled && correctIds ? (correctIds.includes(o.id) ? "right" : sel === o.id ? "wrong" : undefined) : undefined)}
            >
              {o.label && <span className="font-semibold text-muted">{o.label}</span>}
              <span>{o.text}</span>
            </button>
          ))}
        </div>
      );
    }
    case "multi_select": {
      const sel = new Set(value && "optionIds" in value ? value.optionIds : []);
      return (
        <div className="grid gap-2">
          <p className="text-xs text-muted">Choose all that apply.</p>
          {q.options.map((o) => (
            <button
              key={o.id}
              type="button"
              role="checkbox"
              aria-checked={sel.has(o.id)}
              disabled={disabled}
              onClick={() => {
                const n = new Set(sel);
                if (n.has(o.id)) n.delete(o.id);
                else n.add(o.id);
                onChange({ optionIds: [...n] });
              }}
              className={optBox(sel.has(o.id))}
            >
              <span aria-hidden>{sel.has(o.id) ? "☑" : "☐"}</span>
              <span>{o.text}</span>
            </button>
          ))}
        </div>
      );
    }
    case "numeric":
    case "text_exact": {
      const v = value && "value" in value ? value.value : "";
      const wantsText = q.qtype === "text_exact" || /[/½¼¾]|fraction/i.test(q.prompt);
      return (
        <input
          aria-label="Your answer"
          className="block min-h-[52px] w-full rounded-[var(--radius-md)] border border-border bg-surface px-3 text-[length:var(--font-size-lg)]"
          inputMode={wantsText ? "text" : "decimal"}
          autoComplete="off"
          autoCapitalize="off"
          value={v}
          disabled={disabled}
          onChange={(e) => onChange({ value: e.target.value })}
          placeholder="Type your answer"
        />
      );
    }
    case "ordering": {
      const order = value && "order" in value ? value.order : q.options.map((o) => o.id);
      const byId = new Map(q.options.map((o) => [o.id, o]));
      const move = (i: number, d: number) => {
        const n = [...order];
        const j = i + d;
        if (j < 0 || j >= n.length) return;
        [n[i], n[j]] = [n[j], n[i]];
        onChange({ order: n });
      };
      return (
        <ol className="grid gap-2">
          {order.map((id, i) => (
            <li key={id} className="flex items-center gap-2 rounded-[var(--radius-md)] border border-border bg-surface p-2">
              <span className="w-6 text-center font-semibold text-muted">{i + 1}</span>
              <span className="flex-1">{byId.get(id)?.text}</span>
              <button type="button" className="min-h-[44px] min-w-[44px] rounded border border-border" disabled={disabled || i === 0} onClick={() => move(i, -1)} aria-label="Move up">
                ↑
              </button>
              <button type="button" className="min-h-[44px] min-w-[44px] rounded border border-border" disabled={disabled || i === order.length - 1} onClick={() => move(i, 1)} aria-label="Move down">
                ↓
              </button>
            </li>
          ))}
        </ol>
      );
    }
    case "matching": {
      const pairs = value && "pairs" in value ? value.pairs : {};
      const lefts = q.options.filter((o) => o.side === "L");
      const rights = q.options.filter((o) => o.side === "R");
      return (
        <div className="grid gap-3">
          {lefts.map((l) => (
            <div key={l.id} className={`rounded-[var(--radius-md)] border p-2 ${parts ? (parts[l.id] ? "border-success bg-success-soft" : "border-danger bg-danger-soft") : "border-border bg-surface"}`}>
              <label className="mb-1 block font-medium" htmlFor={`m-${l.id}`}>
                {l.text}
              </label>
              <select
                id={`m-${l.id}`}
                className="block min-h-[44px] w-full rounded border border-border bg-surface px-2"
                value={pairs[l.id] ?? ""}
                disabled={disabled}
                onChange={(e) => onChange({ pairs: { ...pairs, [l.id]: e.target.value } })}
              >
                <option value="">Choose a match…</option>
                {rights.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.text}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </div>
      );
    }
    case "table_fill": {
      const cells = value && "cells" in value ? value.cells : {};
      const t = q.table;
      if (!t) return <p className="text-sm text-muted">Table unavailable.</p>;
      return (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                <th />
                {t.cols.map((c) => (
                  <th key={c} className="border border-border bg-surface-muted p-2">
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {t.rows.map((r, ri) => (
                <tr key={r}>
                  <th className="border border-border bg-surface-muted p-2 text-left">{r}</th>
                  {t.cols.map((_, ci) => {
                    const cell = t.cells.find((c) => c.row === ri && c.col === ci);
                    return (
                      <td key={ci} className={`border border-border p-1 ${cell && parts ? (parts[cell.id] ? "bg-success-soft" : "bg-danger-soft") : ""}`}>
                        {cell?.given !== undefined ? (
                          <span className="px-2">{cell.given}</span>
                        ) : cell ? (
                          <input
                            aria-label={`${r}, ${t.cols[ci]}`}
                            className="min-h-[40px] w-full min-w-[60px] rounded border border-border px-2"
                            value={cells[cell.id] ?? ""}
                            disabled={disabled}
                            onChange={(e) => onChange({ cells: { ...cells, [cell.id]: e.target.value } })}
                          />
                        ) : null}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }
    case "self_mark": {
      const text = value && "text" in value ? (value.text ?? "") : "";
      return (
        <textarea
          aria-label="Your answer or working"
          className="block min-h-[120px] w-full rounded-[var(--radius-md)] border border-border bg-surface p-3"
          placeholder="Write your answer or working here (or on paper), then check it against the mark scheme."
          value={text}
          disabled={disabled}
          onChange={(e) => onChange({ awarded: 0, text: e.target.value })}
        />
      );
    }
  }
}

export function hasAnswer(q: PlayableQuestion, v: Draft): boolean {
  if (!v) return q.qtype === "ordering" || q.qtype === "self_mark";
  if ("optionId" in v) return !!v.optionId;
  if ("optionIds" in v) return v.optionIds.length > 0;
  if ("value" in v) return v.value.trim() !== "";
  if ("order" in v) return true;
  if ("pairs" in v) return q.options.filter((o) => o.side === "L").every((l) => v.pairs[l.id]);
  if ("cells" in v) return Object.values(v.cells).some((x) => x.trim() !== "");
  return true;
}

export function defaultResponse(q: PlayableQuestion, v: Draft): Draft {
  if (v) return v;
  if (q.qtype === "ordering") return { order: q.options.map((o) => o.id) };
  if (q.qtype === "self_mark") return { awarded: 0 };
  return null;
}

/** Tick boxes for self-marking against the mark scheme (one per available mark). */
export function SelfMark({
  marks,
  markScheme,
  awarded,
  onChange,
  locked,
}: {
  marks: number;
  markScheme: Array<{ answer_text: string; guidance: string | null; marks: number | null }>;
  awarded: number;
  onChange: (n: number) => void;
  locked?: boolean;
}) {
  return (
    <div className="mt-3 rounded-[var(--radius-md)] border border-border bg-surface-muted p-3">
      <p className="mb-1 text-sm font-semibold">Mark scheme</p>
      {markScheme.length ? (
        markScheme.map((m, i) => (
          <div key={i} className="mb-2 text-sm">
            <p className="whitespace-pre-line">{m.answer_text}</p>
            {m.guidance && <p className="mt-1 whitespace-pre-line text-xs text-muted">{m.guidance}</p>}
          </div>
        ))
      ) : (
        <p className="text-sm text-muted">No mark scheme text available.</p>
      )}
      <p className="mt-2 text-sm font-medium">Tick the marks earned:</p>
      <div className="mt-1 flex flex-wrap gap-2">
        {Array.from({ length: marks }, (_, i) => (
          <label key={i} className="flex min-h-[44px] items-center gap-2 rounded border border-border bg-surface px-3">
            <input type="checkbox" className="h-5 w-5" checked={awarded > i} disabled={locked} onChange={(e) => onChange(e.target.checked ? i + 1 : i)} />
            Mark {i + 1}
          </label>
        ))}
      </div>
    </div>
  );
}
