import { Router } from "express";
import { z } from "zod";
import prisma from "../db";
import { evaluateGate, GateInput } from "../gate";
import { COST_PROFILES } from "../costProfiles";
import { sendError, sendZodError } from "../errorShape";
import { requireStudioKey } from "../middleware/auth";

const router = Router();

// ── Schemas ────────────────────────────────────────────────────────────────

const CreateCampaignSchema = z.object({
  slug: z.string().min(1),
  title: z.string().min(1),
  format: z.enum(["TEE", "POSTER", "CHAPTER", "EVENT"]),
  listPrice: z.number().int().positive(),
  minRun: z.number().int().positive().optional(),
  orderCap: z.number().int().positive().optional(),
  fixedSetupCost: z.number().int().positive().optional(),
  rightsCleared: z.boolean().default(false),
  // MarginGate params (optional; defaults come from cost profile)
  thresholdPct: z.number().min(0).max(1).optional(),
  royaltyPct: z.number().min(0).max(1).optional(),
  paymentFeePct: z.number().min(0).max(1).optional(),
  referralPct: z.number().min(0).max(1).optional(),
  productionCost: z.number().int().min(0).optional(),
  logisticsCost: z.number().int().min(0).optional(),
  packagingCost: z.number().int().min(0).optional(),
});

const EvaluateGateSchema = z.object({
  campaignId: z.number().int().positive().optional(),
  price: z.number().positive(),
  format: z.enum(["TEE", "POSTER", "CHAPTER", "EVENT"]),
  orders: z.number().int().min(0),
  minRun: z.number().int().positive().optional(),
  orderCap: z.number().int().positive().optional(),
  rightsCleared: z.boolean().optional(),
  thresholdPct: z.number().min(0).max(1).optional(),
  royaltyPct: z.number().min(0).max(1).optional(),
  paymentFeePct: z.number().min(0).max(1).optional(),
  referralPct: z.number().min(0).max(1).optional(),
  productionCost: z.number().int().min(0).optional(),
  logisticsCost: z.number().int().min(0).optional(),
  packagingCost: z.number().int().min(0).optional(),
  fixedSetupCost: z.number().int().positive().optional(),
});

// ── Helpers ────────────────────────────────────────────────────────────────

type CampaignWithGate = {
  id: number;
  slug: string;
  title: string;
  format: string;
  listPrice: number;
  minRun: number;
  orderCap: number;
  fixedSetupCost: number;
  rightsCleared: boolean;
  status: string;
  createdAt: Date;
  marginGate: {
    thresholdPct: number;
    royaltyPct: number;
    paymentFeePct: number;
    referralPct: number;
    productionCost: number;
    logisticsCost: number;
    packagingCost: number;
  } | null;
};

/** Build live stats + gate verdict for a campaign */
async function buildCampaignStats(campaign: CampaignWithGate) {
  const pledgeCount = await prisma.pledge.count({
    where: { campaignId: campaign.id },
  });

  const progressPct =
    campaign.minRun > 0
      ? parseFloat(((pledgeCount / campaign.minRun) * 100).toFixed(1))
      : 0;

  const profile = COST_PROFILES[campaign.format] ?? COST_PROFILES["TEE"];
  const gate = campaign.marginGate;

  const gateInput: GateInput = {
    price: campaign.listPrice,
    royaltyPct: gate?.royaltyPct ?? profile.royaltyPct,
    paymentFeePct: gate?.paymentFeePct ?? profile.paymentFeePct,
    referralPct: gate?.referralPct ?? profile.referralPct,
    productionCost: gate?.productionCost ?? profile.productionCost,
    logisticsCost: gate?.logisticsCost ?? profile.logisticsCost,
    packagingCost: gate?.packagingCost ?? profile.packagingCost,
    orders: pledgeCount,
    minRun: campaign.minRun,
    orderCap: campaign.orderCap,
    fixedSetupCost: campaign.fixedSetupCost,
    rightsCleared: campaign.rightsCleared,
    thresholdPct: gate?.thresholdPct ?? 0.20,
  };

  const verdict = evaluateGate(gateInput);

  return {
    ...campaign,
    pledgeCount,
    progressPct,
    gateVerdict: verdict,
  };
}

// ── Routes ─────────────────────────────────────────────────────────────────

