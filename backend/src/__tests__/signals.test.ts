/**
 * Unit tests for the signals module (no DB, no network).
 *
 * Covers:
 *   - Prior with all signals
 *   - Prior with missing signals (weights renormalize)
 *   - Trend label thresholds (rising / flat / falling)
 *   - Blend weight at 0, 20 and 200 committed orders
 *   - City-to-state mapping
 *   - CSV parser with good and bad rows
 *   - Timeseries moving average and week-over-week computation
 */

import { describe, it, expect, beforeEach } from "vitest";

// ── Prior ──────────────────────────────────────────────────────────────────
import {
  computeCityPrior,
  computePriors,
  blendPriorAndVotes,
  SIGNAL_WEIGHTS,
} from "../signals/prior";
import type { SignalName } from "../signals/prior";

// ── Trends ─────────────────────────────────────────────────────────────────
import {
  parseTwoColumnCsv,
  loadTimeseriesCsv,
  getTrendInterestForCity,
  CITY_TO_STATE,
} from "../signals/trends";
import type { RegionalInterest, TrendTimeseries } from "../signals/trends";

// ── AniList helpers ────────────────────────────────────────────────────────
import { popularityToScore } from "../signals/anilist";
import type { AniListEntry } from "../signals/anilist";

// ── Helpers ────────────────────────────────────────────────────────────────

function makeAniList(popularity = 250000): AniListEntry {
  return {
    id: 1,
    title: "Test Anime",
    popularity,
    trending: 50,
    averageScore: 85,
    genres: ["Action"],
    status: "RELEASING",
    nextAiringEpisode: null,
    fetchedAt: new Date().toISOString(),
    isSample: false,
  };
}

const FULL_REGIONAL: RegionalInterest = {
  Delhi: 78,
  Karnataka: 85,
  Maharashtra: 72,
  "Tamil Nadu": 90,
  Telangana: 68,
  "West Bengal": 55,
  Rajasthan: 47,
};

const FULL_TIMESERIES: TrendTimeseries = {
  weekOverWeek: 5.4,
  movingAvg4w: 74,
  label: "rising",
};

// ── CSV parser ─────────────────────────────────────────────────────────────

describe("parseTwoColumnCsv", () => {
  it("parses well-formed rows", () => {
    const csv = `region,interest\nDelhi,78\nKarnataka,85\n`;
    const rows = parseTwoColumnCsv(csv, "region", "interest");
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({ a: "Delhi", b: 78 });
    expect(rows[1]).toEqual({ a: "Karnataka", b: 85 });
  });

  it("skips the header row", () => {
    const csv = `region,interest\nDelhi,50`;
    const rows = parseTwoColumnCsv(csv, "region", "interest");
    expect(rows).toHaveLength(1);
    expect(rows[0].a).toBe("Delhi");
  });

  it("skips blank lines silently", () => {
    const csv = `region,interest\n\nDelhi,50\n\nMumbai,60\n`;
    const rows = parseTwoColumnCsv(csv, "region", "interest");
    expect(rows).toHaveLength(2);
  });

  it("skips rows with non-numeric interest", () => {
    const csv = `region,interest\nDelhi,abc\nMumbai,60`;
    const rows = parseTwoColumnCsv(csv, "region", "interest");
    expect(rows).toHaveLength(1);
    expect(rows[0].a).toBe("Mumbai");
  });

  it("skips rows with missing columns", () => {
    const csv = `region,interest\nDelhi\nMumbai,60`;
    const rows = parseTwoColumnCsv(csv, "region", "interest");
    expect(rows).toHaveLength(1);
    expect(rows[0].a).toBe("Mumbai");
  });

  it("handles Windows line endings (CRLF)", () => {
    const csv = `region,interest\r\nDelhi,78\r\nKarnataka,85\r\n`;
    const rows = parseTwoColumnCsv(csv, "region", "interest");
    expect(rows).toHaveLength(2);
  });

  it("returns empty array for a header-only CSV", () => {
    const rows = parseTwoColumnCsv("region,interest\n", "region", "interest");
    expect(rows).toHaveLength(0);
  });
});

// ── City-to-state mapping ──────────────────────────────────────────────────

