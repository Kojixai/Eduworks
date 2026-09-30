/**
 * Progress calculations for the parent dashboard. Pure functions over attempts/results so they
 * are easy to test and identical on SQLite and Supabase.
 */
export interface AttemptLite {
  id: string;
  kind: string;
  ref_id: string | null;
  title?: string | null;
  started_at: string;
  finished_at: string | null;
  score: number | null;
  max_score: number | null;
}

export interface ResultLite {
  attempt_id: string;
  marks_awarded: number;
  max_marks: number;
  statement_ids_json: string | null;
}

export interface TopicScore {
  key: string;
  marks: number;
  max: number;
  pct: number;
  attempts: number;
}

export const pct = (m: number, max: number) => (max > 0 ? Math.round((m / max) * 100) : 0);

/** Aggregate marks per curriculum statement across all results. */
export function scoresByStatement(results: ResultLite[]): TopicScore[] {
  const m = new Map<string, { marks: number; max: number; attempts: Set<string> }>();
  for (const r of results) {
    let ids: string[] = [];
    try {
      ids = r.statement_ids_json ? JSON.parse(r.statement_ids_json) : [];
    } catch {
      ids = [];
    }
    for (const id of new Set(ids)) {
      const e = m.get(id) ?? { marks: 0, max: 0, attempts: new Set<string>() };
      e.marks += r.marks_awarded;
      e.max += r.max_marks;
      e.attempts.add(r.attempt_id);
      m.set(id, e);
    }
  }
  return [...m.entries()].map(([key, e]) => ({ key, marks: e.marks, max: e.max, pct: pct(e.marks, e.max), attempts: e.attempts.size }));
}

/** Best and latest score per paper / quiz reference. */
export function scoresByRef(attempts: AttemptLite[]) {
  const m = new Map<string, { kind: string; title: string; best: number; latest: number; attempts: number; lastAt: string }>();
  for (const a of attempts.filter((x) => x.finished_at && x.max_score)) {
    const key = `${a.kind}:${a.ref_id ?? ""}`;
    const p = pct(a.score ?? 0, a.max_score ?? 0);
    const e = m.get(key);
    if (!e) m.set(key, { kind: a.kind, title: a.title ?? a.ref_id ?? a.kind, best: p, latest: p, attempts: 1, lastAt: a.finished_at! });
    else {
      e.best = Math.max(e.best, p);
      e.attempts++;
      if (a.finished_at! > e.lastAt) {
        e.latest = p;
        e.lastAt = a.finished_at!;
      }
    }
  }
  return [...m.entries()].map(([key, v]) => ({ key, ...v }));
}

/** Weak areas: enough evidence (>= minMax marks available) and below the threshold, weakest first. */
export function weakAreas(scores: TopicScore[], threshold = 60, minMax = 3): TopicScore[] {
  return scores.filter((s) => s.max >= minMax && s.pct < threshold).sort((a, b) => a.pct - b.pct || b.max - a.max);
}

/** Calendar date in UK time, so a 9pm session counts for that day. */
export function ukDate(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
}

/**
 * Current streak: consecutive UK days with at least one finished attempt, counting back from
 * today (or from yesterday, so the streak isn't lost before today's practice).
 */
export function streakDays(attempts: AttemptLite[], nowIso = new Date().toISOString()): number {
  const days = new Set(attempts.filter((a) => a.finished_at).map((a) => ukDate(a.finished_at!)));
  if (!days.size) return 0;
  const dayMs = 86_400_000;
  let cursor = new Date(nowIso).getTime();
  if (!days.has(ukDate(new Date(cursor).toISOString()))) {
    cursor -= dayMs;
    if (!days.has(ukDate(new Date(cursor).toISOString()))) return 0;
  }
  let n = 0;
  while (days.has(ukDate(new Date(cursor).toISOString()))) {
    n++;
    cursor -= dayMs;
  }
  return n;
}

/** Stars per finished attempt: 1 for >= 50%, 2 for >= 80%, 3 for 100%. */
export function starsFor(score: number, max: number): number {
  if (max <= 0) return 0;
  const p = score / max;
  return p >= 1 ? 3 : p >= 0.8 ? 2 : p >= 0.5 ? 1 : 0;
}
export const totalStars = (attempts: AttemptLite[]) =>
  attempts.filter((a) => a.finished_at).reduce((s, a) => s + starsFor(a.score ?? 0, a.max_score ?? 0), 0);

/** Incremental topic_progress update rows for one finished attempt. */
export function topicProgressDeltas(studentId: string, results: ResultLite[], extraKeys: Array<{ key: string; kind: string }>) {
  const deltas = new Map<string, { topic_kind: string; marks: number; max: number }>();
  for (const r of results) {
    const ids: string[] = r.statement_ids_json ? JSON.parse(r.statement_ids_json) : [];
    for (const id of new Set(ids)) {
      const d = deltas.get(id) ?? { topic_kind: "statement", marks: 0, max: 0 };
      d.marks += r.marks_awarded;
      d.max += r.max_marks;
      deltas.set(id, d);
    }
  }
  const total = results.reduce((s, r) => ({ m: s.m + r.marks_awarded, x: s.x + r.max_marks }), { m: 0, x: 0 });
  for (const k of extraKeys) deltas.set(k.key, { topic_kind: k.kind, marks: total.m, max: total.x });
  return [...deltas.entries()].map(([topic_key, d]) => ({ student_id: studentId, topic_key, ...d }));
}