// POST /api/campaigns — studio only
router.post("/", requireStudioKey, async (req, res) => {
  const parsed = CreateCampaignSchema.safeParse(req.body);
  if (!parsed.success) return sendZodError(res, parsed.error);

  const data = parsed.data;
  const profile = COST_PROFILES[data.format];

  try {
    const campaign = await prisma.campaign.create({
      data: {
        slug: data.slug,
        title: data.title,
        format: data.format,
        listPrice: data.listPrice,
        minRun: data.minRun ?? profile.minRun,
        orderCap: data.orderCap ?? profile.orderCap,
        fixedSetupCost: data.fixedSetupCost ?? profile.fixedSetupCost,
        rightsCleared: data.rightsCleared,
        status: "DRAFT",
        marginGate: {
          create: {
            thresholdPct: data.thresholdPct ?? 0.20,
            royaltyPct: data.royaltyPct ?? profile.royaltyPct,
            paymentFeePct: data.paymentFeePct ?? profile.paymentFeePct,
            referralPct: data.referralPct ?? profile.referralPct,
            productionCost: data.productionCost ?? profile.productionCost,
            logisticsCost: data.logisticsCost ?? profile.logisticsCost,
            packagingCost: data.packagingCost ?? profile.packagingCost,
          },
        },
      },
      include: { marginGate: true },
    });

    res.status(201).json(campaign);
  } catch (err: any) {
    if (err.code === "P2002") {
      return sendError(res, 409, "Slug already exists");
    }
    throw err;
  }
});

// GET /api/campaigns
router.get("/", async (_req, res) => {
  const campaigns = await prisma.campaign.findMany({
    include: { marginGate: true },
    orderBy: { createdAt: "desc" },
  });

  const withStats = await Promise.all(campaigns.map(buildCampaignStats));
  res.json(withStats);
});

// GET /api/campaigns/:slug
router.get("/:slug", async (req, res) => {
  const campaign = await prisma.campaign.findUnique({
    where: { slug: req.params.slug },
    include: { marginGate: true },
  });

  if (!campaign) return sendError(res, 404, "Campaign not found");

  const withStats = await buildCampaignStats(campaign);
  res.json(withStats);
});

// POST /api/campaigns/evaluate-gate
router.post("/evaluate-gate", async (req, res) => {
  const parsed = EvaluateGateSchema.safeParse(req.body);
  if (!parsed.success) return sendZodError(res, parsed.error);

  const data = parsed.data;
  const profile = COST_PROFILES[data.format];

  let dbGate: any = null;
  let dbCampaign: any = null;

  if (data.campaignId) {
    dbCampaign = await prisma.campaign.findUnique({
      where: { id: data.campaignId },
      include: { marginGate: true },
    });
    if (!dbCampaign) return sendError(res, 404, "Campaign not found");
    dbGate = dbCampaign.marginGate;
  }

  const gateInput: GateInput = {
    price: data.price,
    royaltyPct: data.royaltyPct ?? dbGate?.royaltyPct ?? profile.royaltyPct,
    paymentFeePct: data.paymentFeePct ?? dbGate?.paymentFeePct ?? profile.paymentFeePct,
    referralPct: data.referralPct ?? dbGate?.referralPct ?? profile.referralPct,
    productionCost: data.productionCost ?? dbGate?.productionCost ?? profile.productionCost,
    logisticsCost: data.logisticsCost ?? dbGate?.logisticsCost ?? profile.logisticsCost,
    packagingCost: data.packagingCost ?? dbGate?.packagingCost ?? profile.packagingCost,
    orders: data.orders,
    minRun: data.minRun ?? dbCampaign?.minRun ?? profile.minRun,
    orderCap: data.orderCap ?? dbCampaign?.orderCap ?? profile.orderCap,
    fixedSetupCost: data.fixedSetupCost ?? dbCampaign?.fixedSetupCost ?? profile.fixedSetupCost,
    rightsCleared: data.rightsCleared ?? dbCampaign?.rightsCleared ?? true,
    thresholdPct: data.thresholdPct ?? dbGate?.thresholdPct ?? 0.20,
  };

  const result = evaluateGate(gateInput);

  // Audit log
  await prisma.gateEvaluation.create({
    data: {
      campaignId: data.campaignId ?? null,
      inputJson: JSON.stringify(gateInput),
      resultJson: JSON.stringify(result),
    },
  });

  res.json(result);
});

