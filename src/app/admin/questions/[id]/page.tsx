import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { getStore } from "@/lib/db";
import { answerText, fmtDate, safeJson } from "@/lib/admin";
import type { Statement } from "@/lib/repo";
import { Badge, Card, CurriculumText, Page, PageHeader } from "@/components/ui";
import { Facts, ProvenanceFacts, StatusBadge, TableWrap, td, th, type Provenance, type SP } from "../../_ui";
import { Flash, QuestionEditForm, ReviewButtons } from "../../review/forms";

export const metadata = { title: "Question" };

type Q = Provenance & {
  id: string;
  paper_id: string | null;
  lesson_id: string | null;
  quiz_kind: string;
  qtype: string;
  number: string | null;
  marks: number;
  time_hint_seconds: number | null;
  prompt_text: string;
  prompt_images_json: string | null;
  prompt_extra_json: string | null;
  explanation: string | null;
  subject_id: string | null;
  key_stage_id: string | null;
  year_group_id: string | null;
  difficulty_id: string | null;
  content_domain_ref: string | null;
  extraction_confidence: number;
  review_status: string;
  review_notes: string | null;
  reviewed_at: string | null;
};
interface Opt {
  id: string;
  label: string | null;
  text: string;
  image_path: string | null;
  is_correct: number;
  match_key: string | null;
  side: string | null;
  correct_position: number | null;
  sort: number;
}

const imgSrc = (p: string) => (/^(https?:|data:|\/)/.test(p) ? p : `/${p}`);

