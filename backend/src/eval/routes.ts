/**
 * GET  /api/analysis/report  — studio key required; returns cached report
 * POST /api/analysis/run     — studio key required; re-runs eval then returns fresh report
 */

import { Router } from "express";
import { requireStudioKey } from "../middleware/auth";
import { buildReport } from "./report";

const router = Router();

let _cached: { report: Awaited<ReturnType<typeof buildReport>>; at: string } | null = null;
const CACHE_MS = 5 * 60 * 1000; // 5-minute cache

router.get("/report", requireStudioKey, async (_req, res) => {
  if (_cached && Date.now() - new Date(_cached.at).getTime() < CACHE_MS) {
    return res.json({ ..._cached.report, _cachedAt: _cached.at });
  }
  const report = await buildReport();
  _cached = { report, at: new Date().toISOString() };
  res.json(report);
});

router.post("/run", requireStudioKey, async (_req, res) => {
  _cached = null; // invalidate
  const report = await buildReport();
  _cached = { report, at: new Date().toISOString() };
  res.json(report);
});

export default router;