// POST /api/campaigns/:slug/settle — studio only
router.post("/:slug/settle", requireStudioKey, async (req, res) => {
  const campaign = await prisma.campaign.findUnique({
    where: { slug: req.params.slug },
    include: { marginGate: true },
  });

  if (!campaign) return sendError(res, 404, "Campaign not found");

  const pledgeCount = await prisma.pledge.count({ where: { campaignId: campaign.id } });

  const profile = COST_PROFILES[campaign.format];
  const gate = campaign.marginGate;

  const gateInput: GateInput = {
    price: campaign.listPrice,
    royaltyPct: gate?.royaltyPct ?? profile.royaltyPct,
    paymentFeePct: gate?.paymentFeePct ?? profile.paymentFeePct,
    referralPct: gate?.referralPct ?? profile.referralPct,
    productionCost: gate?.productionCost ?? profile.productionCost,
    logisticsCost: gate?.logisticsCost ?? profile.logisticsCost,
    packagingCost: gate?.packagingCost ?? profile.packagingCost,
    orders: pledgeCount,
    minRun: campaign.minRun,
    orderCap: campaign.orderCap,
    fixedSetupCost: campaign.fixedSetupCost,
    rightsCleared: campaign.rightsCleared,
    thresholdPct: gate?.thresholdPct ?? 0.20,
  };

  const verdict = evaluateGate(gateInput);

  await prisma.gateEvaluation.create({
    data: {
      campaignId: campaign.id,
      inputJson: JSON.stringify(gateInput),
      resultJson: JSON.stringify(verdict),
    },
  });

  if (verdict.status === "GO") {
    // Capture all preauthorized pledges
    await prisma.pledge.updateMany({
      where: { campaignId: campaign.id, status: "PREAUTHORIZED" },
      data: { status: "CAPTURED" },
    });
  } else {
    // Release all preauthorized pledges — no fan is charged
    await prisma.pledge.updateMany({
      where: { campaignId: campaign.id, status: "PREAUTHORIZED" },
      data: { status: "RELEASED" },
    });
  }

  const updatedCampaign = await prisma.campaign.update({
    where: { id: campaign.id },
    data: { status: verdict.status },
  });

  res.json({
    campaign: updatedCampaign,
    gateVerdict: verdict,
    pledgesSettled: pledgeCount,
  });
});

// GET /api/campaigns/:slug/segments
router.get("/:slug/segments", async (req, res) => {
  const campaign = await prisma.campaign.findUnique({
    where: { slug: req.params.slug },
  });

  if (!campaign) return sendError(res, 404, "Campaign not found");

  const pledges = await prisma.pledge.findMany({
    where: { campaignId: campaign.id },
  });

  if (pledges.length === 0) {
    return res.json({ segments: [] });
  }

  // Group by city x language x format
  const groups: Record<string, { city: string; language: string; format: string; prices: number[] }> = {};

  for (const p of pledges) {
    const key = `${p.city}|${p.language}|${p.format}`;
    if (!groups[key]) {
      groups[key] = { city: p.city, language: p.language, format: p.format, prices: [] };
    }
    groups[key].prices.push(p.pricePaid);
  }

  const maxCount = Math.max(...Object.values(groups).map((g) => g.prices.length));

  // Find the best-converting price band (most common price point across all pledges)
  const allPrices = pledges.map((p) => p.pricePaid);
  const priceFreq: Record<number, number> = {};
  for (const price of allPrices) priceFreq[price] = (priceFreq[price] ?? 0) + 1;
  const bestPriceBand = Number(
    Object.entries(priceFreq).sort((a, b) => b[1] - a[1])[0][0]
  );

  const totalPledges = pledges.length;

  /**
   * Demand score formula (0-100):
   *   - 50% weight: group count relative to the largest segment (volume signal)
   *   - 30% weight: share of pledges in this group that paid the best-converting price band (price willingness signal)
   *   - 20% weight: regional concentration — this group's share of total pledges (geographic demand density)
   * Each component is 0-1, weighted sum scaled to 100.
   */
  function computeDemandScore(group: { prices: number[] }): number {
    const count = group.prices.length;
    const volumeScore = count / maxCount;
    const atBestBand = group.prices.filter((p) => p === bestPriceBand).length;
    const priceScore = count > 0 ? atBestBand / count : 0;
    const concentrationScore = count / totalPledges;
    const raw = 0.5 * volumeScore + 0.3 * priceScore + 0.2 * concentrationScore;
    return Math.round(raw * 100);
  }

  const segments = Object.values(groups).map((group) => {
    const count = group.prices.length;
    const avgPrice = Math.round(group.prices.reduce((s, p) => s + p, 0) / count);
    const score = computeDemandScore(group);
    const label = score >= 75 ? "GO" : score >= 50 ? "ADAPT" : "STOP";

    return {
      city: group.city,
      language: group.language,
      format: group.format,
      count,
      avgPrice,
      demandScore: score,
      verdict: label,
    };
  });

  // Sort by demand score descending
  segments.sort((a, b) => b.demandScore - a.demandScore);

  res.json({ segments });
});

export default router;
