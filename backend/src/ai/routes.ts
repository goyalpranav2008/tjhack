import { Router } from "express";
import prisma from "../db";
import { evaluateGate } from "../gate";
import { sendError } from "../errorShape";
import { clusterComments } from "./cluster";
import { generateBrief } from "./brief";
import { buildGateInput } from "../gateInputBuilder";

const router = Router();

// ── POST /api/campaigns/:slug/insights ────────────────────────────────────
// Clusters fan comments for a campaign into 3-5 topic groups.

router.post("/:slug/insights", async (req, res) => {
  const campaign = await prisma.campaign.findUnique({
    where: { slug: req.params.slug },
  });
  if (!campaign) return sendError(res, 404, "Campaign not found");

  const pledges = await prisma.pledge.findMany({
    where: { campaignId: campaign.id, comment: { not: null }, withdrawn: false },
    select: { comment: true },
  });

  const comments = pledges
    .map((p) => (p.comment ?? "").trim())
    .filter((c) => c.length > 0);

  const clusters = clusterComments(comments);

  res.json({
    campaignSlug: campaign.slug,
    totalComments: comments.length,
    // Make it clear this is heuristic when no embedding service is wired up
    method: "keyword-heuristic",
    clusters,
  });
});

// ── POST /api/campaigns/:slug/brief ───────────────────────────────────────
// Generates (or returns cached) structured launch brief.

router.post("/:slug/brief", async (req, res) => {
  const campaign = await prisma.campaign.findUnique({
    where:   { slug: req.params.slug },
    include: { marginGate: true },
  });
  if (!campaign) return sendError(res, 404, "Campaign not found");

  // Build live gate verdict using committed (PREAUTHORIZED or CAPTURED) count
  const committedCount = await prisma.pledge.count({
    where: {
      campaignId: campaign.id,
      withdrawn: false,
      status: { in: ["PREAUTHORIZED", "CAPTURED"] },
    },
  });

  const gateInput = buildGateInput(campaign, committedCount);
  const gateResult = evaluateGate(gateInput);

  // Top segment by non-withdrawn pledge count
  const segments = await prisma.pledge.groupBy({
    by: ["city", "language"],
    where: { campaignId: campaign.id, withdrawn: false },
    _count: { id: true },
    orderBy: { _count: { id: "desc" } },
    take: 1,
  });

  const topSeg = segments[0]
    ? { city: segments[0].city, language: segments[0].language, count: segments[0]._count.id }
    : null;

  // Clusters (non-withdrawn)
  const pledgesWithComments = await prisma.pledge.findMany({
    where:  { campaignId: campaign.id, comment: { not: null }, withdrawn: false },
    select: { comment: true },
  });
  const comments = pledgesWithComments
    .map((p) => (p.comment ?? "").trim())
    .filter((c) => c.length > 0);
  const clusters = clusterComments(comments);

  const brief = await generateBrief(
    campaign.id,
    campaign.title,
    gateResult,
    committedCount,
    topSeg,
    clusters
  );

  res.json(brief);
});

export default router;
