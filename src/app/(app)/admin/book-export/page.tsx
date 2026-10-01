import { requireAdmin } from "@/lib/auth";
import { getStore } from "@/lib/db";
import { answerText, hrefWith, pageOf, param, selectIn } from "@/lib/admin";
import { PUBLIC_Q, subjects as allSubjects, yearGroups } from "@/lib/repo";
import { ButtonLink, EmptyState, Page, PageHeader } from "@/components/ui";
import { Filters, n, type SP } from "../_ui";
import { PrintButton } from "./PrintButton";

export const metadata = { title: "Book export" };

const UNITS_PER_PAGE = 5;
const KINDS = ["key_learning_point", "keyword", "misconception"];

/** Hides the site chrome and admin controls when printing this page only. */
const PRINT_CSS = `
@media print {
  body > header, body > footer, .admin-nav, .no-print { display: none !important; }
  body { background: #fff; }
  .book-unit { break-before: page; border: 0 !important; box-shadow: none !important; padding: 0 !important; }
  .book-unit:first-of-type { break-before: auto; }
  .book-lesson, .book-q { break-inside: avoid; }
  a { color: inherit; text-decoration: none; }
}`;

interface UnitRow {
  id: string;
  title: string;
  description: string | null;
  attribution_text: string | null;
  sort: number;
}
interface LessonRow {
  id: string;
  unit_id: string | null;
  title: string;
  pupil_outcome: string | null;
  attribution_text: string | null;
}
interface BlockRow {
  id: string;
  lesson_id: string;
  kind: string;
  title: string | null;
  body: string;
  sort: number;
  attribution_text: string | null;
}
interface QRow {
  id: string;
  lesson_id: string;
  qtype: string;
  prompt_text: string;
  marks: number;
  sort: number;
  attribution_text: string | null;
}

