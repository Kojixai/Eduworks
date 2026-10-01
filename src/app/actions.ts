"use server";
import crypto from "node:crypto";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { getStore } from "@/lib/db";
import { createSession, destroySession, requireParent, setActiveChild, verifyLogin, childrenOf } from "@/lib/auth";
import { redeemCode, type FieldErrors } from "@/lib/redemption";

export interface FormState {
  errors?: FieldErrors & { form?: string };
  values?: Record<string, string>;
}

export async function signupAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const accountType = fd.get("accountType") === "student" ? "student" : "parent";
  const values = {
    code: String(fd.get("code") ?? ""),
    parentName: String(fd.get("parentName") ?? ""),
    email: String(fd.get("email") ?? ""),
    orderNumber: String(fd.get("orderNumber") ?? ""),
    accountType,
    yearGroupId: String(fd.get("yearGroupId") ?? ""),
  };
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0].trim() || h.get("x-real-ip") || "unknown";
  const r = await redeemCode(await getStore(), {
    ...values,
    accountType,
    password: String(fd.get("password") ?? ""),
    acceptTerms: fd.get("acceptTerms") === "on",
    ageConfirmed: fd.get("ageConfirmed") === "on",
    // the mailing-list box is only ever offered to adults
    marketingOptIn: accountType === "parent" && fd.get("marketingOptIn") === "on",
  }, { ip });
  if (!r.ok) return { errors: r.errors, values };
  await createSession(r.parentId!);
  redirect(r.existingAccount ? "/home?added=1" : "/home?welcome=1");
}

export async function loginAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const email = String(fd.get("email") ?? "");
  const p = await verifyLogin(email, String(fd.get("password") ?? ""));
  if (!p) return { errors: { form: "That email and password don't match an account." }, values: { email } };
  await createSession(p.id);
  const next = String(fd.get("next") ?? "");
  redirect(next.startsWith("/") && !next.startsWith("//") ? next : p.is_admin ? "/admin" : "/home");
}

export async function logoutAction() {
  await destroySession();
  redirect("/");
}

export async function addChildAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const parent = await requireParent();
  const firstName = String(fd.get("firstName") ?? "").trim();
  const year = String(fd.get("year") ?? "") || null;
  if (!/^[\p{L}][\p{L}' -]{0,29}$/u.test(firstName)) return { errors: { form: "Enter a first name only (letters, up to 30 characters)." }, values: { firstName } };
  if ((await childrenOf(parent.id)).length >= 8) return { errors: { form: "You can add up to 8 children." } };
  const id = crypto.randomUUID();
  await (await getStore()).insert("students", { id, parent_id: parent.id, first_name: firstName, year_group_id: year, created_at: new Date().toISOString() });
  await setActiveChild(id);
  revalidatePath("/home");
  return {};
}

export async function chooseChildAction(fd: FormData) {
  const parent = await requireParent();
  const id = String(fd.get("childId") ?? "");
  if ((await childrenOf(parent.id)).some((k) => k.id === id)) await setActiveChild(id);
  redirect(String(fd.get("next") ?? "/learn"));
}

export async function removeChildAction(fd: FormData) {
  const parent = await requireParent();
  const id = String(fd.get("childId") ?? "");
  const store = await getStore();
  if (!(await childrenOf(parent.id)).some((k) => k.id === id)) return;
  const attempts = await store.select<{ id: string }>("attempts", { where: { student_id: id }, columns: ["id"] });
  if (attempts.length) await store.delete("results", { attempt_id: attempts.map((a) => a.id) });
  await store.delete("attempts", { student_id: id });
  await store.delete("topic_progress", { student_id: id });
  await store.delete("students", { id });
  revalidatePath("/home");
}
