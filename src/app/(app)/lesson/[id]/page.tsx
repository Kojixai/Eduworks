import { notFound } from "next/navigation";
import { requireChild } from "@/lib/auth";
import { lesson } from "@/lib/repo";
import { AttributionFooter, ButtonLink, Card, CurriculumText, Page, PageHeader } from "@/components/ui";

const QUIZ_LABEL: Record<string, string> = {
  starter: "Starter quiz",
  exit: "Exit quiz",
  derived: "Keyword practice",
  oak_question_bank: "Extra practice",
};

export default async function LessonPage({ params }: { params: Promise<{ id: string }> }) {
  await requireChild();
  const { id } = await params;
  const data = await lesson(decodeURIComponent(id));
  if (!data) notFound();
  const { lesson: l, unit, blocks, assets, quizCounts, statements } = data;
  const of = (k: string) => blocks.filter((b) => b.kind === k);
  const klps = of("key_learning_point");
  const keywords = of("keyword");
  const misconceptions = of("misconception");
  const worked = of("worked_example");
  const explainer = of("explainer");
  const tips = of("teacher_tip");
  const lessonKey = encodeURIComponent(l.id);

  return (
    <>
      <Page>
        <PageHeader title={l.title} subtitle={unit?.title} back={unit ? { href: `/unit/${encodeURIComponent(unit.id)}`, label: "Unit" } : { href: "/learn", label: "Learn" }} />
        {l.third_party_flag ? (
          <Card>This lesson contains third-party material and is not available here.</Card>
        ) : (
          <div className="grid gap-3">
            {l.pupil_outcome && (
              <Card>
                <p className="text-sm text-muted">By the end of this lesson</p>
                <p className="font-medium">{l.pupil_outcome}</p>
              </Card>
            )}

            {quizCounts.size > 0 && (
              <Card title="Quizzes">
                <div className="grid gap-2 sm:grid-cols-2">
                  {["starter", "exit", "derived", "oak_question_bank"]
                    .filter((k) => quizCounts.get(k))
                    .map((k) => (
                      <ButtonLink key={k} href={`/quiz/${lessonKey}?kind=${k}`} variant={k === "exit" || (k === "derived" && !quizCounts.get("exit")) ? "primary" : "secondary"}>
                        {QUIZ_LABEL[k]} ({quizCounts.get(k)})
                      </ButtonLink>
                    ))}
                </div>
              </Card>
            )}

            {(explainer.length > 0 || klps.length > 0) && (
              <Card title="Key learning">
                {explainer.map((e) => (
                  <p key={e.id} className="mb-2 whitespace-pre-line text-sm">
                    {e.body}
                  </p>
                ))}
                <ul className="list-disc space-y-1 pl-5">
                  {klps.map((k) => (
                    <li key={k.id}>{k.body}</li>
                  ))}
                </ul>
              </Card>
            )}

            {keywords.length > 0 && (
              <Card title="Keywords">
                <dl className="grid gap-2">
                  {keywords.map((k) => (
                    <div key={k.id} className="rounded-[var(--radius-md)] bg-surface-muted p-2">
                      <dt className="font-semibold">{k.title}</dt>
                      <dd className="text-sm text-muted">{k.body}</dd>
                    </div>
                  ))}
                </dl>
              </Card>
            )}

            {misconceptions.length > 0 && (
              <Card title="Common mistakes">
                {misconceptions.map((m) => (
                  <div key={m.id} className="mb-2 rounded-[var(--radius-md)] border border-border p-3">
                    <p className="text-sm">
                      <span className="font-semibold">Watch out: </span>
                      {m.title}
                    </p>
                    {m.body && <p className="mt-1 text-sm text-muted">{m.body}</p>}
                  </div>
                ))}
              </Card>
            )}

            {worked.length > 0 && (
              <Card title="Worked examples">
                {worked.map((w) => (
                  <div key={w.id} className="mb-2">
                    {w.title && <p className="font-medium">{w.title}</p>}
                    <p className="whitespace-pre-line text-sm">{w.body}</p>
                  </div>
                ))}
              </Card>
            )}

            {tips.length > 0 && (
              <Card title="Tips for grown-ups">
                <ul className="list-disc space-y-1 pl-5 text-sm">
                  {tips.map((t) => (
                    <li key={t.id}>{t.body}</li>
                  ))}
                </ul>
              </Card>
            )}

            <Card title="Resources">
              {assets.length ? (
                <ul className="list-disc space-y-1 pl-5 text-sm">
                  {assets.map((a) => (
                    <li key={a.id}>
                      {a.url ? (
                        <a href={a.url} rel="noopener noreferrer" target="_blank">
                          {a.title ?? a.kind}
                        </a>
                      ) : (
                        (a.title ?? a.kind)
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted">Worksheets and slides will appear here once the Oak lesson resources are connected.</p>
              )}
              {l.external_url && (
                <p className="mt-2 text-sm">
                  <a href={l.external_url} rel="noopener noreferrer" target="_blank">
                    Watch the full lesson on Oak National Academy
                  </a>
                </p>
              )}
            </Card>

            {statements.length > 0 && (
              <Card title="Curriculum">
                <ul className="list-disc space-y-1 pl-5 text-sm text-muted">
                  {statements.map((s) => (
                    <li key={s.id}>
                      <CurriculumText text={s.text} />
                    </li>
                  ))}
                </ul>
              </Card>
            )}
          </div>
        )}
      </Page>
      <AttributionFooter lines={[l.attribution_text, ...blocks.slice(0, 1).map((b) => b.attribution_text)]} />
    </>
  );
}
