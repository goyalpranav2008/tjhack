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

const CreatePledgeSchema = z.object({
  campaignSlug: z.string().min(1),
  consentId: z.number().int().positive(),
  pseudonymousId: z.string().min(1),
  city: z.enum(VALID_CITIES),
  language: z.enum(VALID_LANGUAGES),
  format: z.enum(VALID_FORMATS),
  pricePaid: z.number().int().positive(),
  comment: z.string().max(280).optional(),
});

// POST /api/pledges
router.post("/", async (req, res) => {
  const parsed = CreatePledgeSchema.safeParse(req.body);
  if (!parsed.success) return sendZodError(res, parsed.error);

  const { campaignSlug, consentId, pseudonymousId, city, language, format, pricePaid, comment } =
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
    },
  });

  const pledgeCount = await prisma.pledge.count({ where: { campaignId: campaign.id } });
  const progressPct =
    campaign.minRun > 0
      ? parseFloat(((pledgeCount / campaign.minRun) * 100).toFixed(1))
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

  const updated = await prisma.pledge.update({
    where: { id },
    data: { status: "PREAUTHORIZED" },
  });

  // Fake mandate reference — no real money moves
  const mandateRef = `MOCK-UPI-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

  res.json({
    mock: true,
    pledge: updated,
    mandateRef,
    note: "No real payment has been taken. Pledge is preauthorized pending campaign gate evaluation.",
  });
});

export default router;
