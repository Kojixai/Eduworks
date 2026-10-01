import "server-only";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getStore } from "./db";

const SESSION_COOKIE = "edu_session";
const CHILD_COOKIE = "edu_child";
const LOCK_COOKIE = "edu_lock";
const SESSION_DAYS = 30;

export interface Parent {
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
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const store = await getStore();
  const s = await store.first<{ parent_id: string; expires_at: string }>("auth_sessions", { where: { id: hashToken(token) } });
  if (!s || s.expires_at < new Date().toISOString()) return null;
  return (await store.first<Parent>("parents", { where: { id: s.parent_id }, columns: ["id", "name", "email", "is_admin", "account_type", "pin_hash"] })) ?? null;
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
