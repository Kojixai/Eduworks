import "server-only";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getStore } from "./db";

const SESSION_COOKIE = "edu_session";
const CHILD_COOKIE = "edu_child";
const LOCK_COOKIE = "edu_lock";
const VIEW_COOKIE = "edu_view";
const SESSION_DAYS = 30;

export interface Parent {
  /** True only for the shared visitor account used while PREVIEW_MODE=1 (see below). */
  is_preview?: boolean;
  id: string;
  name: string;
  email: string;
  is_admin: number;
  account_type?: string;
  pin_hash?: string | null;
}
export interface Student {
  id: string;
  parent_id: string;
  first_name: string;
  year_group_id: string | null;
  avatar: string | null;
}

const hashToken = (t: string) => crypto.createHash("sha256").update(t).digest("hex");

export async function createSession(parentId: string) {
  const store = await getStore();
  const token = crypto.randomBytes(32).toString("base64url");
  const now = new Date();
  const expires = new Date(now.getTime() + SESSION_DAYS * 86_400_000);
  await store.insert("auth_sessions", { id: hashToken(token), parent_id: parentId, created_at: now.toISOString(), expires_at: expires.toISOString() });
  (await cookies()).set(SESSION_COOKIE, token, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", expires });
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await (await getStore()).delete("auth_sessions", { id: hashToken(token) });
  jar.delete(SESSION_COOKIE);
  jar.delete(CHILD_COOKIE);
}

export async function currentParent(): Promise<Parent | null> {
  const real = await sessionParent();
  if (real) return real;
  return previewOn() ? ensurePreview() : null;
}

async function sessionParent(): Promise<Parent | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const store = await getStore();
  const s = await store.first<{ parent_id: string; expires_at: string }>("auth_sessions", { where: { id: hashToken(token) } });
  if (!s || s.expires_at < new Date().toISOString()) return null;
  return (await store.first<Parent>("parents", { where: { id: s.parent_id }, columns: ["id", "name", "email", "is_admin", "account_type", "pin_hash"] })) ?? null;
}

// ---------------------------------------------------------------- preview mode (no login)
// While PREVIEW_MODE=1 (set in the server .env) a visitor with no session is treated as one shared "preview" family so the
// owner can click through every screen without an account. It can open every book and flip between Admin / Parent / Child
// views, but it is NOT an admin: the back office (which holds personal data) stays behind a real login. Turn it off before launch.
export const PREVIEW_ID = "preview-parent";
export const previewOn = () => process.env.PREVIEW_MODE === "1";
/** Admins and the preview visitor may flip between the three views. */
export const canSwitchView = (p: Parent) => !!p.is_admin || !!p.is_preview;

async function ensurePreview(): Promise<Parent> {
  const store = await getStore();
  const now = new Date().toISOString();
  const row = await store.first<Parent>("parents", { where: { id: PREVIEW_ID }, columns: ["id", "name", "email", "is_admin", "account_type", "pin_hash"] });
  if (!row) {
    await store.insert("parents", { id: PREVIEW_ID, name: "Preview visitor", email: "preview@preview.invalid", password_hash: "!", is_admin: 0, account_type: "parent", created_at: now });
    await store.insert("students", { id: "preview-alex", parent_id: PREVIEW_ID, first_name: "Alex", year_group_id: "y3", avatar: "violet", created_at: now });
    const { allBooks } = await import("./practice");
    const { sampleActivity } = await import("./sample");
    const { sessions, attempts } = sampleActivity(await allBooks(true));
    for (const x of sessions)
      await store.insert("practice_sessions", { id: `preview-${x.id}`, student_id: "preview-alex", book_id: x.bookId, unit_id: x.unitId, score: x.score, max_score: x.maxScore, correct_count: x.correctCount, question_count: x.questionCount, day: x.day, completed_at: x.completedAt });
    let n = 0;
    for (const a of attempts) await store.insert("practice_attempts", { id: `preview-a${n++}`, session_id: `preview-${sessions.find((x) => x.unitId === a.unit_id && x.bookId === a.book_id)?.id}`, student_id: "preview-alex", book_id: a.book_id, unit_id: a.unit_id, question_id: a.question_id, is_retry: 0, correct: a.correct, marks_awarded: a.correct, marks_available: 1, response_json: null, created_at: a.created_at });
  }
  return { id: PREVIEW_ID, name: "Preview visitor", email: "preview@preview.invalid", is_admin: 0, account_type: "parent", pin_hash: null, is_preview: true };
}

