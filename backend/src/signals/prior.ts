/**
 * Prior score engine.
 *
 * Computes a 0-100 demand-prior score per city from public signals:
 *   - Google Trends regional interest (from CSV export)
 *   - AniList popularity rank score
 *   - Trend direction bonus (rising / flat / falling)
 *   - Dub availability bonus
 *
 * WEIGHTS (editable — must sum to 1.0):
 *   trendsInterest   0.40  Google Trends state interest (0-100)
 *   anilistPop       0.30  AniList popularity mapped to 0-100
 *   trendBonus       0.20  rising=100 / flat=50 / falling=0
 *   dubBonus         0.10  100 if dub available in fan language, else 0
 *
 * Missing signals are dropped and the remaining weights are renormalized
 * so the output is always on the same 0-100 scale.
 */

import path from "path";
import fs from "fs";
import { AniListEntry, popularityToScore } from "./anilist";
import {
  RegionalInterest,
  TrendTimeseries,
  TrendLabel,
  getTrendInterestForCity,
  CITY_TO_STATE,
} from "./trends";

// ── Weight config ─────────────────────────────────────────────────────────

export const SIGNAL_WEIGHTS = {
  trendsInterest: 0.40,
  anilistPop:     0.30,
  trendBonus:     0.20,
  dubBonus:       0.10,
} as const;

export type SignalName = keyof typeof SIGNAL_WEIGHTS;

// ── Dub config ────────────────────────────────────────────────────────────

const DUBS_PATH = path.resolve(process.cwd(), "data", "dubs.json");

let _dubsCache: Record<string, string[]> | null = null;

function getDubs(): Record<string, string[]> {
  if (_dubsCache) return _dubsCache;
  try {
    _dubsCache = JSON.parse(fs.readFileSync(DUBS_PATH, "utf-8"));
    return _dubsCache!;
  } catch {
    _dubsCache = {};
    return _dubsCache;
  }
}

function hasDub(externalTitle: string | null | undefined): boolean {
  if (!externalTitle) return false;
  const dubs = getDubs();
  const key = externalTitle.toLowerCase().trim();
  const langs = dubs[key];
  if (!langs) return false;
  // Bonus if Hindi, Tamil, or Telugu dub available (major Indian markets)
  return langs.some((l) =>
    ["hindi", "tamil", "telugu"].includes(l.toLowerCase())
  );
}

// ── Types ─────────────────────────────────────────────────────────────────

export type CityPrior = {
  city: string;
  prior: number;            // 0-100
  signalsUsed: SignalName[];
  signalValues: Partial<Record<SignalName, number>>; // raw 0-100 component scores
};

export type PriorResult = {
  asOf: string;             // ISO timestamp
  externalTitle: string | null;
  signalsAvailable: SignalName[];
  perCity: CityPrior[];
};

// ── Core computation ──────────────────────────────────────────────────────

/**
 * Compute a prior score for a single city.
 *
 * @param city             Fan-facing city name (e.g. "Delhi NCR")
 * @param regional         Trends regional data (state → 0-100), or null
 * @param anilist          AniList entry, or null
 * @param timeseries       Trend timeseries, or null
 * @param externalTitle    Used to look up dub availability
 */
export function computeCityPrior(
  city: string,
  regional: RegionalInterest | null,
  anilist: AniListEntry | null,
  timeseries: TrendTimeseries | null,
  externalTitle?: string | null
): CityPrior {
  const components: Partial<Record<SignalName, number>> = {};
  const used: SignalName[] = [];

  // 1. Trends interest
  const trendInterest =
    regional ? getTrendInterestForCity(city, regional) : null;
  if (trendInterest !== null) {
    components.trendsInterest = Math.max(0, Math.min(100, trendInterest));
    used.push("trendsInterest");
  }

  // 2. AniList popularity
  if (anilist) {
    components.anilistPop = Math.min(100, popularityToScore(anilist.popularity));
    used.push("anilistPop");
  }

  // 3. Trend direction bonus
  if (timeseries) {
    const bonusMap: Record<TrendLabel, number> = { rising: 100, flat: 50, falling: 0 };
    components.trendBonus = bonusMap[timeseries.label];
    used.push("trendBonus");
  }

  // 4. Dub bonus
  if (externalTitle) {
    components.dubBonus = hasDub(externalTitle) ? 100 : 0;
    used.push("dubBonus");
  }

  // Renormalize weights if some signals are missing
  const totalWeight = used.reduce((s, k) => s + SIGNAL_WEIGHTS[k], 0);

  let prior = 0;
  if (totalWeight > 0) {
    for (const signal of used) {
      const normalized = SIGNAL_WEIGHTS[signal] / totalWeight;
      prior += normalized * (components[signal] ?? 0);
    }
  }

  return {
    city,
    prior: parseFloat(prior.toFixed(1)),
    signalsUsed: used,
    signalValues: components,
  };
}

/**
 * Compute prior scores for all known fan cities.
 */
export function computePriors(
  regional: RegionalInterest | null,
  anilist: AniListEntry | null,
  timeseries: TrendTimeseries | null,
  externalTitle?: string | null
): PriorResult {
  const cities = Object.keys(CITY_TO_STATE);

  const perCity = cities.map((city) =>
    computeCityPrior(city, regional, anilist, timeseries, externalTitle)
  );

  // Determine which signals were available at all
  const signalsAvailable: SignalName[] = [];
  if (regional && Object.keys(regional).length > 0) signalsAvailable.push("trendsInterest");
  if (anilist) signalsAvailable.push("anilistPop", "trendBonus");
  if (timeseries) {
    if (!signalsAvailable.includes("trendBonus")) signalsAvailable.push("trendBonus");
  }
  if (externalTitle) signalsAvailable.push("dubBonus");

  return {
    asOf: new Date().toISOString(),
    externalTitle: externalTitle ?? null,
    signalsAvailable: [...new Set(signalsAvailable)],
    perCity,
  };
}

// ── Blend ─────────────────────────────────────────────────────────────────

export type BlendResult = {
  city: string;
  prior: number;
  voteScore: number;
  posterior: number;
  w: number;               // weight given to prior (0=all fan votes, 1=all prior)
};

/**
 * Blend prior and fan vote score into a posterior.
 *
 *   w = 1 / (1 + committedCount / 20)
 *   posterior = w * prior + (1 - w) * voteScore
 *
 * With 0 committed fans:  w = 1.0  → posterior equals prior
 * With 20 committed fans: w = 0.5  → 50/50 blend
 * With 200 committed fans: w ≈ 0.09 → heavily fan-weighted
 */
export function blendPriorAndVotes(
  city: string,
  prior: number,
  voteScore: number,
  committedCount: number
): BlendResult {
  const w = 1 / (1 + committedCount / 20);
  const posterior = w * prior + (1 - w) * voteScore;
  return {
    city,
    prior: parseFloat(prior.toFixed(1)),
    voteScore: parseFloat(voteScore.toFixed(1)),
    posterior: parseFloat(posterior.toFixed(1)),
    w: parseFloat(w.toFixed(4)),
  };
}
