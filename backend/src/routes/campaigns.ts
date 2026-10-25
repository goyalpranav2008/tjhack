import { Router } from "express";
import { z } from "zod";
import prisma from "../db";
import { evaluateGate } from "../gate";
import { COST_PROFILES } from "../costProfiles";
import { buildGateInput } from "../gateInputBuilder";
import { sendError, sendZodError } from "../errorShape";
import { requireStudioKey } from "../middleware/auth";
import { invalidateBriefCache } from "../ai/brief";
import { generateSerial } from "./orders";

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
  sellerName: z.string().min(1).optional(),
  externalTitle: z.string().min(1).optional(),
  // MarginGate params (optional; defaults come from cost profile)
  thresholdPct: z.number().min(0).max(1).optional(),
  royaltyPct: z.number().min(0).max(1).optional(),
  paymentFeePct: z.number().min(0).max(1).optional(),
  referralPct: z.number().min(0).max(1).optional(),
  platformFeePct: z.number().min(0).max(1).optional(),
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
  platformFeePct: z.number().min(0).max(1).optional(),
  productionCost: z.number().int().min(0).optional(),
  logisticsCost: z.number().int().min(0).optional(),
  packagingCost: z.number().int().min(0).optional(),
  fixedSetupCost: z.number().int().positive().optional(),
});

// ── Helpers ────────────────────────────────────────────────────────────────

const TEST_FEE_INR = parseInt(process.env.TEST_FEE_INR ?? "10000", 10);

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
  sellerId: number | null;
  externalTitle: string | null;
  createdAt: Date;
  marginGate: {
    thresholdPct: number;
    royaltyPct: number;
    paymentFeePct: number;
    referralPct: number;
    productionCost: number;
    logisticsCost: number;
    packagingCost: number;
    platformFeePct: number;
  } | null;
};

/** Count committed (PREAUTHORIZED or CAPTURED, non-withdrawn) pledges */
async function countCommitted(campaignId: number): Promise<number> {
  return prisma.pledge.count({
    where: {
      campaignId,
      withdrawn: false,
      status: { in: ["PREAUTHORIZED", "CAPTURED"] },
    },
  });
}

/** Count all non-withdrawn pledges (opt-ins) */
async function countOptIns(campaignId: number): Promise<number> {
  return prisma.pledge.count({
    where: { campaignId, withdrawn: false },
  });
}

/** Count captured (non-withdrawn) pledges — for remaining units */
async function countCaptured(campaignId: number): Promise<number> {
  return prisma.pledge.count({
    where: {
      campaignId,
      withdrawn: false,
      status: "CAPTURED",
    },
  });
}

/** Build live stats + gate verdict for a campaign */
async function buildCampaignStats(campaign: CampaignWithGate) {
  const [committedCount, optInCount, capturedCount] = await Promise.all([
    countCommitted(campaign.id),
    countOptIns(campaign.id),
    countCaptured(campaign.id),
  ]);

  const progressPct =
    campaign.minRun > 0
      ? parseFloat(((committedCount / campaign.minRun) * 100).toFixed(1))
      : 0;

  const gateInput = buildGateInput(campaign, committedCount);
  const verdict = evaluateGate(gateInput);

  // Revenue summary
  const platformFeePct =
    campaign.marginGate?.platformFeePct ??
    (COST_PROFILES[campaign.format] ?? COST_PROFILES["TEE"]).platformFeePct;

  const committedPledges = await prisma.pledge.findMany({
    where: {
      campaignId: campaign.id,
      withdrawn: false,
      status: { in: ["PREAUTHORIZED", "CAPTURED"] },
    },
    select: { pricePaid: true },
  });

  const pricePaidSum = committedPledges.reduce((s, p) => s + p.pricePaid, 0);
  const commission = Math.round(platformFeePct * pricePaidSum);

  const ourRevenue = {
    testFee: TEST_FEE_INR,
    commission,
    total: TEST_FEE_INR + commission,
  };

  // remainingUnits = orderCap - captured pledges that have an order
  const remainingUnits = Math.max(0, campaign.orderCap - capturedCount);

  // openState for frontend display
  let openState: "testing" | "limited" | "soldOut" | "closed";
  if (campaign.status === "TESTING") {
    openState = "testing";
  } else if (campaign.status === "GO") {
    openState = remainingUnits > 0 ? "limited" : "soldOut";
  } else {
    openState = "closed"; // ADAPT or STOP
  }

  return {
    ...campaign,
    optInCount,
    committedCount,
    capturedCount,
    remainingUnits,
    openState,
    progressPct,
    gateVerdict: verdict,
    ourRevenue,
  };
}