export async function requireParent(): Promise<Parent> {
  const p = await currentParent();
  if (!p) redirect("/login");
  return p;
}

export async function requireAdmin(): Promise<Parent> {
  const p = await currentParent();
  if (!p) redirect("/login?next=/admin");
  if (!p.is_admin) redirect("/home");
  return p;
}

export async function verifyLogin(email: string, password: string): Promise<Parent | null> {
  const store = await getStore();
  const p = await store.first<Parent & { password_hash: string }>("parents", { where: { email: email.trim().toLowerCase() } });
  if (!p || !(await bcrypt.compare(password, p.password_hash))) return null;
  return { id: p.id, name: p.name, email: p.email, is_admin: p.is_admin };
}

export async function childrenOf(parentId: string): Promise<Student[]> {
  return (await getStore()).select<Student>("students", { where: { parent_id: parentId }, orderBy: [["created_at", "asc"]] });
}

/** The child currently practising (cookie), validated against the parent's children. */
export async function activeChild(parent: Parent): Promise<Student | null> {
  const kids = await childrenOf(parent.id);
  const id = (await cookies()).get(CHILD_COOKIE)?.value;
  return kids.find((k) => k.id === id) ?? null;
}

export async function setActiveChild(childId: string) {
  (await cookies()).set(CHILD_COOKIE, childId, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 90 });
}

/**
 * The learner for practice pages: the chosen child, or the sole profile on a student (13+) account.
 * Returns null when nobody is chosen yet.
 */
export async function practiceChild(parent: Parent): Promise<Student | null> {
  const kids = await childrenOf(parent.id);
  const id = (await cookies()).get(CHILD_COOKIE)?.value;
  return kids.find((k) => k.id === id) ?? (parent.account_type === "student" && kids.length === 1 ? kids[0] : null);
}

/** Parent + active child, redirecting to the child picker when no child is chosen. */
export async function requireChild(): Promise<{ parent: Parent; child: Student }> {
  const parent = await requireParent();
  const child = await activeChild(parent);
  if (!child) redirect("/home");
  return { parent, child };
}

// ---------------------------------------------------------------- parent PIN lock
// A convenience lock for a shared family device (docs/INKWORKS_MERGE_BRIEF.txt): when a child is practising, the parent
// area (dashboard, account, adding/removing learners) asks for the 4-digit PIN. The account password is the real protection.
export const PIN_RE = /^\d{4}$/;

export function hashPinServer(parentId: string, pin: string): string {
  const key = process.env.CODE_PEPPER ?? (process.env.NODE_ENV === "production" ? "" : "dev-only-pepper");
  if (!key) throw new Error("CODE_PEPPER is not set");
  return crypto.createHmac("sha256", key).update(`pin:${parentId}:${pin}`).digest("hex");
}

/** Called when the device is handed to a child. Does nothing until the adult has set a PIN. */
export async function lockParentArea(parent: Parent) {
  if (!parent.pin_hash) return;
  (await cookies()).set(LOCK_COOKIE, parent.id, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 30 });
}
export async function unlockParentArea() {
  (await cookies()).delete(LOCK_COOKIE);
}
export async function isParentLocked(parent: Parent): Promise<boolean> {
  return !!parent.pin_hash && parent.account_type !== "student" && (await cookies()).get(LOCK_COOKIE)?.value === parent.id;
}
/** For parent-area pages: sends a child back to the PIN screen. */
export async function requireParentArea(next: string): Promise<Parent> {
  const p = await requireParent();
  if (await isParentLocked(p)) redirect(`/unlock?next=${encodeURIComponent(next)}`);
  return p;
}

// ---------------------------------------------------------------- admin "view as"
export type View = "admin" | "parent" | "child";
export const VIEWS: View[] = ["admin", "parent", "child"];
export const VIEW_HOME: Record<View, string> = { admin: "/admin", parent: "/dashboard", child: "/me" };

/** Which role an admin is currently previewing. Everyone else is simply a parent (or student). */
export async function currentView(parent: Parent): Promise<View> {
  if (!canSwitchView(parent)) return "parent";
  const v = (await cookies()).get(VIEW_COOKIE)?.value as View | undefined;
  return v && VIEWS.includes(v) ? v : "admin";
}
export async function setView(parent: Parent, v: View) {
  if (!canSwitchView(parent) || !VIEWS.includes(v)) return;
  (await cookies()).set(VIEW_COOKIE, v, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 30 });
}
