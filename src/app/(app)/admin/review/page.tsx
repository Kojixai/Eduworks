import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { getStore } from "@/lib/db";
import { answerText, hrefWith, pageOf, param, selectIn } from "@/lib/admin";
import type { Statement } from "@/lib/repo";
import { Badge, Button, Card, CurriculumText, EmptyState, Page, PageHeader } from "@/components/ui";
import { Pager, n, type SP } from "../_ui";
import { reviewLinkAction } from "./actions";
import { Flash, QuestionEditForm, ReviewButtons } from "./forms";

export const metadata = { title: "Review queue" };

const SIZE = 20;

interface QRow {
  id: string;
  prompt_text: string;
  explanation: string | null;
  marks: number;
  qtype: string;
  quiz_kind: string;
  review_notes: string | null;
  review_status: string;
  extraction_confidence: number;
  source_id: string | null;
  key_stage_id: string | null;
  subject_id: string | null;
  third_party_flag: number;
}

export default async function ReviewPage({ searchParams }: { searchParams: Promise<SP> }) {
  await requireAdmin();
  const sp = await searchParams;
  const tab = param(sp.tab) === "links" ? "links" : "questions";
  const page = pageOf(sp.page);
  const store = await getStore();
  const self = hrefWith("/admin/review", sp, { done: undefined });
  const done = param(sp.done);
  const method = param(sp.method) ?? "reasoned";
  const linkWhere = { review_status: "needs_review", ...(method === "all" ? {} : { method }) };
  const [qCount, lCount] = await Promise.all([store.count("questions", { review_status: "needs_review" }), store.count("unit_statement_links", linkWhere)]);

  const tabs = (
    <div className="mb-4 flex gap-1 border-b border-border" role="tablist">
      {(
        [
          ["questions", `Questions (${n(qCount)})`],
          ["links", `Statement links (${n(lCount)})`],
        ] as const
      ).map(([t, label]) => (
        <Link
          key={t}
          role="tab"
          aria-selected={tab === t}
          href={t === "questions" ? "/admin/review" : "/admin/review?tab=links"}
          className={`-mb-px inline-flex min-h-[44px] items-center border-b-2 px-3 text-sm no-underline ${tab === t ? "border-primary font-medium text-primary" : "border-transparent text-muted"}`}
        >
          {label}
        </Link>
      ))}
    </div>
  );

  if (tab === "links") {
    const links = await store.select<{ unit_id: string; statement_id: string; method: string; confidence: number }>("unit_statement_links", {
      where: linkWhere,
      orderBy: [["confidence", "desc"], ["unit_id", "asc"], ["statement_id", "asc"]],
      limit: SIZE,
      offset: (page - 1) * SIZE,
    });
    const [units, statements] = await Promise.all([
      selectIn<{ id: string; title: string; subject_id: string; key_stage_id: string | null; year_group_id: string | null }>(store, "units", "id", links.map((l) => l.unit_id), { columns: ["id", "title", "subject_id", "key_stage_id", "year_group_id"] }),
      selectIn<Statement>(store, "curriculum_statements", "id", links.map((l) => l.statement_id)),
    ]);
    const u = new Map(units.map((x) => [x.id, x]));
    const s = new Map(statements.map((x) => [x.id, x]));
    return (
      <Page>
        <PageHeader title="Review queue" subtitle="Unit-to-statement links that need a human check." />
        {tabs}
        <Flash done={done} />
        <div className="mb-3 flex flex-wrap gap-2 text-sm">
          Method:
          {["reasoned", "oak_mapping", "all"].map((m) => (
            <Link key={m} href={`/admin/review?tab=links&method=${m}`} className={method === m ? "font-semibold" : ""}>
              {m}
            </Link>
          ))}
        </div>
        {!links.length ? (
          <EmptyState title="No statement links need review." />
        ) : (
          <div className="grid grid-cols-1 gap-3">
            {links.map((l) => {
              const unit = u.get(l.unit_id);
              const st = s.get(l.statement_id);
              return (
                <Card key={`${l.unit_id}|${l.statement_id}`}>
                  <p className="text-xs text-muted">Unit</p>
                  <p className="font-medium">{unit?.title ?? l.unit_id}</p>
                  <p className="text-xs text-muted">{unit ? [unit.subject_id, unit.key_stage_id, unit.year_group_id?.toUpperCase()].filter(Boolean).join(" · ") : ""}</p>
                  <p className="mt-2 text-xs text-muted">Statement</p>
                  <p className="text-sm">{st ? <CurriculumText text={st.text} /> : l.statement_id}</p>
                  <p className="text-xs text-muted">{st ? [st.key_stage_id, st.subject_id, st.strand, st.sub_strand].filter(Boolean).join(" · ") : ""}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <Badge>{l.method}</Badge>
                    <Badge tone={l.confidence >= 0.8 ? "success" : l.confidence >= 0.5 ? "warning" : "danger"}>confidence {l.confidence.toFixed(2)}</Badge>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {(["approve", "reject"] as const).map((d) => (
                      <form key={d} action={reviewLinkAction}>
                        <input type="hidden" name="table" value="unit_statement_links" />
                        <input type="hidden" name="owner_id" value={l.unit_id} />
                        <input type="hidden" name="statement_id" value={l.statement_id} />
                        <input type="hidden" name="decision" value={d} />
                        <input type="hidden" name="back" value={self} />
                        <Button type="submit" variant={d === "approve" ? "primary" : "danger"}>
                          {d === "approve" ? "Approve link" : "Reject link"}
                        </Button>
                      </form>
                    ))}
                  </div>
                </Card>
              );
            })}
          </div>
        )}
        <Pager path="/admin/review" sp={{ ...sp, done: undefined }} page={page} total={lCount} size={SIZE} />
      </Page>
    );
  }

  const qs = await store.select<QRow>("questions", {
    where: { review_status: "needs_review" },
    columns: ["id", "prompt_text", "explanation", "marks", "qtype", "quiz_kind", "review_notes", "review_status", "extraction_confidence", "source_id", "key_stage_id", "subject_id", "third_party_flag"],
    orderBy: [["extraction_confidence", "asc"], ["id", "asc"]],
    limit: SIZE,
    offset: (page - 1) * SIZE,
  });
  const ids = qs.map((q) => q.id);
  const [opts, answers, ms] = await Promise.all([
    selectIn<{ question_id: string; text: string; is_correct: number; side: string | null; match_key: string | null; correct_position: number | null; sort: number }>(store, "question_options", "question_id", ids, { orderBy: [["sort", "asc"]] }),
    selectIn<{ question_id: string; part: string; answer: string }>(store, "accepted_answers", "question_id", ids, { orderBy: [["id", "asc"]] }),
    selectIn<{ question_id: string; answer_text: string }>(store, "mark_scheme_entries", "question_id", ids, { orderBy: [["sort", "asc"]] }),
  ]);
  const by = <T extends { question_id: string }>(rows: T[], id: string) => rows.filter((r) => r.question_id === id);

  return (
    <Page>
      <PageHeader title="Review queue" subtitle="Questions with review_status needs_review. Approving publishes a question (unless it is third-party). Nothing is ever deleted." />
      {tabs}
      <Flash done={done} />
      {!qs.length ? (
        <EmptyState title="The question review queue is empty.">
          Use “Send to review queue” on any <Link href="/admin/questions">question</Link> to add it here.
        </EmptyState>
      ) : (
        <div className="grid grid-cols-1 gap-3">
          {qs.map((q) => {
            const qa = by(answers, q.id);
            return (
              <Card key={q.id}>
                <div className="mb-2 flex flex-wrap items-center gap-1 text-xs text-muted">
                  <Badge>{q.qtype}</Badge>
                  <Badge>{q.quiz_kind}</Badge>
                  <Badge tone={q.extraction_confidence >= 0.8 ? "success" : "warning"}>confidence {q.extraction_confidence.toFixed(2)}</Badge>
                  {q.third_party_flag ? <Badge tone="danger">third-party</Badge> : null}
                  <span>{[q.key_stage_id, q.subject_id, q.source_id].filter(Boolean).join(" · ")}</span>
                </div>
                <Link href={`/admin/questions/${encodeURIComponent(q.id)}`} className="block whitespace-pre-line text-ink no-underline">
                  {q.prompt_text}
                </Link>
                <p className="mt-2 text-sm">
                  <span className="text-muted">Answer: </span>
                  {answerText(q.qtype, by(opts, q.id), qa, by(ms, q.id).map((m) => m.answer_text)) || "–"}
                </p>
                {q.review_notes && <p className="mt-1 text-xs text-muted">Notes: {q.review_notes}</p>}
                <div className="mt-3">
                  <ReviewButtons id={q.id} back={self} status={q.review_status} />
                </div>
                <details className="mt-2">
                  <summary className="min-h-[44px] cursor-pointer py-2 text-sm font-medium text-primary">Edit</summary>
                  <QuestionEditForm q={q} answers={qa.filter((a) => a.part === "main").map((a) => a.answer)} back={self} />
                </details>
              </Card>
            );
          })}
        </div>
      )}
      <Pager path="/admin/review" sp={{ ...sp, done: undefined }} page={page} total={qCount} size={SIZE} />
    </Page>
  );
}
