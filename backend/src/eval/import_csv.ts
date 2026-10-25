/**
 * npm run eval:import
 *
 * Loads backend/data/labeled_comments.csv into the LabeledComment table.
 * Idempotent: uses upsert keyed on (text, scriptLanguage) — re-running never
 * creates duplicates. Comments are PII-scrubbed before storage.
 */

import "dotenv/config";
import fs from "fs";
import path from "path";
import prisma from "../db";
import { scrubPII } from "./pii";

const CSV_PATH = path.resolve(process.cwd(), "data", "labeled_comments.csv");

const VALID_LANGUAGES = new Set(["Hindi", "Tamil", "Telugu", "Bengali", "English", "Hinglish"]);
const VALID_TOPICS    = new Set(["price", "dubbing", "merch-quality", "delivery", "events", "other"]);
const VALID_SENTIMENTS = new Set(["positive", "negative", "neutral"]);

function parseCSV(raw: string): Array<{
  text: string;
  scriptLanguage: string;
  topicLabel: string;
  sentimentLabel: string;
  source: string;
}> {
  const lines = raw.split(/\r?\n/);
  const results = [];
  let headerSeen = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    // Parse the header
    if (!headerSeen) {
      // Tolerate variations in column order (just verify it has these fields)
      if (trimmed.toLowerCase().includes("text") && trimmed.toLowerCase().includes("topiclabel")) {
        headerSeen = true;
      }
      continue;
    }

    // Minimal CSV parser: handles one level of double-quoted fields with commas
    const cols = parseLine(trimmed);
    if (cols.length < 5) continue;

    const text           = cols[0].trim();
    const scriptLanguage = cols[1].trim();
    const topicLabel     = cols[2].trim();
    const sentimentLabel = cols[3].trim();
    const source         = cols[4].trim();

    if (!text) continue;
    if (!VALID_LANGUAGES.has(scriptLanguage))  { console.warn(`  Skip: unknown language "${scriptLanguage}" — "${text.slice(0,40)}"`);  continue; }
    if (!VALID_TOPICS.has(topicLabel))          { console.warn(`  Skip: unknown topic "${topicLabel}" — "${text.slice(0,40)}"`);          continue; }
    if (!VALID_SENTIMENTS.has(sentimentLabel))  { console.warn(`  Skip: unknown sentiment "${sentimentLabel}" — "${text.slice(0,40)}"`);  continue; }

    results.push({ text, scriptLanguage, topicLabel, sentimentLabel, source });
  }
  return results;
}

function parseLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuote = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuote && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuote = !inQuote;
      }
    } else if (ch === "," && !inQuote) {
      result.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

async function main() {
  if (!fs.existsSync(CSV_PATH)) {
    console.error(`CSV not found: ${CSV_PATH}`);
    process.exit(1);
  }

  const raw  = fs.readFileSync(CSV_PATH, "utf-8");
  const rows = parseCSV(raw);

  console.log(`\n=== eval:import ===`);
  console.log(`Parsed ${rows.length} rows from ${path.basename(CSV_PATH)}`);

  let created = 0;
  let skipped = 0;

  for (const row of rows) {
    const scrubbed = scrubPII(row.text);

    // Idempotent upsert keyed on (scrubbed text, language)
    // We use updateMany+create pattern because SQLite composite unique needs schema support.
    // Here we check existence manually to stay schema-independent.
    const existing = await prisma.labeledComment.findFirst({
      where: { text: scrubbed, scriptLanguage: row.scriptLanguage },
    });

    if (existing) {
      skipped++;
    } else {
      await prisma.labeledComment.create({
        data: {
          text:           scrubbed,
          scriptLanguage: row.scriptLanguage,
          topicLabel:     row.topicLabel,
          sentimentLabel: row.sentimentLabel,
          source:         row.source,
        },
      });
      created++;
    }
  }

  console.log(`Created: ${created}  Skipped (already exists): ${skipped}`);
  console.log("Done.\n");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
