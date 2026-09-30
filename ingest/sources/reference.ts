import type { DataStore } from "../../src/lib/db/store";
import { now } from "../core/context";
import { probeHosts } from "../core/http";
import { DIFFICULTY, KEY_STAGES, LICENCES, SOURCES, SUBJECTS, YEAR_GROUPS } from "./registry";

/** Seeds licences, sources and the fixed taxonomy scaffolding. Idempotent (upserts). */
export async function seedReference(store: DataStore) {
  await store.upsert("licences", LICENCES, ["id"]);
  const ts = now();
  for (const s of SOURCES) {
    const existing = await store.first<{ created_at: string }>("sources", { where: { id: s.id } });
    const { probe_url: _p, ...rest } = s;
    await store.upsert("sources", { ...rest, created_at: existing?.created_at ?? ts, updated_at: ts }, ["id"]);
  }
  await store.upsert("key_stages", KEY_STAGES, ["id"]);
  await store.upsert("year_groups", YEAR_GROUPS, ["id"]);
  await store.upsert("subjects", SUBJECTS, ["id"]);
  await store.upsert("difficulty", DIFFICULTY, ["id"]);
}

/** Probes every source host and records reachability on the source row. */
export async function checkNetwork(store: DataStore) {
  const probes = SOURCES.filter((s) => s.probe_url);
  const results = await probeHosts(probes.map((s) => s.probe_url));
  const out: Array<{ source: string; url: string; ok: boolean; detail: string }> = [];
  for (let i = 0; i < probes.length; i++) {
    const r = results[i];
    // Any HTTP answer (even 401 without an API key) means the host is reachable.
    const status = r.status !== undefined ? "reachable" : r.error?.includes("blocked") ? "blocked" : "error";
    const detail = r.ok ? `HTTP ${r.status}` : (r.error ?? `HTTP ${r.status}`);
    await store.update(
      "sources",
      { id: probes[i].id },
      { access_status: status, access_notes: `${detail} (checked ${now()})`, updated_at: now() },
    );
    out.push({ source: probes[i].id, url: r.url, ok: r.ok || (r.status ?? 0) === 401, detail });
  }
  return out;
}
