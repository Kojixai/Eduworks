import { describe, expect, it } from "vitest";
import { SupabaseStore } from "../src/lib/db/supabase";

/** Fake PostgREST builder recording every call, resolving like supabase-js. */
function fakeClient(pages: unknown[][] = [[]]) {
  const calls: Array<[string, ...unknown[]]> = [];
  let page = 0;
  const builder: Record<string, unknown> = {};
  for (const m of ["select", "eq", "in", "is", "not", "or", "gt", "gte", "lt", "lte", "like", "ilike", "order", "range", "insert", "upsert", "update", "delete"])
    builder[m] = (...a: unknown[]) => {
      calls.push([m, ...a]);
      return builder;
    };
  builder.then = (resolve: (v: unknown) => void) => resolve({ data: pages[page++] ?? [], error: null, count: 7 });
  return { client: { from: (t: string) => (calls.push(["from", t]), builder) }, calls };
}

describe("SupabaseStore", () => {
  it("translates where conditions to PostgREST filters", async () => {
    const f = fakeClient([[{ id: 1 }]]);
    const s = new SupabaseStore("x", "y", f.client as never);
    await s.select("questions", { where: { review_status: "auto_ok", third_party_flag: 0, qtype: ["mcq", "numeric"], lesson_id: null, marks: { op: "gte", value: 2 } }, orderBy: [["sort", "asc"]], limit: 10 });
    const names = f.calls.map((c) => c[0]);
    expect(f.calls).toContainEqual(["eq", "review_status", "auto_ok"]);
    expect(f.calls).toContainEqual(["in", "qtype", ["mcq", "numeric"]]);
    expect(f.calls).toContainEqual(["is", "lesson_id", null]);
    expect(f.calls).toContainEqual(["gte", "marks", 2]);
    expect(f.calls).toContainEqual(["range", 0, 9]);
    expect(names).toContain("order");
  });
  it("paginates past 1000 rows", async () => {
    const full = Array.from({ length: 1000 }, (_, i) => ({ i }));
    const f = fakeClient([full, [{ i: 1000 }]]);
    const s = new SupabaseStore("x", "y", f.client as never);
    const rows = await s.select("lessons");
    expect(rows).toHaveLength(1001);
    expect(f.calls.filter((c) => c[0] === "range")).toEqual([["range", 0, 999], ["range", 1000, 1999]]);
  });
  it("upserts in batches with the conflict keys and converts booleans", async () => {
    const f = fakeClient();
    const s = new SupabaseStore("x", "y", f.client as never);
    await s.upsert("topic_progress", Array.from({ length: 1200 }, (_, i) => ({ student_id: "a", topic_key: String(i), ok: true })), ["student_id", "topic_key"]);
    const ups = f.calls.filter((c) => c[0] === "upsert");
    expect(ups).toHaveLength(3);
    expect((ups[0][1] as Array<{ ok: number }>)[0].ok).toBe(1);
    expect(ups[0][2]).toEqual({ onConflict: "student_id,topic_key" });
  });
  it("refuses unscoped deletes", async () => {
    const s = new SupabaseStore("x", "y", fakeClient().client as never);
    await expect(s.delete("parents", {})).rejects.toThrow();
  });
});
