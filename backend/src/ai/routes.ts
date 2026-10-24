import { Router } from "express";
import prisma from "../db";
import { evaluateGate, GateInput } from "../gate";
import { COST_PROFILES } from "../costProfiles";
import { sendError } from "../errorShape";
import { clusterComments } from "./cluster";
import { generateBrief } from "./brief";

const router = Router();

// ── POST /api/campaigns/:slug/insights ────────────────────────────────────
// Clusters fan comments for a campaign into 3-5 topic groups.

router.post("/:slug/insights", async (req, res) => {
  const campaign = await prisma.campaign.findUnique({
    where: { slug: req.params.slug },
  });
  if (!campaign) return sendError(res, 404, "Campaign not found");

  const pledges = await prisma.pledge.findMany({
    where: { campaignId: campaign.id, comment: { not: null } },
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

  // Build live gate verdict using current pledge count
  const pledgeCount = await prisma.pledge.count({
    where: { campaignId: campaign.id },
  });

  const profile = COST_PROFILES[campaign.format] ?? COST_PROFILES["TEE"];
  const gate    = campaign.marginGate;

  const gateInput: GateInput = {
    price:          campaign.listPrice,
    royaltyPct:     gate?.royaltyPct     ?? profile.royaltyPct,
    paymentFeePct:  gate?.paymentFeePct  ?? profile.paymentFeePct,
    referralPct:    gate?.referralPct    ?? profile.referralPct,
    productionCost: gate?.productionCost ?? profile.productionCost,
    logisticsCost:  gate?.logisticsCost  ?? profile.logisticsCost,
    packagingCost:  gate?.packagingCost  ?? profile.packagingCost,
    orders:         pledgeCount,
    minRun:         campaign.minRun,
    orderCap:       campaign.orderCap,
    fixedSetupCost: campaign.fixedSetupCost,
    rightsCleared:  campaign.rightsCleared,
    thresholdPct:   gate?.thresholdPct   ?? 0.20,
  };

  const gateResult = evaluateGate(gateInput);

  // Top segment by pledge count
  const segments = await prisma.pledge.groupBy({
    by: ["city", "language"],
    where: { campaignId: campaign.id },
    _count: { id: true },
    orderBy: { _count: { id: "desc" } },
    take: 1,
  });

  const topSeg = segments[0]
    ? { city: segments[0].city, language: segments[0].language, count: segments[0]._count.id }
    : null;

  // Clusters
  const pledgesWithComments = await prisma.pledge.findMany({
    where:  { campaignId: campaign.id, comment: { not: null } },
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
    topSeg,
    clusters
  );

  res.json(brief);
});

export default router;
