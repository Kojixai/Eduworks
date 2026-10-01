import { NextResponse } from "next/server";
import { isParentLocked, currentParent } from "@/lib/auth";
import { getStore } from "@/lib/db";

export const dynamic = "force-dynamic";

/** Everything held about the signed-in adult. Hashes (password, PIN, order number) are never included. */
export async function GET() {
  const p = await currentParent();
  if (!p) return new NextResponse("Log in first.", { status: 401 });
  if (await isParentLocked(p)) return new NextResponse("Enter your parent PIN first.", { status: 403 });
  const s = await getStore();
  const kids = await s.select<{ id: string }>("students", { where: { parent_id: p.id } });
  const ids = kids.map((k) => k.id);
  const byStudent = async (t: string) => (ids.length ? s.select(t, { where: { student_id: ids } }) : []);
  const attempts = (await byStudent("attempts")) as Array<{ id: string }>;
  const body = {
    exportedAt: new Date().toISOString(),
    account: { id: p.id, name: p.name, email: p.email, type: p.account_type ?? "parent", pinSet: !!p.pin_hash },
    learners: kids.length ? await s.select("students", { where: { parent_id: p.id } }) : [],
    bookAccess: (await s.select("redemptions", { where: { parent_id: p.id } })).map((r) => ({ ...(r as object), order_hash: undefined })),
    mailingConsent: await s.select("mailing_consent", { where: { parent_id: p.id } }),
    practiceSessions: await byStudent("practice_sessions"),
    practiceAttempts: await byStudent("practice_attempts"),
    curriculumAttempts: attempts,
    curriculumResults: attempts.length ? await s.select("results", { where: { attempt_id: attempts.map((a) => a.id) } }) : [],
    topicProgress: await byStudent("topic_progress"),
  };
  return new NextResponse(JSON.stringify(body, null, 2), {
    headers: { "content-type": "application/json", "content-disposition": `attachment; filename="inkworks-practice-data-${new Date().toISOString().slice(0, 10)}.json"` },
  });
}
