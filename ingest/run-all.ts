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
import { ingestStaPapers } from "./sources/sta_papers";
import { ingestNcGovuk } from "./sources/nc_govuk";
import { ingestDfeSubjectContent } from "./sources/dfe_subject_content";
import { ingestStaPhonics } from "./sources/sta_phonics";
import { ingestStaMtcGuidance } from "./sources/sta_mtc_guidance";

type Step = { id: string; run: (s: DataStore) => Promise<unknown> };

export const STEPS: Step[] = [
  { id: "oak_ontology", run: ingestOakOntology },
  // nc_govuk cross-checks the ontology statements, so it runs straight after them
  { id: "nc_govuk", run: (s) => ingestNcGovuk(s) },
  { id: "dfe_subject_content", run: (s) => ingestDfeSubjectContent(s) },
  { id: "oak_graphs", run: ingestOakGraphs },
  { id: "oak_api", run: (s) => ingestOakApi(s) },
  { id: "sta_ks2", run: (s) => ingestStaPapers(s, { keyStage: "ks2" }) },
  { id: "sta_ks1", run: (s) => ingestStaPapers(s, { keyStage: "ks1" }) },
  { id: "original_content", run: ingestOriginalContent },
  // harvested phonics/MTC rules overwrite the unverified defaults seeded by original_content
  { id: "sta_phonics", run: (s) => ingestStaPhonics(s) },
  { id: "sta_mtc", run: (s) => ingestStaMtcGuidance(s) },
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
