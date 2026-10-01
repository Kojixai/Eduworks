/**
 * Demo data so the site can be tried immediately: books with one code each, a demo parent with two
 * children, and an admin account. Idempotent. Demo codes are flagged is_demo = 1.
 *
 *   Parent login:  demo@example.com / Practice123
 *   Admin login:   admin@example.com / value of ADMIN_PASSWORD (defaults to admin-demo-2026 outside production)
 */
import bcrypt from "bcryptjs";
import type { DataStore } from "../src/lib/db/store";

export const DEMO = {
  parentEmail: "demo@example.com",
  parentPassword: "Practice123",
  adminEmail: process.env.ADMIN_EMAIL ?? "admin@example.com",
};


export async function seedDemo(store: DataStore) {
  const ts = new Date().toISOString();

  const parentId = "demo-parent";
  if (!(await store.first("parents", { where: { id: parentId } }))) {
    await store.insert("parents", { id: parentId, name: "Demo Parent", email: DEMO.parentEmail, password_hash: await bcrypt.hash(DEMO.parentPassword, 10), is_admin: 0, created_at: ts });
    await store.insert("redemptions", {
      id: "demo-redemption",
      book_code_id: "code-y3maths",
      book_id: "y3maths",
      parent_id: parentId,
      parent_name: "Demo Parent",
      email: DEMO.parentEmail,
      order_hash: null,
      marketing_opt_in: 0,
      terms_accepted_at: ts,
      consent_timestamp: null,
      expires_at: new Date(Date.now() + 183 * 864e5).toISOString(),
      created_at: ts,
    });
  }
  await store.upsert("students", { id: "demo-child-sam", parent_id: parentId, first_name: "Sam", year_group_id: "y6", created_at: ts }, ["id"]);
  await store.upsert("students", { id: "demo-child-ava", parent_id: parentId, first_name: "Ava", year_group_id: "y1", created_at: ts }, ["id"]);

  const isProd = process.env.NODE_ENV === "production" || !!process.env.VERCEL_ENV;
  const adminPassword = process.env.ADMIN_PASSWORD ?? (isProd ? null : "admin-demo-2026");
  if (adminPassword) {
    const hash = await bcrypt.hash(adminPassword, 10);
    const existing = await store.first<{ id: string }>("parents", { where: { email: DEMO.adminEmail } });
    if (existing) await store.update("parents", { id: existing.id }, { is_admin: 1, password_hash: hash });
    else await store.insert("parents", { id: "admin", name: "Admin", email: DEMO.adminEmail, password_hash: hash, is_admin: 1, created_at: ts });
  }
}
