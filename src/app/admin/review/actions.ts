"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { getStore } from "@/lib/db";
import { LINK_TABLES, editQuestion, parseAnswerLines, setLinkReview, setQuestionReview, type LinkTable } from "@/lib/admin";

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "");

/** Only redirect back inside /admin; appends a flash message. */
function back(fd: FormData, msg: string): never {
  const raw = str(fd, "back");
  const base = raw.startsWith("/admin") && !raw.startsWith("//") ? raw : "/admin/review";
  const url = new URL(base, "http://x");
  url.searchParams.set("done", msg);
  revalidatePath("/admin", "layout");
  redirect(url.pathname + url.search);
}

export async function reviewQuestionAction(fd: FormData) {
  const admin = await requireAdmin();
  const id = str(fd, "id");
  const decision = str(fd, "decision");
  const status = decision === "approve" ? "auto_ok" : decision === "reject" ? "rejected" : decision === "flag" ? "needs_review" : null;
  if (!id || !status) back(fd, "error");
  const ok = await setQuestionReview(await getStore(), admin.email, id, status, str(fd, "review_notes") || undefined);
  back(fd, ok ? (decision === "approve" ? "approved" : decision === "reject" ? "rejected" : "flagged") : "not-found");
}

export async function editQuestionAction(fd: FormData) {
  const admin = await requireAdmin();
  const id = str(fd, "id");
  const err = await editQuestion(await getStore(), admin.email, id, {
    prompt_text: str(fd, "prompt_text"),
    explanation: str(fd, "explanation") || null,
    marks: Number(str(fd, "marks")),
    qtype: str(fd, "qtype"),
    review_notes: str(fd, "review_notes") || null,
    answers: fd.has("answers") ? parseAnswerLines(str(fd, "answers")) : undefined,
  });
  back(fd, err ? `error: ${err}` : "saved");
}

export async function reviewLinkAction(fd: FormData) {
  const admin = await requireAdmin();
  const table = str(fd, "table") as LinkTable;
  const status = str(fd, "decision") === "approve" ? "auto_ok" : "rejected";
  if (!(LINK_TABLES as readonly string[]).includes(table)) back(fd, "error");
  const ok = await setLinkReview(await getStore(), admin.email, table, str(fd, "owner_id"), str(fd, "statement_id"), status);
  back(fd, ok ? (status === "auto_ok" ? "link-approved" : "link-rejected") : "not-found");
}