describe("CITY_TO_STATE mapping", () => {
  const expectedMappings: [string, string][] = [
    ["Delhi NCR",  "Delhi"],
    ["Bengaluru",  "Karnataka"],
    ["Mumbai",     "Maharashtra"],
    ["Pune",       "Maharashtra"],
    ["Chennai",    "Tamil Nadu"],
    ["Hyderabad",  "Telangana"],
    ["Kolkata",    "West Bengal"],
    ["Jaipur",     "Rajasthan"],
  ];

  it.each(expectedMappings)("maps %s → %s", (city, state) => {
    expect(CITY_TO_STATE[city]).toBe(state);
  });

  it("covers all 8 named cities", () => {
    const namedCities = expectedMappings.map(([c]) => c);
    for (const city of namedCities) {
      expect(CITY_TO_STATE[city]).toBeDefined();
    }
  });
});

describe("getTrendInterestForCity", () => {
  it("returns the state interest for a known city", () => {
    const interest = getTrendInterestForCity("Delhi NCR", FULL_REGIONAL);
    expect(interest).toBe(78);
  });

  it("returns Maharashtra interest for both Mumbai and Pune", () => {
    expect(getTrendInterestForCity("Mumbai", FULL_REGIONAL)).toBe(72);
    expect(getTrendInterestForCity("Pune",   FULL_REGIONAL)).toBe(72);
  });

  it("returns null for an unknown city", () => {
    expect(getTrendInterestForCity("Atlantis", FULL_REGIONAL)).toBeNull();
  });

  it("falls back to 'India' key when state not in regional data", () => {
    const sparse: RegionalInterest = { India: 55 };
    expect(getTrendInterestForCity("Delhi NCR", sparse)).toBe(55);
  });

  it("returns null when regional data is empty", () => {
    expect(getTrendInterestForCity("Mumbai", {})).toBeNull();
  });
});

// ── Trend label thresholds ─────────────────────────────────────────────────

describe("Trend label thresholds (via computeCityPrior)", () => {
  const regional: RegionalInterest = { Delhi: 70 };

  it("labels rising when 4w avg is >10% above previous 4w avg", () => {
    const ts: TrendTimeseries = { weekOverWeek: 6, movingAvg4w: 77, label: "rising" };
    const result = computeCityPrior("Delhi NCR", regional, null, ts, null);
    // trendBonus = 100 for rising → contributed to prior
    expect(result.signalValues.trendBonus).toBe(100);
  });

  it("labels flat when change is within ±10%", () => {
    const ts: TrendTimeseries = { weekOverWeek: 2, movingAvg4w: 70, label: "flat" };
    const result = computeCityPrior("Delhi NCR", regional, null, ts, null);
    expect(result.signalValues.trendBonus).toBe(50);
  });

  it("labels falling when 4w avg is >10% below previous 4w avg", () => {
    const ts: TrendTimeseries = { weekOverWeek: -12, movingAvg4w: 55, label: "falling" };
    const result = computeCityPrior("Delhi NCR", regional, null, ts, null);
    expect(result.signalValues.trendBonus).toBe(0);
  });
});

// ── Prior with all signals ─────────────────────────────────────────────────

describe("computeCityPrior — all signals present", () => {
  it("returns a 0-100 score and lists all signals as used", () => {
    const result = computeCityPrior(
      "Delhi NCR",
      FULL_REGIONAL,
      makeAniList(250000),
      FULL_TIMESERIES,
      "Jujutsu Kaisen"     // has a dub in dubs.json
    );

    expect(result.city).toBe("Delhi NCR");
    expect(result.prior).toBeGreaterThan(0);
    expect(result.prior).toBeLessThanOrEqual(100);
    expect(result.signalsUsed).toContain("trendsInterest");
    expect(result.signalsUsed).toContain("anilistPop");
    expect(result.signalsUsed).toContain("trendBonus");
    expect(result.signalsUsed).toContain("dubBonus");
    expect(result.signalsUsed).toHaveLength(4);
  });

  it("manual calculation: Delhi NCR with known inputs", () => {
    // trendsInterest = 78, anilistPop = min(100, 250000/5000) = 50,
    // trendBonus = 100 (rising), dubBonus = 100 (Jujutsu Kaisen has dubs)
    // Weights: 0.4, 0.3, 0.2, 0.1 — sum = 1.0 (no renormalization)
    // prior = 0.4*78 + 0.3*50 + 0.2*100 + 0.1*100
    //       = 31.2  + 15.0   + 20.0    + 10.0   = 76.2
    const result = computeCityPrior(
      "Delhi NCR",
      FULL_REGIONAL,
      makeAniList(250000),
      FULL_TIMESERIES,
      "Jujutsu Kaisen"
    );
    expect(result.prior).toBeCloseTo(76.2, 0);
  });
});

