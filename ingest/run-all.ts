/**
 * One idempotent entry point: `npm run ingest` (say "continue" to resume; finished steps are skipped
 * via checkpoints in data/checkpoints/). Individual steps: `npm run ingest -- oak_ontology oak_graphs`.
 */
import { createStore } from "../src/lib/db";
import type { DataStore } from "../src/lib/db/store";
import { checkNetwork, seedReference } from "./sources/reference";
import { ingestOakOntology } from "./sources/oak_ontology";
import { ingestOakGraphs } from "./sources/oak_graphs";
import { ingestOriginalContent } from "./sources/original_content";
import { runLinking } from "./sources/linking";
import { ingestOakApi } from "./sources/oak_api";

type Step = { id: string; run: (s: DataStore) => Promise<unknown> };

export const STEPS: Step[] = [
  { id: "oak_ontology", run: ingestOakOntology },
  { id: "oak_graphs", run: ingestOakGraphs },
  { id: "oak_api", run: (s) => ingestOakApi(s) },
  { id: "original_content", run: ingestOriginalContent },
  // linking must stay last: it links everything ingested above and rebuilds the coverage matrix
  { id: "linking", run: runLinking },
];

async function main() {
  const only = process.argv.slice(2);
  const store = createStore({ forceSqlite: true });
  await store.migrate();
  await seedReference(store);
  console.log("Network check:");
  for (const r of await checkNetwork(store)) console.log(`  ${r.ok ? "OK     " : "BLOCKED"} ${r.source} ${r.detail}`);
  for (const step of STEPS) {
    if (only.length && !only.includes(step.id)) continue;
    const t = Date.now();
    console.log(`\n== ${step.id}`);
    try {
      const stats = await step.run(store);
      console.log(`   done in ${((Date.now() - t) / 1000).toFixed(1)}s`, stats ?? "");
    } catch (e) {
      console.error(`   FAILED: ${(e as Error).message}`);
    }
  }
  await store.close();
}

if (require.main === module) main();