export default async function AdminQuestionPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<SP> }) {
  await requireAdmin();
  const id = decodeURIComponent((await params).id);
  const sp = await searchParams;
  const store = await getStore();
  const q = await store.first<Q>("questions", { where: { id } });
  if (!q) notFound();
  const [options, answers, ms, links, paper, lesson] = await Promise.all([
    store.select<Opt>("question_options", { where: { question_id: id }, orderBy: [["sort", "asc"]] }),
    store.select<{ id: string; part: string; answer: string; kind: string; tolerance: number | null; case_sensitive: number; marks: number | null }>("accepted_answers", { where: { question_id: id }, orderBy: [["part", "asc"], ["id", "asc"]] }),
    store.select<Provenance & { id: string; number: string | null; marks: number | null; answer_text: string; guidance: string | null; content_domain_ref: string | null }>("mark_scheme_entries", { where: { question_id: id }, orderBy: [["sort", "asc"]] }),
    store.select<{ statement_id: string; method: string; confidence: number; review_status: string }>("question_statement_links", { where: { question_id: id }, orderBy: [["confidence", "desc"]] }),
    q.paper_id ? store.first<{ id: string; name: string }>("papers", { where: { id: q.paper_id }, columns: ["id", "name"] }) : undefined,
    q.lesson_id ? store.first<{ id: string; title: string }>("lessons", { where: { id: q.lesson_id }, columns: ["id", "title"] }) : undefined,
  ]);
  const statements = links.length ? await store.select<Statement>("curriculum_statements", { where: { id: links.map((l) => l.statement_id) } }) : [];
  const stById = new Map(statements.map((s) => [s.id, s]));
  const images = safeJson<Array<{ path: string; alt?: string }>>(q.prompt_images_json, []);
  const self = `/admin/questions/${encodeURIComponent(q.id)}`;
  const done = typeof sp.done === "string" ? sp.done : undefined;

  return (
    <Page>
      <PageHeader title={`Question${q.number ? ` ${q.number}` : ""}`} subtitle={<code className="break-all">{q.id}</code>} back={{ href: "/admin/questions", label: "Questions" }} />
      <Flash done={done} />
      <div className="grid grid-cols-1 gap-3">
        <Card>
          <div className="mb-2 flex flex-wrap gap-1">
            <StatusBadge status={q.review_status} />
            {q.third_party_flag ? <Badge tone="danger">third-party</Badge> : null}
            <Badge>{q.qtype}</Badge>
            <Badge>{q.quiz_kind}</Badge>
            <Badge>
              {q.marks} mark{q.marks === 1 ? "" : "s"}
            </Badge>
          </div>
          <p className="whitespace-pre-line">{q.prompt_text}</p>
          {images.length > 0 && (
            <div className="mt-3 grid gap-2">
              {images.map((im, i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={i} src={imgSrc(im.path)} alt={im.alt ?? `Prompt image ${i + 1}`} className="h-auto max-w-full rounded-[var(--radius-sm)] border border-border" />
              ))}
            </div>
          )}
          {q.prompt_extra_json && (
            <details className="mt-2 text-xs">
              <summary className="cursor-pointer text-muted">prompt_extra_json</summary>
              <pre className="mt-1 overflow-x-auto rounded-[var(--radius-sm)] bg-surface-muted p-2">{q.prompt_extra_json}</pre>
            </details>
          )}
          {q.explanation && <p className="mt-3 text-sm text-muted">Explanation: {q.explanation}</p>}
          <p className="mt-3 text-sm">
            <span className="text-muted">Correct answer: </span>
            {answerText(q.qtype, options, answers, ms.map((m) => m.answer_text)) || "–"}
          </p>
        </Card>

        <Card title="Review">
          <Facts
            rows={[
              ["Status", <StatusBadge key="s" status={q.review_status} />],
              ["Reviewed", fmtDate(q.reviewed_at)],
              ["Notes", q.review_notes ?? "–"],
              ["Extraction confidence", q.extraction_confidence.toFixed(2)],
            ]}
          />
          <div className="mt-3">
            <ReviewButtons id={q.id} back={self} status={q.review_status} />
          </div>
          <details className="mt-3">
            <summary className="min-h-[44px] cursor-pointer py-2 text-sm font-medium text-primary">Edit question</summary>
            <QuestionEditForm q={q} answers={answers.filter((a) => a.part === "main").map((a) => a.answer)} back={self} />
          </details>
        </Card>

        <Card title={`Options (${options.length})`}>
          {options.length ? (
            <ul className="grid gap-1 text-sm">
              {options.map((o) => (
                <li key={o.id} className={`rounded-[var(--radius-sm)] p-2 ${o.is_correct ? "bg-success-soft" : "bg-surface-muted"}`}>
                  {o.label && <span className="font-semibold">{o.label}. </span>}
                  {o.text}
                  {o.image_path && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={imgSrc(o.image_path)} alt={o.text} className="mt-1 h-auto max-w-full" />
                  )}
                  <span className="ml-1 inline-flex flex-wrap gap-1 align-middle">
                    {o.is_correct ? <Badge tone="success">correct</Badge> : null}
                    {o.side && <Badge>side {o.side}</Badge>}
                    {o.match_key && <Badge>match {o.match_key}</Badge>}
                    {o.correct_position != null && <Badge>position {o.correct_position}</Badge>}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">No options.</p>
          )}
        </Card>

        <Card title={`Accepted answers (${answers.length})`}>
          {answers.length ? (
            <TableWrap>
              <thead>
                <tr>
                  <th className={th}>Part</th>
                  <th className={th}>Answer</th>
                  <th className={th}>Kind</th>
                  <th className={th}>Tolerance</th>
                  <th className={th}>Case</th>
                  <th className={th}>Marks</th>
                </tr>
              </thead>
              <tbody>
                {answers.map((a) => (
                  <tr key={a.id}>
                    <td className={td}>{a.part}</td>
                    <td className={td}>{a.answer}</td>
                    <td className={td}>{a.kind}</td>
                    <td className={td}>{a.tolerance ?? "–"}</td>
                    <td className={td}>{a.case_sensitive ? "sensitive" : "any"}</td>
                    <td className={td}>{a.marks ?? "–"}</td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>
          ) : (
            <p className="text-sm text-muted">No accepted answers.</p>
          )}
        </Card>

        <Card title={`Mark scheme (${ms.length})`}>
          {ms.length ? (
            <ul className="divide-y divide-border text-sm">
              {ms.map((m) => (
                <li key={m.id} className="py-2">
                  {m.number && <span className="font-semibold">{m.number}. </span>}
                  {m.answer_text} {m.marks != null && <Badge>{m.marks} marks</Badge>}
                  {m.guidance && <span className="block text-xs text-muted">{m.guidance}</span>}
                  {m.content_domain_ref && <span className="block text-xs text-muted">Content domain: {m.content_domain_ref}</span>}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">No mark scheme entries.</p>
          )}
        </Card>

        <Card title={`Statement links (${links.length})`}>
          {links.length ? (
            <ul className="divide-y divide-border text-sm">
              {links.map((l) => {
                const s = stById.get(l.statement_id);
                return (
                  <li key={l.statement_id} className="py-2">
                    {s ? <CurriculumText text={s.text} /> : l.statement_id}
                    <span className="mt-1 flex flex-wrap items-center gap-1 text-xs text-muted">
                      <Badge>{l.method}</Badge> confidence {l.confidence.toFixed(2)} <StatusBadge status={l.review_status} />
                    </span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-sm text-muted">No statement links.</p>
          )}
        </Card>

        <Card title="Context">
          <Facts
            rows={[
              ["Paper", paper ? <Link href={`/admin/questions?paper_id=${encodeURIComponent(paper.id)}`}>{paper.name}</Link> : "–"],
              ["Lesson", lesson ? <Link href={`/admin/lessons/${encodeURIComponent(lesson.id)}`}>{lesson.title}</Link> : "–"],
              ["Key stage / subject / year", [q.key_stage_id, q.subject_id, q.year_group_id].filter(Boolean).join(" · ") || "–"],
              ["Difficulty", q.difficulty_id ?? "–"],
              ["Content domain", q.content_domain_ref ?? "–"],
              ["Time hint", q.time_hint_seconds ? `${q.time_hint_seconds} s` : "–"],
            ]}
          />
        </Card>

        <Card title="Provenance">
          <ProvenanceFacts p={q} />
        </Card>
      </div>
    </Page>
  );
}
