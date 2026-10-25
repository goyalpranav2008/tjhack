import "express-async-errors";
import express from "express";
import cors from "cors";

import campaignRoutes from "./routes/campaigns";
import consentRoutes  from "./routes/consent";
import pledgeRoutes   from "./routes/pledges";
import aiRoutes       from "./ai/routes";
import { ordersRouter, verifyRouter, pledgeOrderRouter } from "./routes/orders";
import { fanWriteLimit } from "./middleware/rateLimit";
import signalRoutes from "./signals/routes";
import analysisRoutes from "./eval/routes";
import demoRoutes from "./routes/demo";

const app = express();

// Trust the first proxy hop so rate limiting uses the real client IP
// (required when deployed behind a load balancer / Vercel / Render / etc.)
app.set("trust proxy", 1);

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

// ── Campaign routes ───────────────────────────────────────────────────────
app.use("/api/campaigns", campaignRoutes);

// ── Orders and verification ───────────────────────────────────────────────
app.use("/api/orders", ordersRouter);
app.use("/api/verify", verifyRouter);

// ── Pledge order lookup ───────────────────────────────────────────────────
app.use("/api/pledges", pledgeOrderRouter);

// ── AI endpoints ──────────────────────────────────────────────────────────
app.use("/api/campaigns", aiRoutes);   // mounts /:slug/insights, /:slug/brief

// ── Signal / prior endpoints ──────────────────────────────────────────────
app.use("/api/campaigns", signalRoutes);  // mounts /:slug/prior

// ── Analysis / evaluation endpoints ──────────────────────────────────────
app.use("/api/analysis", analysisRoutes);  // mounts /report and /run

// ── Demo reset (DEMO_MODE=true only) ─────────────────────────────────────
app.use("/api/demo", demoRoutes);  // mounts /reset

// ── Global error handler ──────────────────────────────────────────────────
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(500).json({ error: "Internal server error", details: err.message ?? null });
});

export default app;
