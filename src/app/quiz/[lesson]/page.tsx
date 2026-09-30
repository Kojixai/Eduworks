import { notFound } from "next/navigation";
import { requireChild } from "@/lib/auth";
import { lesson, quizQuestions } from "@/lib/repo";
import { AttributionFooter, Page, PageHeader } from "@/components/ui";
import { QuizPlayer } from "@/components/QuizPlayer";

const LABEL: Record<string, string> = { starter: "Starter quiz", exit: "Exit quiz", derived: "Keyword practice", oak_question_bank: "Extra practice" };

export default async function QuizPage({ params, searchParams }: { params: Promise<{ lesson: string }>; searchParams: Promise<{ kind?: string }> }) {
  await requireChild();
  const lessonId = decodeURIComponent((await params).lesson);
  const kind = (await searchParams).kind ?? "exit";
  const data = await lesson(lessonId);
  if (!data || data.lesson.third_party_flag) notFound();
  const qs = await quizQuestions({ lessonId, kind });
  return (
    <>
      <Page narrow>
        <PageHeader title={LABEL[kind] ?? "Quiz"} subtitle={data.lesson.title} back={{ href: `/lesson/${encodeURIComponent(lessonId)}`, label: "Lesson" }} />
        <QuizPlayer questions={qs.map((q) => q.playable)} refId={`${lessonId}#${kind}`} title={`${data.lesson.title} – ${LABEL[kind] ?? kind}`} backHref={`/lesson/${encodeURIComponent(lessonId)}`} />
      </Page>
      <AttributionFooter lines={qs.slice(0, 20).map((q) => q.row.attribution_text)} />
    </>
  );
}
