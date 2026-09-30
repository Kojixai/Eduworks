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

export const DEMO_BOOKS = [
  { id: "book-ks1-maths-y2", title: "KS1 Maths Practice Book (Year 2)", key_stage_id: "ks1", subject_id: "mathematics", year_group_id: "y2", code: "DEMO-KS1-MATHS" },
  { id: "book-y1-phonics", title: "Year 1 Phonics Practice Book", key_stage_id: "ks1", subject_id: "english", year_group_id: "y1", code: "DEMO-Y1-PHONICS" },
  { id: "book-y4-tables", title: "Year 4 Times Tables Practice Book", key_stage_id: "ks2", subject_id: "mathematics", year_group_id: "y4", code: "DEMO-Y4-TABLES" },
  { id: "book-ks2-maths-y6", title: "KS2 Maths SATs Practice Book (Year 6)", key_stage_id: "ks2", subject_id: "mathematics", year_group_id: "y6", code: "DEMO-KS2-MATHS" },
  { id: "book-ks2-english-y6", title: "KS2 English SATs Practice Book (Year 6)", key_stage_id: "ks2", subject_id: "english", year_group_id: "y6", code: "DEMO-KS2-ENGLISH" },
  { id: "book-ks3-science", title: "KS3 Science Practice Book", key_stage_id: "ks3", subject_id: "science", year_group_id: null, code: "DEMO-KS3-SCIENCE" },
  { id: "book-ks4-maths", title: "GCSE Maths Practice Book (KS4)", key_stage_id: "ks4", subject_id: "mathematics", year_group_id: null, code: "DEMO-KS4-MATHS" },
];

export async function seedDemo(store: DataStore) {
  const ts = new Date().toISOString();
  for (const b of DEMO_BOOKS) {
    const { code, ...book } = b;
    await store.upsert("books", { ...book, isbn: null, description: "Demo book for testing the sign-up flow.", active: 1, created_at: ts }, ["id"]);
    await store.upsert("book_codes", { id: `code-${b.id}`, book_id: b.id, code, active: 1, is_demo: 1, created_at: ts }, ["id"]);
  }

  const parentId = "demo-parent";
  if (!(await store.first("parents", { where: { id: parentId } }))) {
    await store.insert("parents", { id: parentId, name: "Demo Parent", email: DEMO.parentEmail, password_hash: await bcrypt.hash(DEMO.parentPassword, 10), is_admin: 0, created_at: ts });
    await store.insert("redemptions", {
      id: "demo-redemption",
      book_code_id: "code-book-ks2-maths-y6",
      book_id: "book-ks2-maths-y6",
      parent_id: parentId,
      parent_name: "Demo Parent",
      email: DEMO.parentEmail,
      amazon_order_number: "123-1234567-1234567",
      marketing_opt_in: 0,
      terms_accepted_at: ts,
      consent_timestamp: null,
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
