"use server";
import crypto from "node:crypto";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { getStore } from "@/lib/db";
import { createSession, destroySession, requireParent, setActiveChild, verifyLogin, childrenOf, lockParentArea, unlockParentArea, isParentLocked, hashPinServer, PIN_RE } from "@/lib/auth";
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
  await unlockParentArea(); // the adult is here with their password
  const next = String(fd.get("next") ?? "");
  redirect(next.startsWith("/") && !next.startsWith("//") ? next : p.is_admin ? "/admin" : "/home");
}

export async function logoutAction() {
  await destroySession();
  redirect("/");
}

export async function addChildAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const parent = await requireParent();
  if (await isParentLocked(parent)) return { errors: { form: "Enter your parent PIN first." } };
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
  if ((await childrenOf(parent.id)).some((k) => k.id === id)) {
    await setActiveChild(id);
    await lockParentArea(parent); // handing over to the child: the parent area now needs the PIN
  }
  const next = String(fd.get("next") ?? "/learn");
  redirect(next.startsWith("/") && !next.startsWith("//") ? next : "/learn");
}

export async function removeChildAction(fd: FormData) {
  const parent = await requireParent();
  if (await isParentLocked(parent)) return;
  const id = String(fd.get("childId") ?? "");
  const store = await getStore();
  if (!(await childrenOf(parent.id)).some((k) => k.id === id)) return;
  const attempts = await store.select<{ id: string }>("attempts", { where: { student_id: id }, columns: ["id"] });
  if (attempts.length) await store.delete("results", { attempt_id: attempts.map((a) => a.id) });
  await store.delete("attempts", { student_id: id });
  await store.delete("topic_progress", { student_id: id });
  await store.delete("practice_attempts", { student_id: id });
  await store.delete("practice_sessions", { student_id: id });
  await store.delete("students", { id });
  revalidatePath("/home");
}

// ---------------------------------------------------------------- PIN
export async function setPinAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const parent = await requireParent();
  if (await isParentLocked(parent)) return { errors: { form: "Enter your current PIN first." } };
  const pin = String(fd.get("pin") ?? ""), again = String(fd.get("again") ?? "");
  if (!PIN_RE.test(pin)) return { errors: { form: "The PIN must be exactly 4 digits." } };
  if (pin !== again) return { errors: { form: "The two PINs do not match." } };
  await (await getStore()).update("parents", { id: parent.id }, { pin_hash: hashPinServer(parent.id, pin) });
  revalidatePath("/", "layout");
  return { values: { saved: "1" } };
}

export async function unlockAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const parent = await requireParent();
  const store = await getStore();
  const pin = String(fd.get("pin") ?? "");
  const next = String(fd.get("next") ?? "/dashboard");
  const who = `pin:${parent.id}`;
  const since = new Date(Date.now() - 15 * 60_000).toISOString();
  const fails = await store.count("redeem_attempts", { ip_hash: who, ok: 0, created_at: { op: "gt", value: since } });
  if (fails >= 5) return { errors: { form: "Too many wrong tries. Wait 15 minutes, or log out and back in with your password." } };
  if (!parent.pin_hash || hashPinServer(parent.id, pin) !== parent.pin_hash) {
    await store.insert("redeem_attempts", { id: crypto.randomUUID(), email_hash: null, ip_hash: who, ok: 0, created_at: new Date().toISOString() });
    return { errors: { form: "That is not the right PIN. Forgotten it? Log out and back in with your password." } };
  }
  await unlockParentArea();
  redirect(next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard");
}

// ---------------------------------------------------------------- account: mailing list, export, delete
export async function setMailingAction(fd: FormData) {
  const parent = await requireParent();
  if (await isParentLocked(parent) || parent.account_type === "student") return;
  const store = await getStore();
  const consented = fd.get("mailing") === "on";
  const { MAILING_WORDING, MAILING_WORDING_VERSION } = await import("@/practice/config-public");
  await store.insert("mailing_consent", { id: crypto.randomUUID(), parent_id: parent.id, consented: consented ? 1 : 0, wording_version: MAILING_WORDING_VERSION, wording: MAILING_WORDING, source: "account", created_at: new Date().toISOString() });
  await store.update("redemptions", { parent_id: parent.id }, { marketing_opt_in: consented ? 1 : 0, consent_timestamp: consented ? new Date().toISOString() : null });
  revalidatePath("/account");
}

export async function deleteAccountAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const parent = await requireParent();
  if (await isParentLocked(parent)) return { errors: { form: "Enter your parent PIN first." } };
  const store = await getStore();
  const row = await store.first<{ password_hash: string }>("parents", { where: { id: parent.id } });
  const bcrypt = (await import("bcryptjs")).default;
  if (String(fd.get("confirm") ?? "").trim().toUpperCase() !== "DELETE") return { errors: { form: "Type DELETE in capitals to confirm." } };
  if (!row || !(await bcrypt.compare(String(fd.get("password") ?? ""), row.password_hash))) return { errors: { form: "That password is not right." } };
  for (const k of await childrenOf(parent.id)) {
    const attempts = await store.select<{ id: string }>("attempts", { where: { student_id: k.id }, columns: ["id"] });
    if (attempts.length) await store.delete("results", { attempt_id: attempts.map((a) => a.id) });
    for (const t of ["attempts", "topic_progress", "practice_attempts", "practice_sessions"]) await store.delete(t, { student_id: k.id });
    await store.delete("students", { id: k.id });
  }
  for (const t of ["redemptions", "mailing_consent", "auth_sessions"]) await store.delete(t, { parent_id: parent.id });
  await store.delete("parents", { id: parent.id });
  await destroySession();
  redirect("/?deleted=1");
}
