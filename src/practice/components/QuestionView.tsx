"use client";

import { useId, useMemo } from "react";
import { normaliseText, shuffledIndices, type Response } from "@/practice/marking";
import type { Question } from "@/practice/types";

export function initResponse(q: Question, seed: string): Response {
  switch (q.type) {
    case "mcq": return { type: "mcq", choice: null };
    case "multi": return { type: "multi", choices: [] };
    case "numeric": return { type: "numeric", value: "" };
    case "text": return { type: "text", value: "" };
    case "order": return { type: "order", order: shuffledIndices(q.items.length, seed + q.id) };
    case "match": return { type: "match", picks: q.pairs.map(() => null) };
    case "truefalse": return { type: "truefalse", values: q.statements.map(() => null) };
    case "cloze": return { type: "cloze", values: q.answer.map(() => "") };
    case "extended": return { type: "extended", written: "", ticked: [] };
  }
}

interface Props {
  q: Question;
  response: Response;
  onChange: (r: Response) => void;
  locked: boolean; // true once marked
  seed: string;
}

const Tick = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true"><path d="M3.5 9.5l3.5 3.5 7.5-8" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
);

export function QuestionInput({ q, response, onChange, locked, seed }: Props) {
  const uid = useId();
  const promptId = `${uid}-prompt`;

  switch (q.type) {
    case "mcq": {
      const r = response as Extract<Response, { type: "mcq" }>;
      return (
        <div className="options" role="radiogroup" aria-labelledby="q-prompt">
          {q.options.map((o, i) => {
            const chosen = r.choice === i;
            const cls = locked ? (i === q.answer ? " is-right" : chosen ? " is-wrong" : "") : "";
            return (
              <button
                key={i}
                type="button"
                role="radio"
                aria-checked={chosen}
                className={`option${cls}`}
                disabled={locked}
                onClick={() => onChange({ type: "mcq", choice: i })}
                onKeyDown={(e) => radioKeys(e, i, q.options.length, (n) => onChange({ type: "mcq", choice: n }))}
                tabIndex={locked ? -1 : chosen || (r.choice === null && i === 0) ? 0 : -1}
                data-testid={`opt-${i}`}
              >
                <span className="mark">{chosen && <Dot />}</span>
                <span>{o}</span>
                {locked && i === q.answer && <span className="tag">Right answer</span>}
                {locked && chosen && i !== q.answer && <span className="tag">Your answer</span>}
              </button>
            );
          })}
        </div>
      );
    }

    case "multi": {
      const r = response as Extract<Response, { type: "multi" }>;
      return (
        <div>
          <p className="muted small" id={promptId} style={{ marginBottom: 10 }}>Choose all the answers that are right.</p>
          <div className="options" role="group" aria-labelledby="q-prompt">
            {q.options.map((o, i) => {
              const chosen = r.choices.includes(i);
              const should = q.answer.includes(i);
              const cls = locked ? (should ? " is-right" : chosen ? " is-wrong" : "") : "";
              return (
                <button
                  key={i}
                  type="button"
                  role="checkbox"
                  aria-checked={chosen}
                  className={`option${cls}`}
                  disabled={locked}
                  onClick={() => onChange({ type: "multi", choices: chosen ? r.choices.filter((c) => c !== i) : [...r.choices, i] })}
                  data-testid={`opt-${i}`}
                >
                  <span className="mark">{chosen && <Tick />}</span>
                  <span>{o}</span>
                  {locked && should && <span className="tag">{chosen ? "Right" : "Missed"}</span>}
                  {locked && chosen && !should && <span className="tag">Not right</span>}
                </button>
              );
            })}
          </div>
        </div>
      );
    }

    case "numeric":
    case "text": {
      const r = response as { type: "numeric" | "text"; value: string };
      const id = `${uid}-in`;
      return (
        <div className="field">
          <label htmlFor={id}>Your answer</label>
          <div className="num-input">
            <input
              id={id}
              className="input"
              type="text"
              inputMode={q.type === "numeric" ? "decimal" : "text"}
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              value={r.value}
              readOnly={locked}
              onChange={(e) => onChange({ type: q.type, value: e.target.value } as Response)}
              style={q.type === "text" ? { maxWidth: 420 } : undefined}
              data-testid="answer-input"
            />
            {q.type === "numeric" && q.unit && <span className="unit">{q.unit}</span>}
          </div>
        </div>
      );
    }

    case "order":
      return <OrderInput q={q} response={response as Extract<Response, { type: "order" }>} onChange={onChange} locked={locked} />;

    case "match":
      return <MatchInput q={q} response={response as Extract<Response, { type: "match" }>} onChange={onChange} locked={locked} seed={seed} />;

    case "truefalse": {
      const r = response as Extract<Response, { type: "truefalse" }>;
      return (
        <div className="tf-list">
          {q.statements.map((s, i) => {
            const v = r.values[i];
            const cls = locked ? (v === s.a ? " is-right" : " is-wrong") : "";
            const set = (val: boolean) => {
              const values = [...r.values];
              values[i] = val;
              onChange({ type: "truefalse", values });
            };
            return (
              <div key={i} className={`tf-row${cls}`}>
                <span id={`${uid}-s${i}`}>
                  {s.s}
                  {locked && v !== s.a && <strong className="small" style={{ display: "block", color: "var(--bad)" }}>This is {s.a ? "true" : "false"}.</strong>}
                </span>
                <span className="seg" role="radiogroup" aria-labelledby={`${uid}-s${i}`}>
                  {[true, false].map((val) => (
                    <button
                      key={String(val)}
                      type="button"
                      role="radio"
                      aria-checked={v === val}
                      disabled={locked}
                      onClick={() => set(val)}
                      onKeyDown={(e) => radioKeys(e, val ? 0 : 1, 2, (n) => set(n === 0))}
                      tabIndex={locked ? -1 : v === val || (v === null && val) ? 0 : -1}
                      data-testid={`tf-${i}-${val ? "t" : "f"}`}
                    >
                      {val ? "True" : "False"}
                    </button>
                  ))}
                </span>
              </div>
            );
          })}
        </div>
      );
    }

    case "cloze": {
      const r = response as Extract<Response, { type: "cloze" }>;
      const parts = q.prompt.split(/_{3,}/);
      return (
        <p className="cloze">
          {parts.map((p, i) => (
            <span key={i}>
              {p}
              {i < parts.length - 1 && (
                <input
                  className={`input${locked ? (gapRight(q, i, r.values[i]) ? " is-right" : " is-wrong") : ""}`}
                  aria-label={`Gap ${i + 1} of ${parts.length - 1}`}
                  value={r.values[i] ?? ""}
                  readOnly={locked}
                  autoComplete="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  onChange={(e) => {
                    const values = [...r.values];
                    values[i] = e.target.value;
                    onChange({ type: "cloze", values });
                  }}
                  data-testid={`gap-${i}`}
                />
              )}
            </span>
          ))}
        </p>
      );
    }

    case "extended": {
      const r = response as Extract<Response, { type: "extended" }>;
      const id = `${uid}-ext`;
      return (
        <div className="field">
          <label htmlFor={id}>Write your answer</label>
          <p className="hint">Write it here or on paper. Then check it against the model answer and tick the points you made.</p>
          <textarea
            id={id}
            className="input"
            value={r.written}
            readOnly={locked}
            onChange={(e) => onChange({ ...r, written: e.target.value })}
            data-testid="extended-input"
          />
        </div>
      );
    }
  }
}

