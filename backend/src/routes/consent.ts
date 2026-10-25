import { Router } from "express";
import { z } from "zod";
import prisma from "../db";
import { makePseudonymousId } from "../pseudonym";
import { sendError, sendZodError } from "../errorShape";
import { invalidateBriefCache } from "../ai/brief";

const router = Router();

const ConsentSchema = z.object({
  identifier: z.string().min(1),   // phone or device ID — never stored
  purpose: z.string().min(1),
  noticeVersion: z.string().min(1),
  ageConfirmed: z.boolean(),
  guardianConsent: z.boolean().optional().default(false),
});

// POST /api/consent
router.post("/", async (req, res) => {
  const parsed = ConsentSchema.safeParse(req.body);
  if (!parsed.success) return sendZodError(res, parsed.error);

  const { identifier, purpose, noticeVersion, ageConfirmed, guardianConsent } = parsed.data;

  // Reject if minor without guardian consent
  if (!ageConfirmed && !guardianConsent) {
    return sendError(
      res,
      400,
      "Age confirmation required. Provide guardianConsent: true for users under 18."
    );
  }

  const secret = process.env.SERVER_SECRET ?? "fallback-secret";
  const pseudonymousId = makePseudonymousId(identifier, secret);

  const log = await prisma.consentLog.create({
    data: {
      pseudonymousId,
      purpose,
      noticeVersion,
      ageConfirmed,
      guardianConsent: guardianConsent ?? false,
    },
  });

  res.status(201).json({
    pseudonymousId,
    consentId: log.id,
  });
});

// POST /api/consent/withdraw
// Appends a ConsentLog row with purpose "withdrawal", sets withdrawn=true on pledges,
// RELEASED on PREAUTHORIZED pledges, and clears their comment.
const WithdrawSchema = z.object({
  pseudonymousId: z.string().min(1),
});

router.post("/withdraw", async (req, res) => {
  const parsed = WithdrawSchema.safeParse(req.body);
  if (!parsed.success) return sendZodError(res, parsed.error);

  const { pseudonymousId } = parsed.data;

  // Append a withdrawal consent log (never edit old rows)
  await prisma.consentLog.create({
    data: {
      pseudonymousId,
      purpose: "withdrawal",
      noticeVersion: "v1.0",
      ageConfirmed: false,
      guardianConsent: false,
    },
  });

  // Find all non-withdrawn pledges for this person
  const pledges = await prisma.pledge.findMany({
    where: { pseudonymousId, withdrawn: false },
    select: { id: true, status: true, campaignId: true },
  });

  const affectedCampaignIds = [...new Set(pledges.map((p) => p.campaignId))];

  // Set withdrawn + release PREAUTHORIZED + clear comment
  let releasedCount = 0;
  for (const pledge of pledges) {
    const newStatus =
      pledge.status === "PREAUTHORIZED" ? "RELEASED" : pledge.status;
    if (pledge.status === "PREAUTHORIZED") releasedCount++;

    await prisma.pledge.update({
      where: { id: pledge.id },
      data: {
        withdrawn: true,
        status: newStatus,
        comment: null,
      },
    });
  }

  // Invalidate brief caches for affected campaigns
  for (const cid of affectedCampaignIds) {
    invalidateBriefCache(cid);
  }

  res.json({
    withdrawn: pledges.length,
    released: releasedCount,
    campaignsAffected: affectedCampaignIds.length,
  });
});

export default router;
