/**
 * npm run analyze
 *
 * Builds the full analysis report and prints a structured summary to stdout.
 * Useful for a quick offline check without starting the server.
 */

import "dotenv/config";
import { buildReport } from "./report";
import prisma from "../db";

function sep(label: string) {
  console.log(`\n${"─".repeat(60)}`);
  console.log(` ${label}`);
  console.log("─".repeat(60));
}

async function main() {
  console.log("\n=== FandomLoop Analysis Report ===");

  const report = await buildReport();
  const r = report;

  sep("Data sources");
  for (const s of r.dataSources) {
    const sampleTag = s.isSample ? " [SAMPLE]" : "";
    console.log(`  ${s.name.padEnd(26)} rows=${String(s.rowsStored).padStart(5)}  table=${s.table}${sampleTag}`);
  }

  sep("Data quality");
  const dq = r.dataQuality;
  console.log(`  Missing comments:          ${dq.missingComments}`);
  console.log(`  Prices outside bands:      ${dq.pricesOutsideBands}`);
  console.log(`  Withdrawn pledges excluded:${dq.withdrawnExcluded}`);
  if (dq.duplicatePseudonymousIdsPerCampaign.length > 0) {
    for (const d of dq.duplicatePseudonymousIdsPerCampaign) {
      console.log(`  Duplicate pseudoIDs in ${d.campaignSlug}: ${d.duplicates}`);
    }
  }

  sep("NLP evaluation");
  console.log(`  ${r.nlp.modelNote}`);
  console.log("");
  console.log(`  ${"Method".padEnd(10)} ${"Topic acc".padEnd(12)} ${"Topic F1".padEnd(12)} ${"Sent acc".padEnd(12)} ${"Sent F1"}`);
  for (const m of r.nlp.latestRunPerMethod) {
    const pct = (v: number | null) => v == null ? "  n/a" : `${(v * 100).toFixed(1)}%`;
    console.log(`  ${m.method.padEnd(10)} ${pct(m.accuracyTopic).padEnd(12)} ${pct(m.macroF1Topic).padEnd(12)} ${pct(m.accuracySentiment).padEnd(12)} ${pct(m.macroF1Sentiment)}`);
  }
  if (r.nlp.bestMethod) {
    console.log(`\n  Best method: ${r.nlp.bestMethod}`);
  }

  sep("Gate verdicts");
  for (const g of r.gate) {
    console.log(`  ${g.campaignSlug.padEnd(35)} ${g.status.padEnd(6)}  margin=${(g.marginPct * 100).toFixed(1)}%  contrib=₹${g.contribution}`);
  }

  sep("Limitations");
  for (const l of r.limitations) {
    console.log(`  ⚠  ${l}`);
  }

  console.log("\n✅ Report complete.\n");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