function gapRight(q: Extract<Question, { type: "cloze" }>, i: number, v: string | undefined) {
  return [q.answer[i], ...(q.accept?.[i] ?? [])].some((a) => normaliseText(a) === normaliseText(v ?? ""));
}

const Dot = () => <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><circle cx="6" cy="6" r="5" fill="currentColor" /></svg>;

function radioKeys(e: React.KeyboardEvent, i: number, n: number, set: (n: number) => void) {
  const next = e.key === "ArrowDown" || e.key === "ArrowRight" ? (i + 1) % n : e.key === "ArrowUp" || e.key === "ArrowLeft" ? (i - 1 + n) % n : -1;
  if (next < 0) return;
  e.preventDefault();
  set(next);
  const group = (e.currentTarget as HTMLElement).parentElement;
  (group?.querySelectorAll<HTMLElement>('[role="radio"]')[next])?.focus();
}

function OrderInput({ q, response, onChange, locked }: { q: Extract<Question, { type: "order" }>; response: Extract<Response, { type: "order" }>; onChange: (r: Response) => void; locked: boolean }) {
  const move = (pos: number, dir: -1 | 1, ev: React.MouseEvent<HTMLButtonElement>) => {
    const order = [...response.order];
    const to = pos + dir;
    [order[pos], order[to]] = [order[to], order[pos]];
    onChange({ type: "order", order });
    // keep keyboard focus on the same item's button after it moves
    const list = ev.currentTarget.closest("ol");
    requestAnimationFrame(() => {
      const btn = list?.querySelectorAll<HTMLButtonElement>("li")[to]?.querySelector<HTMLButtonElement>(dir < 0 ? "[data-up]" : "[data-down]");
      if (btn && !btn.disabled) btn.focus();
      else list?.querySelectorAll<HTMLButtonElement>("li")[to]?.querySelector<HTMLButtonElement>("button:not([disabled])")?.focus();
    });
  };
  return (
    <div>
      <p className="muted small" style={{ marginBottom: 10 }}>Use the arrow buttons to move each item up or down. Put the first one at the top.</p>
      <ol className="order-list" aria-label="Items to put in order">
        {response.order.map((itemIdx, pos) => {
          const cls = locked ? (itemIdx === pos ? " is-right" : " is-wrong") : "";
          return (
            <li key={itemIdx} className={`order-item${cls}`} data-testid={`order-item-${pos}`}>
              <span className="pos" aria-hidden="true">{pos + 1}</span>
              <span className="txt">
                {q.items[itemIdx]}
                {locked && itemIdx !== pos && <span className="small" style={{ display: "block", color: "var(--bad)", fontWeight: 600 }}>Should be number {itemIdx + 1}</span>}
              </span>
              {!locked && (
                <span className="moves">
                  <button type="button" className="icon-btn" data-up aria-label={`Move "${q.items[itemIdx]}" up`} disabled={pos === 0} onClick={(e) => move(pos, -1, e)}>
                    <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true"><path d="M4 12l6-6 6 6" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                  </button>
                  <button type="button" className="icon-btn" data-down aria-label={`Move "${q.items[itemIdx]}" down`} disabled={pos === response.order.length - 1} onClick={(e) => move(pos, 1, e)}>
                    <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true"><path d="M4 8l6 6 6-6" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                  </button>
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function MatchInput({ q, response, onChange, locked, seed }: { q: Extract<Question, { type: "match" }>; response: Extract<Response, { type: "match" }>; onChange: (r: Response) => void; locked: boolean; seed: string }) {
  const uid = useId();
  const rightOrder = useMemo(() => shuffledIndices(q.pairs.length, seed + q.id + "r"), [q, seed]);
  return (
    <div className={`match-grid${Math.max(...q.pairs.map((p) => p[1].length)) > 28 ? " match-long" : ""}`}>
      {q.pairs.map(([left], i) => {
        const pick = response.picks[i];
        const cls = locked ? (pick === i ? " is-right" : " is-wrong") : "";
        const id = `${uid}-m${i}`;
        return (
          <div key={i} className={`match-row${cls}`}>
            <label htmlFor={id} className="left">{left}</label>
            <div>
              <select
                id={id}
                className="input"
                value={pick === null ? "" : String(pick)}
                disabled={locked}
                onChange={(e) => {
                  const picks = [...response.picks];
                  picks[i] = e.target.value === "" ? null : Number(e.target.value);
                  onChange({ type: "match", picks });
                }}
                data-testid={`match-${i}`}
              >
                <option value="">Choose...</option>
                {rightOrder.map((ri) => (
                  <option key={ri} value={ri}>{q.pairs[ri][1]}</option>
                ))}
              </select>
              {pick !== null && q.pairs[pick][1].length > 55 && (!locked || pick === i) && <span className="small match-full">{q.pairs[pick][1]}</span>}
              {locked && pick !== i && <span className="small" style={{ display: "block", color: "var(--bad)", fontWeight: 600, marginTop: 4 }}>Answer: {q.pairs[i][1]}</span>}
            </div>
          </div>
        );
      })}
    </div>
  );
}