export default async function BookExportPage({ searchParams }: { searchParams: Promise<SP> }) {
  await requireAdmin();
  const sp = await searchParams;
  const store = await getStore();
  const [years, subs] = await Promise.all([yearGroups(), allSubjects()]);
  const year = param(sp.year) ?? "y6";
  const subject = param(sp.subject) ?? "mathematics";
  const unitId = param(sp.unit);
  const page = pageOf(sp.page);

  const allUnits = await store.select<UnitRow>("units", {
    where: { year_group_id: year, subject_id: subject, third_party_flag: 0 },
    columns: ["id", "title", "description", "attribution_text", "sort"],
    orderBy: [["sort", "asc"], ["title", "asc"]],
  });
  const chosen = unitId ? allUnits.filter((u) => u.id === unitId) : allUnits.slice((page - 1) * UNITS_PER_PAGE, page * UNITS_PER_PAGE);
  const unitIds = chosen.map((u) => u.id);

  // lessons in unit order (unit_lessons first, falling back to lessons.unit_id)
  const ul = await selectIn<{ unit_id: string; lesson_id: string; position: number }>(store, "unit_lessons", "unit_id", unitIds, { orderBy: [["position", "asc"]] });
  const direct = await selectIn<{ id: string; unit_id: string }>(store, "lessons", "unit_id", unitIds, { columns: ["id", "unit_id"], orderBy: [["sort", "asc"]] });
  const order = new Map<string, string[]>();
  for (const u of unitIds) order.set(u, []);
  for (const r of ul) if (!order.get(r.unit_id)!.includes(r.lesson_id)) order.get(r.unit_id)!.push(r.lesson_id);
  for (const r of direct) if (!order.get(r.unit_id)!.includes(r.id)) order.get(r.unit_id)!.push(r.id);
  const lessonIds = [...order.values()].flat();

  const [lessons, blocks, qs] = await Promise.all([
    selectIn<LessonRow>(store, "lessons", "id", lessonIds, { columns: ["id", "unit_id", "title", "pupil_outcome", "attribution_text"], where: { third_party_flag: 0 } }),
    selectIn<BlockRow>(store, "content_blocks", "lesson_id", lessonIds, { where: { kind: KINDS, third_party_flag: 0 }, orderBy: [["sort", "asc"]] }),
    selectIn<QRow>(store, "questions", "lesson_id", lessonIds, { columns: ["id", "lesson_id", "qtype", "prompt_text", "marks", "sort", "attribution_text"], where: { ...PUBLIC_Q }, orderBy: [["sort", "asc"], ["id", "asc"]] }),
  ]);
  const qIds = qs.map((q) => q.id);
  const [opts, answers, ms] = await Promise.all([
    selectIn<{ question_id: string; text: string; is_correct: number; side: string | null; match_key: string | null; correct_position: number | null; sort: number; label: string | null }>(store, "question_options", "question_id", qIds, { orderBy: [["sort", "asc"]] }),
    selectIn<{ question_id: string; part: string; answer: string }>(store, "accepted_answers", "question_id", qIds, { orderBy: [["id", "asc"]] }),
    selectIn<{ question_id: string; answer_text: string }>(store, "mark_scheme_entries", "question_id", qIds, { orderBy: [["sort", "asc"]] }),
  ]);
  const group = <T,>(rows: T[], key: (r: T) => string) => {
    const m = new Map<string, T[]>();
    for (const r of rows) (m.get(key(r)) ?? m.set(key(r), []).get(key(r))!).push(r);
    return m;
  };
  const lessonById = new Map(lessons.map((l) => [l.id, l]));
  const blocksBy = group(blocks, (b) => b.lesson_id);
  const qsBy = group(qs, (q) => q.lesson_id);
  const optsBy = group(opts, (o) => o.question_id);
  const ansBy = group(answers, (a) => a.question_id);
  const msBy = group(ms, (m) => m.question_id);
  const pages = Math.max(1, Math.ceil(allUnits.length / UNITS_PER_PAGE));
  const yearName = years.find((y) => y.id === year)?.name ?? year;
  const subjName = subs.find((s) => s.id === subject)?.name ?? subject;

  return (
    <Page>
      <style>{PRINT_CSS}</style>
      <div className="no-print">
        <PageHeader title="Book export" subtitle="Book-ready units: key learning, keywords, misconceptions and public questions with answers." actions={<PrintButton />} />
        <Filters
          path="/admin/book-export"
          sp={{ ...sp, year, subject }}
          defs={[
            { name: "year", label: "Year group", options: years.map((y) => [y.id, y.name]) },
            { name: "subject", label: "Subject", options: subs.map((s) => [s.id, s.name]) },
            { name: "unit", label: "Unit", any: `All units (${allUnits.length})`, options: allUnits.map((u) => [u.id, u.title]) },
          ]}
        />
      </div>
      <h1 className="mb-3 text-[length:var(--font-size-lg)] font-semibold">
        {subjName} · {yearName}
      </h1>
      {!chosen.length ? (
        <EmptyState title="No units for this year group and subject." />
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {chosen.map((u) => {
            const ls = (order.get(u.id) ?? []).map((id) => lessonById.get(id)).filter(Boolean) as LessonRow[];
            const attrib = new Set<string>();
            if (u.attribution_text) attrib.add(u.attribution_text);
            return (
              <article key={u.id} className="book-unit rounded-[var(--radius-lg)] border border-border bg-surface p-4">
                <h2 className="text-[length:var(--font-size-xl)] font-semibold">{u.title}</h2>
                {u.description && <p className="mt-1 text-sm text-muted">{u.description}</p>}
                {ls.map((l, li) => {
                  if (l.attribution_text) attrib.add(l.attribution_text);
                  const bl = blocksBy.get(l.id) ?? [];
                  const lq = qsBy.get(l.id) ?? [];
                  for (const b of bl) if (b.attribution_text) attrib.add(b.attribution_text);
                  for (const q of lq) if (q.attribution_text) attrib.add(q.attribution_text);
                  const of = (k: string) => bl.filter((b) => b.kind === k);
                  return (
                    <section key={l.id} className="book-lesson mt-4 border-t border-border pt-3">
                      <h3 className="font-semibold">
                        {li + 1}. {l.title}
                      </h3>
                      {l.pupil_outcome && <p className="text-sm text-muted">{l.pupil_outcome}</p>}
                      {of("key_learning_point").length > 0 && (
                        <>
                          <h4 className="mt-2 text-sm font-semibold">Key learning</h4>
                          <ul className="list-disc pl-5 text-sm">
                            {of("key_learning_point").map((b) => (
                              <li key={b.id}>{b.body}</li>
                            ))}
                          </ul>
                        </>
                      )}
                      {of("keyword").length > 0 && (
                        <>
                          <h4 className="mt-2 text-sm font-semibold">Keywords</h4>
                          <dl className="text-sm">
                            {of("keyword").map((b) => (
                              <div key={b.id}>
                                <dt className="inline font-medium">{b.title ?? "Keyword"}: </dt>
                                <dd className="inline">{b.body}</dd>
                              </div>
                            ))}
                          </dl>
                        </>
                      )}
                      {of("misconception").length > 0 && (
                        <>
                          <h4 className="mt-2 text-sm font-semibold">Common misconceptions</h4>
                          <ul className="list-disc pl-5 text-sm">
                            {of("misconception").map((b) => (
                              <li key={b.id}>
                                {b.title && <span className="font-medium">{b.title} </span>}
                                {b.body}
                              </li>
                            ))}
                          </ul>
                        </>
                      )}
                      {lq.length > 0 && (
                        <>
                          <h4 className="mt-2 text-sm font-semibold">Practice questions</h4>
                          <ol className="list-decimal pl-5 text-sm">
                            {lq.map((q) => {
                              const qo = optsBy.get(q.id) ?? [];
                              return (
                                <li key={q.id} className="book-q mb-2">
                                  <p className="whitespace-pre-line">{q.prompt_text}</p>
                                  {q.qtype === "mcq" || q.qtype === "multi_select" ? (
                                    <ul className="ml-1 text-sm">
                                      {qo.map((o, i) => (
                                        <li key={i}>
                                          {o.label ?? String.fromCharCode(65 + i)}. {o.text}
                                        </li>
                                      ))}
                                    </ul>
                                  ) : null}
                                  <p className="text-xs text-muted">Answer: {answerText(q.qtype, qo, ansBy.get(q.id) ?? [], (msBy.get(q.id) ?? []).map((m) => m.answer_text)) || "–"}</p>
                                </li>
                              );
                            })}
                          </ol>
                        </>
                      )}
                    </section>
                  );
                })}
                {!ls.length && <p className="mt-2 text-sm text-muted">No lessons in this unit.</p>}
                <footer className="mt-4 border-t border-border pt-2 text-xs text-muted">
                  <p className="font-medium">Attribution</p>
                  {attrib.size ? (
                    <ul className="list-disc pl-4">
                      {[...attrib].map((a) => (
                        <li key={a}>{a}</li>
                      ))}
                    </ul>
                  ) : (
                    <p>Original Eduworks content.</p>
                  )}
                </footer>
              </article>
            );
          })}
        </div>
      )}
      {!unitId && pages > 1 && (
        <nav className="no-print mt-3 flex flex-wrap items-center justify-between gap-2 text-sm" aria-label="Pagination">
          <span className="text-muted">
            Units {(page - 1) * UNITS_PER_PAGE + 1}–{Math.min(page * UNITS_PER_PAGE, allUnits.length)} of {n(allUnits.length)}
          </span>
          <span className="flex gap-2">
            {page > 1 && (
              <ButtonLink variant="secondary" href={hrefWith("/admin/book-export", { ...sp, year, subject }, { page: page - 1 })}>
                ← Prev
              </ButtonLink>
            )}
            {page < pages && (
              <ButtonLink variant="secondary" href={hrefWith("/admin/book-export", { ...sp, year, subject }, { page: page + 1 })}>
                Next →
              </ButtonLink>
            )}
          </span>
        </nav>
      )}
    </Page>
  );
}
