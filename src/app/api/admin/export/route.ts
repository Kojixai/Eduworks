import { requireAdmin } from "@/lib/auth";
import { getStore } from "@/lib/db";
import type { Where } from "@/lib/db/store";
import { csvLine, isExportable, mailingList, pagedRows, redemptionsWithBooks, toCsv } from "@/lib/admin";

export const dynamic = "force-dynamic";

const QUESTION_FILTERS = ["review_status", "key_stage_id", "subject_id"] as const;

/**
 * GET /api/admin/export?table=<name>&format=csv|json
 * Content tables + redemptions, streamed page by page; `table=mailing_list` gives the opted-in,
 * de-duplicated mailing list. Questions accept review_status, key_stage_id and subject_id filters.
 */
export async function GET(req: Request) {
  const admin = await requireAdmin();
  const url = new URL(req.url);
  const table = url.searchParams.get("table") ?? "";
  const format = url.searchParams.get("format") === "json" ? "json" : "csv";
  if (!isExportable(table)) return Response.json({ error: `Table not exportable: ${table}` }, { status: 400 });
  const store = await getStore();
  const stamp = new Date().toISOString().slice(0, 10);
  const headers = (ext: string) => ({
    "Content-Type": ext === "csv" ? "text/csv; charset=utf-8" : "application/json; charset=utf-8",
    "Content-Disposition": `attachment; filename="${table}-${stamp}.${ext}"`,
    "Cache-Control": "no-store",
    "X-Exported-By": admin.email.replace(/[^\x20-\x7e]/g, ""),
  });

  if (table === "mailing_list") {
    const list = mailingList(await redemptionsWithBooks(store));
    const cols = ["email", "name", "consent_timestamp", "book"];
    return new Response(format === "json" ? JSON.stringify(list, null, 1) : toCsv(list as never, cols), { headers: headers(format) });
  }

  const where: Where = {};
  if (table === "questions")
    for (const f of QUESTION_FILTERS) {
      const v = url.searchParams.get(f);
      if (v) where[f] = v;
    }

  const enc = new TextEncoder();
  const it = pagedRows(store, table, where);
  let first = true;
  let cols: string[] | null = null;
  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { value, done } = await it.next();
        if (done) {
          if (format === "json") controller.enqueue(enc.encode(first ? "[]\n" : "\n]\n"));
          controller.close();
          return;
        }
        let out = "";
        for (const row of value) {
          if (format === "json") {
            out += (first ? "[\n" : ",\n") + JSON.stringify(row);
          } else {
            if (!cols) {
              cols = Object.keys(row);
              out += csvLine(cols);
            }
            out += csvLine(cols.map((c) => row[c]));
          }
          first = false;
        }
        controller.enqueue(enc.encode(out));
      } catch (e) {
        controller.error(e);
      }
    },
  });
  return new Response(stream, { headers: headers(format) });
}
