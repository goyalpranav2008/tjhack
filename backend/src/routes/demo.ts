/**
 * POST /api/demo/reset
 *
 * Studio-key required. Only active when DEMO_MODE=true (env var).
 * Wipes and re-seeds all demo data, then returns the fresh campaign list.
 *
 * Never enable this in a real production environment.
 */

import { Router } from "express";
import prisma from "../db";
import { requireStudioKey } from "../middleware/auth";
import { sendError } from "../errorShape";
import { seedDemo } from "../seed";

const router = Router();

router.post("/reset", requireStudioKey, async (_req, res) => {
  if (process.env.DEMO_MODE !== "true") {
    return sendError(res, 403, "Demo reset is not enabled. Set DEMO_MODE=true to allow it.");
  }

  await seedDemo(prisma);

  // Return the fresh campaign list so the Console can refresh in one round-trip
  const campaigns = await prisma.campaign.findMany({
    include: { marginGate: true },
    orderBy: { createdAt: "desc" },
  });

  res.json({ reset: true, campaigns });
});

export default router;