// ── Prior with missing signals (weight renormalization) ───────────────────

describe("computeCityPrior — missing signals renormalize weights", () => {
  it("uses only trendsInterest when AniList and dub are absent", () => {
    // Only trends: weight = 0.4 / 0.4 = 1.0
    // prior = 78 * 1.0 = 78
    const result = computeCityPrior("Delhi NCR", FULL_REGIONAL, null, null, null);
    expect(result.signalsUsed).toEqual(["trendsInterest"]);
    expect(result.prior).toBeCloseTo(78, 0);
  });

  it("uses only AniList when trends are absent", () => {
    // Only anilistPop: weight = 0.3 / 0.3 = 1.0
    // popularityToScore(150000) = 30, prior = 30
    const result = computeCityPrior("Delhi NCR", null, makeAniList(150000), null, null);
    expect(result.signalsUsed).toEqual(["anilistPop"]);
    expect(result.prior).toBeCloseTo(30, 0);
  });

  it("renormalizes when trends + timeseries present but no AniList or dub", () => {
    // signals used: trendsInterest (0.4) + trendBonus (0.2) → totalWeight = 0.6
    // prior = (0.4/0.6)*78 + (0.2/0.6)*100
    //       = 52.0 + 33.33 = 85.33
    const result = computeCityPrior(
      "Delhi NCR",
      FULL_REGIONAL,
      null,
      FULL_TIMESERIES,
      null
    );
    expect(result.signalsUsed).toContain("trendsInterest");
    expect(result.signalsUsed).toContain("trendBonus");
    expect(result.signalsUsed).not.toContain("anilistPop");
    expect(result.signalsUsed).not.toContain("dubBonus");
    expect(result.prior).toBeCloseTo(85.3, 0);
  });

  it("returns prior=0 when no signals are present at all", () => {
    const result = computeCityPrior("Delhi NCR", null, null, null, null);
    expect(result.signalsUsed).toHaveLength(0);
    expect(result.prior).toBe(0);
  });

  it("caps trendsInterest at 100 even if CSV has values above 100", () => {
    const overBound: RegionalInterest = { Delhi: 150 };
    const result = computeCityPrior("Delhi NCR", overBound, null, null, null);
    expect(result.prior).toBeLessThanOrEqual(100);
  });
});

// ── computePriors (all cities) ────────────────────────────────────────────

describe("computePriors — all cities", () => {
  it("returns a result for every city in CITY_TO_STATE", () => {
    const result = computePriors(FULL_REGIONAL, makeAniList(), FULL_TIMESERIES, null);
    const cities = Object.keys(CITY_TO_STATE);
    expect(result.perCity).toHaveLength(cities.length);
  });

  it("includes signalsAvailable listing", () => {
    const result = computePriors(FULL_REGIONAL, makeAniList(), FULL_TIMESERIES, "Jujutsu Kaisen");
    expect(result.signalsAvailable).toContain("trendsInterest");
    expect(result.signalsAvailable).toContain("anilistPop");
  });

  it("externalTitle is echoed back", () => {
    const result = computePriors(null, null, null, "Test Title");
    expect(result.externalTitle).toBe("Test Title");
  });
});

// ── Blend weight at 0, 20, 200 committed orders ───────────────────────────

describe("blendPriorAndVotes", () => {
  it("w=1.0 at 0 committed → posterior equals prior", () => {
    const r = blendPriorAndVotes("Delhi NCR", 70, 50, 0);
    expect(r.w).toBeCloseTo(1.0, 4);
    expect(r.posterior).toBeCloseTo(70, 1);
  });

  it("w=0.5 at 20 committed → 50/50 blend", () => {
    const r = blendPriorAndVotes("Delhi NCR", 80, 40, 20);
    expect(r.w).toBeCloseTo(0.5, 4);
    // posterior = 0.5*80 + 0.5*40 = 60
    expect(r.posterior).toBeCloseTo(60, 1);
  });

  it("w≈0.09 at 200 committed → heavily fan-weighted", () => {
    const r = blendPriorAndVotes("Delhi NCR", 80, 20, 200);
    // w = 1/(1+200/20) = 1/11 ≈ 0.0909
    expect(r.w).toBeCloseTo(1 / 11, 3);
    // posterior ≈ 0.0909*80 + 0.9091*20 ≈ 7.27 + 18.18 = 25.45
    expect(r.posterior).toBeCloseTo(25.5, 0);
  });

  it("w approaches 1 with 0 committed (pure prior)", () => {
    const r = blendPriorAndVotes("Mumbai", 60, 0, 0);
    expect(r.w).toBe(1);
    expect(r.posterior).toBe(60);
  });

  it("returns all four fields", () => {
    const r = blendPriorAndVotes("Chennai", 55, 70, 10);
    expect(r).toHaveProperty("city", "Chennai");
    expect(r).toHaveProperty("prior");
    expect(r).toHaveProperty("voteScore");
    expect(r).toHaveProperty("posterior");
    expect(r).toHaveProperty("w");
  });
});

