import { Router } from "express";
import { z } from "zod";
import prisma from "../db";
import { sendError, sendZodError } from "../errorShape";

const router = Router();

// ── Shared enums (single source of truth for validation) ──────────────────
// Keep in sync with frontend/src/lib/formats.js

export const VALID_CITIES = [
  "Delhi NCR",
  "Bengaluru",
  "Mumbai",
  "Pune",
  "Chennai",
  "Hyderabad",
  "Kolkata",
  "Jaipur",
  "Other city",
] as const;

export const VALID_LANGUAGES = [
  "Hindi",
  "English",
  "Tamil",
  "Telugu",
  "Bengali",
  "Other language",
] as const;

export const VALID_FORMATS = ["TEE", "POSTER", "CHAPTER", "EVENT"] as const;

const VALID_PLATFORMS = ["netflix", "crunchyroll", "prime-video", "youtube", "other"] as const;

const SOURCE_RE = /^[a-z0-9-]{1,40}$/;

const CreatePledgeSchema = z.object({
  campaignSlug: z.string().min(1),
  consentId: z.number().int().positive(),
  pseudonymousId: z.string().min(1),
  city: z.enum(VALID_CITIES),
  language: z.enum(VALID_LANGUAGES),
  format: z.enum(VALID_FORMATS),
  pricePaid: z.number().int().positive(),
  comment: z.string().max(280).optional(),
  source: z.string().regex(SOURCE_RE).optional(),
  platforms: z
    .array(z.enum(VALID_PLATFORMS))
    .optional()
    .transform((arr) => arr?.join(",") ?? null),
});

// POST /api/pledges
router.post("/", async (req, res) => {
  const parsed = CreatePledgeSchema.safeParse(req.body);
  if (!parsed.success) return sendZodError(res, parsed.error);

  const { campaignSlug, consentId, pseudonymousId, city, language, format, pricePaid, comment, source, platforms } =
    parsed.data;

  // Verify consent exists and matches pseudonymousId
  const consent = await prisma.consentLog.findUnique({ where: { id: consentId } });
  if (!consent) {
    return sendError(res, 400, "Consent record not found");
  }
  if (consent.pseudonymousId !== pseudonymousId) {
    return sendError(res, 403, "pseudonymousId does not match the consent record");
  }

  const campaign = await prisma.campaign.findUnique({ where: { slug: campaignSlug } });
  if (!campaign) return sendError(res, 404, "Campaign not found");

  // Prevent a pseudonymousId from pledging the same campaign twice
  const duplicate = await prisma.pledge.findFirst({
    where: { campaignId: campaign.id, pseudonymousId },
  });
  if (duplicate) {
    return sendError(res, 409, "You have already pledged this campaign.");
  }

  const pledge = await prisma.pledge.create({
    data: {
      campaignId: campaign.id,
      pseudonymousId,
      city,
      language,
      format,
      pricePaid,
      comment: comment ?? null,
      status: "OPTED_IN",
      consentId,
      withdrawn: false,
      source: source ?? null,
      platforms: platforms ?? null,
    },
  });

  // progressPct based on committed orders
  const committedCount = await prisma.pledge.count({
    where: {
      campaignId: campaign.id,
      withdrawn: false,
      status: { in: ["PREAUTHORIZED", "CAPTURED"] },
    },
  });
  const progressPct =
    campaign.minRun > 0
      ? parseFloat(((committedCount / campaign.minRun) * 100).toFixed(1))
      : 0;

  res.status(201).json({ pledge, progressPct });
});

// POST /api/pledges/:id/preauthorize — mock UPI mandate
router.post("/:id/preauthorize", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return sendError(res, 400, "Invalid pledge ID");

  const pledge = await prisma.pledge.findUnique({ where: { id } });
  if (!pledge) return sendError(res, 404, "Pledge not found");

  if (pledge.status !== "OPTED_IN") {
    return sendError(
      res,
      409,
      `Pledge is already in status ${pledge.status}, cannot preauthorize`
    );
  }

  const campaign = await prisma.campaign.findUnique({ where: { id: pledge.campaignId } });
  if (!campaign) return sendError(res, 404, "Campaign not found");

  // ── ADAPT or STOP: closed, no preauthorization ───────────────────────
  if (campaign.status === "ADAPT" || campaign.status === "STOP") {
    return sendError(res, 409, "This campaign is not open for preorders.");
  }

  // ── GO: late preorder — capture immediately if units remain ──────────
  if (campaign.status === "GO") {
    const capturedCount = await prisma.pledge.count({
      where: { campaignId: campaign.id, withdrawn: false, status: "CAPTURED" },
    });
    const remaining = Math.max(0, campaign.orderCap - capturedCount);

    if (remaining === 0) {
      return res.status(409).json({ error: "Sold out", remaining: 0 });
    }

    // Resolve seller
    let sellerId = campaign.sellerId;
    if (!sellerId) {
      const defaultSeller = await prisma.seller.findUnique({ where: { name: "Otaku Hub India" } });
      if (defaultSeller) sellerId = defaultSeller.id;
    }
    if (!sellerId) return sendError(res, 500, "No seller configured for campaign");

    // Generate serial before transaction (uses main prisma client for uniqueness check)
    const { generateSerial } = await import("./orders");
    const serial = await generateSerial();

    // Capture pledge + create order in one transaction
    const [updatedPledge, order] = await prisma.$transaction(async (tx) => {
      const p = await tx.pledge.update({
        where: { id },
        data: { status: "CAPTURED" },
      });
      const o = await tx.order.create({
        data: {
          serial,
          campaignId: campaign.id,
          pledgeId: id,
          itemName: campaign.title,
          batch: `B-${new Date().getFullYear()}-${campaign.id.toString().padStart(3, "0")}`,
          sellerId: sellerId!,
        },
      });
      return [p, o];
    });

    const newRemaining = Math.max(0, remaining - 1);
    const mandateRef = `MOCK-UPI-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

    return res.json({
      mock: true,
      captured: true,
      pledge: updatedPledge,
      mandateRef,
      serial: order.serial,
      remaining: newRemaining,
      note: "Goal was reached — your item is confirmed immediately.",
    });
  }

  // ── TESTING: standard flow — PREAUTHORIZED, waits for settle ─────────
  const updated = await prisma.pledge.update({
    where: { id },
    data: { status: "PREAUTHORIZED" },
  });

  // progressPct based on committed orders after this preauth
  const committedCount = await prisma.pledge.count({
    where: {
      campaignId: pledge.campaignId,
      withdrawn: false,
      status: { in: ["PREAUTHORIZED", "CAPTURED"] },
    },
  });
  const progressPct =
    (campaign?.minRun ?? 0) > 0
      ? parseFloat(((committedCount / campaign!.minRun) * 100).toFixed(1))
      : 0;

  const mandateRef = `MOCK-UPI-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

  res.json({
    mock: true,
    captured: false,
    pledge: updated,
    mandateRef,
    progressPct,
    note: "No real payment has been taken. Pledge is preauthorized pending campaign gate evaluation.",
  });
});

export default router;
