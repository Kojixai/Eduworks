import { notFound } from "next/navigation";
import { requireChild } from "@/lib/auth";
import { paper, quizQuestions } from "@/lib/repo";
import { AttributionFooter, Page, PageHeader } from "@/components/ui";
import { PaperPlayer } from "@/components/PaperPlayer";

export default async function PaperPage({ params }: { params: Promise<{ id: string }> }) {
  await requireChild();
  const id = decodeURIComponent((await params).id);
  const p = await paper(id);
  if (!p || p.third_party_flag || p.review_status !== "auto_ok") notFound();
  const qs = await quizQuestions({ paperId: id });
  return (
    <>
      <Page narrow>
        <PageHeader title={p.name} back={{ href: `/papers?ks=${p.key_stage_id}`, label: "Papers" }} />
        <PaperPlayer paperId={p.id} title={p.name} minutes={p.time_allowed_minutes} totalMarks={p.total_marks} questions={qs.map((q) => q.playable)} />
      </Page>
      <AttributionFooter lines={[p.attribution_text]} />
    </>
  );
}
