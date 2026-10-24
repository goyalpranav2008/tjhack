import { Router } from "express";
import { z } from "zod";
import prisma from "../db";
import { makePseudonymousId } from "../pseudonym";
import { sendError, sendZodError } from "../errorShape";

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

export default router;
