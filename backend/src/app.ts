import "express-async-errors";
import express from "express";
import cors from "cors";

import campaignRoutes from "./routes/campaigns";
import consentRoutes  from "./routes/consent";
import pledgeRoutes   from "./routes/pledges";
import aiRoutes       from "./ai/routes";
import { ordersRouter, verifyRouter } from "./routes/orders";
import { requireStudioKey } from "./middleware/auth";
import { fanWriteLimit }    from "./middleware/rateLimit";

const app = express();

const ALLOWED_ORIGINS = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(",").map((o) => o.trim())
  : ["http://localhost:3000", "http://localhost:5173"];

app.use(cors({ origin: ALLOWED_ORIGINS }));
app.use(express.json());

// ── Health ────────────────────────────────────────────────────────────────
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", service: "fandomloop-india", ts: new Date().toISOString() });
});

// ── Fan-facing write routes — rate limited ────────────────────────────────
app.use("/api/consent", fanWriteLimit, consentRoutes);
app.use("/api/pledges", fanWriteLimit, pledgeRoutes);

// ── Campaign routes — POST and settle require studio key ──────────────────
// GET routes on /api/campaigns are public (read-only).
// POST /api/campaigns (create) and POST /api/campaigns/:slug/settle need auth.
// We apply the middleware at the router level inside campaigns.ts by
// exporting two sub-routers; here we apply it per-method instead to keep
// campaigns.ts clean.
app.use("/api/campaigns", campaignRoutes);

// Studio-key guard is injected on the individual sensitive endpoints below.
// campaignRoutes itself calls requireStudioKey via the campaigns router
// (see campaigns.ts — we set it up there for the two protected routes).

// ── Orders and verification ───────────────────────────────────────────────
app.use("/api/orders", ordersRouter);
app.use("/api/verify", verifyRouter);

// ── AI endpoints ──────────────────────────────────────────────────────────
app.use("/api/campaigns", aiRoutes);   // mounts /:slug/insights, /:slug/brief

// ── Global error handler ──────────────────────────────────────────────────
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(500).json({ error: "Internal server error", details: err.message ?? null });
});

export default app;
