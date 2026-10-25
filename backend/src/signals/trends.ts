/**
 * Google Trends reader.
 *
 * The official Google Trends API is alpha / invite-only, so this module reads
 * CSV exports that the studio places in backend/data/trends/.
 *
 * HOW TO EXPORT:
 *   1. Go to https://trends.google.com/trends/explore
 *   2. Search for your title, set geo = India, subregion view.
 *   3. Click the download icon → save as data/trends/<campaign-slug>.csv
 *   4. For timeseries: switch to "Interest over time", download as
 *      data/trends/<campaign-slug>-timeseries.csv
 *
 * CSV formats expected:
 *   Regional:    region,interest  (interest 0-100)
 *   Timeseries:  week,interest    (week ISO date, interest 0-100)
 */

import fs from "fs";
import path from "path";

// ── City → Indian state mapping ───────────────────────────────────────────
/**
 * Maps fan-facing city labels to the Indian state names used in Google Trends
 * subregion data.  Edit this object if Trends changes its state labels.
 */
export const CITY_TO_STATE: Record<string, string> = {
  "Delhi NCR":  "Delhi",
  "Bengaluru":  "Karnataka",
  "Mumbai":     "Maharashtra",
  "Pune":       "Maharashtra",
  "Chennai":    "Tamil Nadu",
  "Hyderabad":  "Telangana",
  "Kolkata":    "West Bengal",
  "Jaipur":     "Rajasthan",
  "Other city": "India",          // Fallback — uses the national average
};

// ── Types ─────────────────────────────────────────────────────────────────

export type RegionalInterest = Record<string, number>; // state → 0-100

export type TrendLabel = "rising" | "flat" | "falling";

export type TrendTimeseries = {
  weekOverWeek: number | null;   // pct change last week vs the week before
  movingAvg4w: number | null;    // 4-week moving average of latest 4 weeks
  label: TrendLabel;
};

export type TrendsData = {
  regional: RegionalInterest;
  timeseries: TrendTimeseries | null;
};

// ── CSV parser helpers ────────────────────────────────────────────────────

/** Parse a two-column CSV (skips header, blank rows and bad rows silently). */
export function parseTwoColumnCsv(
  raw: string,
  col0: string,
  col1: string
): Array<{ a: string; b: number }> {
  const lines = raw.split(/\r?\n/);
  const results: Array<{ a: string; b: number }> = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const parts = trimmed.split(",");
    if (parts.length < 2) continue;

    const aVal = parts[0].trim();
    const bRaw = parts[parts.length - 1].trim(); // last column (handles commas in region names)
    const bVal = parseFloat(bRaw);

    // Skip header row and bad rows
    if (aVal === col0 || aVal === col1) continue;
    if (isNaN(bVal)) continue;

    results.push({ a: aVal, b: bVal });
  }

  return results;
}

// ── Regional CSV ─────────────────────────────────────────────────────────

const TRENDS_DIR = path.resolve(process.cwd(), "data", "trends");

export function loadRegionalCsv(slug: string): RegionalInterest | null {
  const filePath = path.join(TRENDS_DIR, `${slug}.csv`);
  if (!fs.existsSync(filePath)) return null;

  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    const rows = parseTwoColumnCsv(raw, "region", "interest");
    const result: RegionalInterest = {};
    for (const row of rows) {
      result[row.a] = Math.max(0, Math.min(100, row.b));
    }
    return Object.keys(result).length > 0 ? result : null;
  } catch (err) {
    console.warn(`[trends] Could not read ${filePath}:`, (err as Error).message);
    return null;
  }
}

// ── Timeseries CSV ────────────────────────────────────────────────────────

export function loadTimeseriesCsv(slug: string): TrendTimeseries | null {
  const filePath = path.join(TRENDS_DIR, `${slug}-timeseries.csv`);
  if (!fs.existsSync(filePath)) return null;

  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    const rows = parseTwoColumnCsv(raw, "week", "interest");
    if (rows.length < 2) return null;

    // Sort by date ascending
    rows.sort((a, b) => a.a.localeCompare(b.a));

    const interests = rows.map((r) => r.b);
    const n = interests.length;

    // Week-over-week change (last two data points)
    const weekOverWeek =
      n >= 2 && interests[n - 2] !== 0
        ? ((interests[n - 1] - interests[n - 2]) / interests[n - 2]) * 100
        : null;

    // 4-week moving average of the most recent 4 weeks
    const recent4 = interests.slice(-4);
    const movingAvg4w =
      recent4.length === 4
        ? recent4.reduce((s, v) => s + v, 0) / 4
        : null;

    // Previous 4 weeks for comparison
    const prev4 = interests.slice(-8, -4);
    const prevAvg =
      prev4.length === 4
        ? prev4.reduce((s, v) => s + v, 0) / 4
        : null;

    let label: TrendLabel = "flat";
    if (movingAvg4w !== null && prevAvg !== null && prevAvg !== 0) {
      const pctChange = ((movingAvg4w - prevAvg) / prevAvg) * 100;
      if (pctChange > 10) label = "rising";
      else if (pctChange < -10) label = "falling";
    }

    return { weekOverWeek, movingAvg4w, label };
  } catch (err) {
    console.warn(`[trends] Could not read timeseries:`, (err as Error).message);
    return null;
  }
}

// ── Public interface ──────────────────────────────────────────────────────

export function loadTrends(slug: string): TrendsData {
  const regional = loadRegionalCsv(slug) ?? {};
  const timeseries = loadTimeseriesCsv(slug);
  return { regional, timeseries };
}

/**
 * Get the trends interest (0-100) for a specific city.
 * Uses the city→state mapping; returns null if no data is available.
 */
export function getTrendInterestForCity(
  city: string,
  regional: RegionalInterest
): number | null {
  const state = CITY_TO_STATE[city];
  if (!state) return null;
  if (regional[state] !== undefined) return regional[state];
  // Fallback: "India" national average
  if (regional["India"] !== undefined) return regional["India"];
  return null;
}
