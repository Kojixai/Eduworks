import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getBook, getUnitContent } from "@/lib/practice";
import { gateFor } from "../../../access";
import { Player } from "@/practice/components/Player";
import { sectionVars } from "@/practice/colour";

export const metadata: Metadata = { title: "Practice", robots: { index: false } };

export default async function PracticePage({ params }: { params: Promise<{ bookId: string; unitId: string }> }) {
  const { bookId, unitId } = await params;
  const gate = await gateFor(bookId);
  const here = `/books/${bookId}/${unitId}`;
  // anyone without active access, or without a chosen learner, goes back to the topic page, which explains what to do
  if (gate.state !== "ok" || !gate.child) redirect(here);
  const [b, content] = await Promise.all([getBook(bookId), getUnitContent(bookId, unitId)]);
  if (!b || !content) notFound();
  const sec = b.meta.sections.find((s) => s.id === content.unit.section);
  return (
    <div className="pr" style={sectionVars(sec?.colour ?? "#2360A8") as React.CSSProperties}>
      <Player bookId={bookId} unitId={unitId} unitTitle={`${b.meta.title}: ${content.unit.title}`} primary={b.meta.keyStage === "KS1" || b.meta.keyStage === "KS2"} studentId={gate.child.id} content={content} />
    </div>
  );
}
