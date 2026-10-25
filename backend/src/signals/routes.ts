/**
 * GET /api/campaigns/:slug/prior
 *
 * Returns a demand prior built from public signals blended with real fan votes.
 * Never crashes — falls back gracefully through: live AniList → 24h cache → sample-signals.json.
 *
 * Response shape:
 * {
 *   asOf: string,
 *   signalsUsed: string[],
 *   perCity: [{ city, prior, voteScore, posterior, w }],
 *   trend: { label, weekOverWeek } | null,
 *   sources: [{ name, url, fetchedAt, isSample }]
 * }
 */

import { Router } from "express";
import path from "path";
import fs from "fs";
import prisma from "../db";
import { sendError } from "../errorShape";
import { fetchAniList, popularityToScore } from "./anilist";
import { loadTrends } from "./trends";
import { computePriors, blendPriorAndVotes } from "./prior";

const router = Router({ mergeParams: true });

// Path to sample signals fallback
const SAMPLE_SIGNALS_PATH = path.resolve(process.cwd(), "data", "sample-signals.json");

function loadSampleSignals() {
  try {
    return JSON.parse(fs.readFileSync(SAMPLE_SIGNALS_PATH, "utf-8"));
  } catch {
    return null;
  }
}

router.get("/prior", async (req: import("express").Request<{ slug: string }>, res) => {
  const { slug } = req.params;

  // ── Load campaign ────────────────────────────────────────────────────────
  const campaign = await prisma.campaign.findUnique({
    where: { slug },
    include: { marginGate: true },
  });

  if (!campaign) return sendError(res, 404, "Campaign not found");

  // ── AniList signal ───────────────────────────────────────────────────────
  let anilistEntry: any = null;
  let anilistIsSample = false;
  let anilistFetchedAt: string | null = null;

  const externalTitle = (campaign as any).externalTitle as string | null;

  if (externalTitle) {
    try {
      anilistEntry = await fetchAniList(externalTitle);
    } catch {
      anilistEntry = null;
    }
  }

  if (!anilistEntry) {
    const sample = loadSampleSignals();
    if (sample?.anilist) {
      anilistEntry = sample.anilist;
      anilistIsSample = true;
      anilistFetchedAt = sample.anilist.fetchedAt ?? null;
    }
  } else {
    anilistFetchedAt = anilistEntry.fetchedAt ?? new Date().toISOString();
  }

  // ── Trends signal ────────────────────────────────────────────────────────
  const trendsData = loadTrends(slug);

  // ── Compute priors ───────────────────────────────────────────────────────
  const priorResult = computePriors(
    Object.keys(trendsData.regional).length > 0 ? trendsData.regional : null,
    anilistEntry,
    trendsData.timeseries,
    externalTitle
  );

  // ── Load vote scores (segment demand scores per city) ────────────────────
  const committedCount = await prisma.pledge.count({
    where: {
      campaignId: campaign.id,
      withdrawn: false,
      status: { in: ["PREAUTHORIZED", "CAPTURED"] },
    },
  });

  // Get all non-withdrawn pledges to build per-city vote scores
  const pledges = await prisma.pledge.findMany({
    where: { campaignId: campaign.id, withdrawn: false },
    select: { city: true },
  });

  // Simple city vote score: fraction of pledges from this city × 100
  const cityCount: Record<string, number> = {};
  for (const p of pledges) {
    cityCount[p.city] = (cityCount[p.city] ?? 0) + 1;
  }
  const totalPledges = pledges.length;

  // Blend prior and vote score per city
  const blended = priorResult.perCity.map((cp) => {
    const count = cityCount[cp.city] ?? 0;
    const voteScore = totalPledges > 0 ? Math.min(100, (count / totalPledges) * 100 * 3) : 0;
    return blendPriorAndVotes(cp.city, cp.prior, voteScore, committedCount);
  });

  // ── Build sources list ───────────────────────────────────────────────────
  const sources: Array<{ name: string; url: string; fetchedAt: string | null; isSample: boolean }> = [];

  if (anilistEntry) {
    sources.push({
      name: "AniList",
      url: externalTitle
        ? `https://anilist.co/search/anime?search=${encodeURIComponent(externalTitle)}`
        : "https://anilist.co",
      fetchedAt: anilistFetchedAt,
      isSample: anilistIsSample,
    });
  }

  if (Object.keys(trendsData.regional).length > 0) {
    sources.push({
      name: "Google Trends (regional CSV)",
      url: "https://trends.google.com/trends/explore",
      fetchedAt: null,    // CSV is manually exported; no fetch timestamp
      isSample: false,
    });
  }

  res.json({
    asOf: priorResult.asOf,
    signalsUsed: priorResult.signalsAvailable,
    perCity: blended,
    trend: trendsData.timeseries
      ? {
          label: trendsData.timeseries.label,
          weekOverWeek: trendsData.timeseries.weekOverWeek !== null
            ? parseFloat(trendsData.timeseries.weekOverWeek.toFixed(1))
            : null,
          movingAvg4w: trendsData.timeseries.movingAvg4w !== null
            ? parseFloat(trendsData.timeseries.movingAvg4w.toFixed(1))
            : null,
        }
      : null,
    sources,
    _meta: {
      isSample: anilistIsSample,
      note: "Public signals suggest what to test; our fan test decides what to make. Not a forecast.",
    },
  });
});

export default router;