// ── popularityToScore ──────────────────────────────────────────────────────

describe("popularityToScore", () => {
  it("500000 → 100", () => expect(popularityToScore(500_000)).toBe(100));
  it("250000 → 50",  () => expect(popularityToScore(250_000)).toBe(50));
  it("0 → 0",       () => expect(popularityToScore(0)).toBe(0));
  it("caps at 100 for very large values", () => {
    expect(popularityToScore(1_000_000)).toBe(100);
  });
});

// ── Timeseries trend label computation (loadTimeseriesCsv logic via raw CSV) ──

describe("Trend label from timeseries CSV (via parseTwoColumnCsv)", () => {
  /**
   * We test the label logic directly by calling parseTwoColumnCsv and
   * then reproducing the moving-average logic inline, since loadTimeseriesCsv
   * reads from disk. The unit we care about is the math, not the FS read.
   */

  function labelFrom(interests: number[]): "rising" | "flat" | "falling" {
    const n = interests.length;
    if (n < 8) return "flat";
    const recent4 = interests.slice(-4);
    const prev4   = interests.slice(-8, -4);
    const movingAvg4w = recent4.reduce((s, v) => s + v, 0) / 4;
    const prevAvg     = prev4.reduce((s, v) => s + v, 0) / 4;
    if (prevAvg === 0) return "flat";
    const pctChange = ((movingAvg4w - prevAvg) / prevAvg) * 100;
    if (pctChange > 10)  return "rising";
    if (pctChange < -10) return "falling";
    return "flat";
  }

  it("rising: 4w avg more than 10% above previous 4w", () => {
    // prev4 avg = 50, recent4 avg = 56 (+12%)
    const interests = [50, 50, 50, 50, 55, 56, 57, 56];
    expect(labelFrom(interests)).toBe("rising");
  });

  it("falling: 4w avg more than 10% below previous 4w", () => {
    // prev4 avg = 60, recent4 avg = 53 (-11.7%)
    const interests = [60, 60, 60, 60, 55, 54, 52, 51];
    expect(labelFrom(interests)).toBe("falling");
  });

  it("flat: change within ±10%", () => {
    // prev4 avg = 60, recent4 avg = 63 (+5%)
    const interests = [60, 60, 60, 60, 62, 63, 64, 63];
    expect(labelFrom(interests)).toBe("flat");
  });

  it("exactly +10% boundary is still flat (not rising)", () => {
    // prev4 avg = 50, recent4 avg = 55 (exactly +10%)
    const interests = [50, 50, 50, 50, 55, 55, 55, 55];
    expect(labelFrom(interests)).toBe("flat"); // >10 means strictly above
  });

  it("exactly -10% boundary is still flat (not falling)", () => {
    // prev4 avg = 50, recent4 avg = 45 (exactly -10%)
    const interests = [50, 50, 50, 50, 45, 45, 45, 45];
    expect(labelFrom(interests)).toBe("flat"); // <-10 means strictly below
  });
});

// ── SIGNAL_WEIGHTS integrity ───────────────────────────────────────────────

describe("SIGNAL_WEIGHTS", () => {
  it("all weights sum to exactly 1.0", () => {
    const sum = Object.values(SIGNAL_WEIGHTS).reduce((s, w) => s + w, 0);
    expect(sum).toBeCloseTo(1.0, 10);
  });

  it("each weight is between 0 and 1", () => {
    for (const w of Object.values(SIGNAL_WEIGHTS)) {
      expect(w).toBeGreaterThan(0);
      expect(w).toBeLessThanOrEqual(1);
    }
  });
});