// ── Routes ─────────────────────────────────────────────────────────────────

// POST /api/campaigns — studio only
router.post("/", requireStudioKey, async (req, res) => {
  const parsed = CreateCampaignSchema.safeParse(req.body);
  if (!parsed.success) return sendZodError(res, parsed.error);

  const data = parsed.data;
  const profile = COST_PROFILES[data.format];

  // Resolve seller — default to "Otaku Hub India"
  const sellerName = data.sellerName ?? "Otaku Hub India";
  let seller = await prisma.seller.findUnique({ where: { name: sellerName } });
  if (!seller) {
    seller = await prisma.seller.create({ data: { name: sellerName, authorized: false } });
  }

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
        sellerId: seller.id,
        externalTitle: data.externalTitle ?? null,
        marginGate: {
          create: {
            thresholdPct: data.thresholdPct ?? 0.20,
            royaltyPct: data.royaltyPct ?? profile.royaltyPct,
            paymentFeePct: data.paymentFeePct ?? profile.paymentFeePct,
            referralPct: data.referralPct ?? profile.referralPct,
            platformFeePct: data.platformFeePct ?? profile.platformFeePct,
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
  // Guard against accidentally matching sub-routes defined after this
  if (["evaluate-gate", "reopen"].includes(req.params.slug)) {
    return sendError(res, 404, "Not found");
  }

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

  let dbCampaign: any = null;

  if (data.campaignId) {
    dbCampaign = await prisma.campaign.findUnique({
      where: { id: data.campaignId },
      include: { marginGate: true },
    });
    if (!dbCampaign) return sendError(res, 404, "Campaign not found");
  }

  // Build a synthetic campaign shape for buildGateInput
  const syntheticCampaign = {
    format: data.format,
    listPrice: data.price,
    minRun: data.minRun ?? dbCampaign?.minRun ?? profile.minRun,
    orderCap: data.orderCap ?? dbCampaign?.orderCap ?? profile.orderCap,
    fixedSetupCost: data.fixedSetupCost ?? dbCampaign?.fixedSetupCost ?? profile.fixedSetupCost,
    rightsCleared: data.rightsCleared ?? dbCampaign?.rightsCleared ?? true,
    marginGate: dbCampaign?.marginGate ?? null,
  };

  const overrides = {
    royaltyPct: data.royaltyPct,
    paymentFeePct: data.paymentFeePct,
    referralPct: data.referralPct,
    platformFeePct: data.platformFeePct,
    productionCost: data.productionCost,
    logisticsCost: data.logisticsCost,
    packagingCost: data.packagingCost,
    thresholdPct: data.thresholdPct,
    rightsCleared: data.rightsCleared,
  };

  const gateInput = buildGateInput(syntheticCampaign, data.orders, overrides);
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

  const committedCount = await countCommitted(campaign.id);
  const gateInput = buildGateInput(campaign, committedCount);
  const verdict = evaluateGate(gateInput);

  await prisma.gateEvaluation.create({
    data: {
      campaignId: campaign.id,
      inputJson: JSON.stringify(gateInput),
      resultJson: JSON.stringify(verdict),
    },
  });

  // Invalidate brief cache so next /brief reflects the new verdict
  invalidateBriefCache(campaign.id);

  let captured = 0;
  let released = 0;
  let serialsIssued = 0;

  // Resolve the seller for this campaign (default "Otaku Hub India")
  let sellerId = campaign.sellerId;
  if (!sellerId) {
    const defaultSeller = await prisma.seller.findUnique({ where: { name: "Otaku Hub India" } });
    if (defaultSeller) sellerId = defaultSeller.id;
  }

  if (verdict.status === "GO") {
    // Capture PREAUTHORIZED pledges and create one Order per pledge in a transaction
    const preauth = await prisma.pledge.findMany({
      where: { campaignId: campaign.id, status: "PREAUTHORIZED", withdrawn: false },
      select: { id: true, pricePaid: true },
    });

    await prisma.$transaction(async (tx) => {
      for (const pledge of preauth) {
        await tx.pledge.update({
          where: { id: pledge.id },
          data: { status: "CAPTURED" },
        });

        const serial = await generateSerial();
        await tx.order.create({
          data: {
            serial,
            campaignId: campaign.id,
            pledgeId: pledge.id,
            itemName: campaign.title,
            batch: `B-${new Date().getFullYear()}-${campaign.id.toString().padStart(3, "0")}`,
            sellerId: sellerId!,
          },
        });
        serialsIssued++;
      }
    });

    captured = preauth.length;
  } else {
    // ADAPT or STOP — release PREAUTHORIZED pledges, create no orders
    const releaseResult = await prisma.pledge.updateMany({
      where: { campaignId: campaign.id, status: "PREAUTHORIZED", withdrawn: false },
      data: { status: "RELEASED" },
    });
    released = releaseResult.count;
  }

  const updatedCampaign = await prisma.campaign.update({
    where: { id: campaign.id },
    data: { status: verdict.status },
  });

  res.json({
    campaign: updatedCampaign,
    gateVerdict: verdict,
    captured,
    released,
    serialsIssued,
  });
});

// POST /api/campaigns/:slug/reopen — studio only
// Sets a ADAPT/STOP campaign back to TESTING so fans can pledge again.
// Does NOT touch captured pledges or existing orders.
router.post("/:slug/reopen", requireStudioKey, async (req, res) => {
  const campaign = await prisma.campaign.findUnique({
    where: { slug: req.params.slug },
  });

  if (!campaign) return sendError(res, 404, "Campaign not found");

  if (campaign.status === "GO") {
    return sendError(res, 409, "Campaign already went ahead.");
  }

  if (campaign.status === "TESTING") {
    return sendError(res, 409, "Campaign is already open for testing.");
  }

  // ADAPT or STOP → set back to TESTING
  const updated = await prisma.campaign.update({
    where: { id: campaign.id },
    data: { status: "TESTING" },
  });

  invalidateBriefCache(campaign.id);

  res.json({ campaign: updated });
});

// GET /api/campaigns/:slug/segments
router.get("/:slug/segments", async (req, res) => {
  const campaign = await prisma.campaign.findUnique({
    where: { slug: req.params.slug },
  });

  if (!campaign) return sendError(res, 404, "Campaign not found");

  const pledges = await prisma.pledge.findMany({
    where: { campaignId: campaign.id, withdrawn: false },
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

// GET /api/campaigns/:slug/sources — studio only
router.get("/:slug/sources", requireStudioKey, async (req, res) => {
  const campaign = await prisma.campaign.findUnique({
    where: { slug: req.params.slug },
  });
  if (!campaign) return sendError(res, 404, "Campaign not found");

  const pledges = await prisma.pledge.findMany({
    where: { campaignId: campaign.id, withdrawn: false },
    select: { source: true, status: true },
  });

  // Group by source (null → "direct")
  const groups: Record<string, { optIns: number; committed: number }> = {};

  for (const p of pledges) {
    const key = p.source ?? "direct";
    if (!groups[key]) groups[key] = { optIns: 0, committed: 0 };
    groups[key].optIns++;
    if (p.status === "PREAUTHORIZED" || p.status === "CAPTURED") {
      groups[key].committed++;
    }
  }

  const result = Object.entries(groups).map(([source, counts]) => ({
    source,
    optIns: counts.optIns,
    committed: counts.committed,
  }));

  res.json(result);
});

// GET /api/campaigns/:slug/scans — studio only
router.get("/:slug/scans", requireStudioKey, async (req, res) => {
  const campaign = await prisma.campaign.findUnique({
    where: { slug: req.params.slug },
    include: { orders: { select: { serial: true } } },
  });
  if (!campaign) return sendError(res, 404, "Campaign not found");

  const serials = campaign.orders.map((o) => o.serial);

  const [validScans, invalidScans, topScannedRaw, recentInvalid] = await Promise.all([
    prisma.scanLog.count({ where: { found: true, serial: { in: serials } } }),
    prisma.scanLog.count({ where: { found: false } }),
    prisma.scanLog.groupBy({
      by: ["serial"],
      where: { found: true, serial: { in: serials } },
      _count: { id: true },
      orderBy: { _count: { id: "desc" } },
      take: 10,
    }),
    prisma.scanLog.findMany({
      where: { found: false },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: { serial: true, ipHash: true, userAgent: true, createdAt: true },
    }),
  ]);

  const topScannedSerials = topScannedRaw.map((r) => ({
    serial: r.serial,
    count: r._count.id,
  }));

  res.json({ validScans, invalidScans, topScannedSerials, recentInvalid });
});

export default router;
