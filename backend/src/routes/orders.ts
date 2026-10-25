import { Router } from "express";
import { randomUUID, createHmac } from "crypto";
import prisma from "../db";
import { sendError } from "../errorShape";

export const ordersRouter = Router();
export const verifyRouter = Router();
export const pledgeOrderRouter = Router();

// ── Serial generation ──────────────────────────────────────────────────────

/**
 * Generate a unique serial of the form FL-YYYY-XXXXXXXX where XXXXXXXX is an
 * 8-character hex string derived from crypto.randomUUID(). Retries up to 10
 * times on collision (astronomically unlikely with 4 billion+ possibilities).
 * Exported so campaigns.ts settle can reuse it inside a transaction.
 */
export async function generateSerial(): Promise<string> {
  const year = new Date().getFullYear();
  for (let attempt = 0; attempt < 10; attempt++) {
    const hex = randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase();
    const serial = `FL-${year}-${hex}`;
    const existing = await prisma.order.findUnique({ where: { serial } });
    if (!existing) return serial;
  }
  // Fallback: full UUID suffix (virtually impossible to reach)
  return `FL-${year}-${randomUUID().replace(/-/g, "").slice(0, 12).toUpperCase()}`;
}

// ── IP hashing ─────────────────────────────────────────────────────────────

function hashIp(ip: string): string {
  const secret = process.env.SERVER_SECRET ?? "fallback-secret";
  return createHmac("sha256", secret).update(ip).digest("hex").slice(0, 16);
}

// ── POST /api/orders — REMOVED (now 404) ──────────────────────────────────
// Orders are created only inside POST /api/campaigns/:slug/settle.

ordersRouter.post("/", (_req, res) => {
  return sendError(res, 404, "POST /api/orders has been removed. Orders are issued automatically during campaign settlement.");
});

// ── GET /api/verify/:serial ────────────────────────────────────────────────
// Public endpoint — called by Verify.jsx on every device, including QR scans.
// Logs every scan to ScanLog. Increments scanCount / sets firstScannedAt on found orders.

verifyRouter.get("/:serial", async (req, res) => {
  const serial = req.params.serial.trim().toUpperCase();

  const rawIp =
    (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim() ??
    req.socket.remoteAddress ??
    "unknown";
  const ipHash = hashIp(rawIp);
  const userAgent = (req.headers["user-agent"] ?? "").slice(0, 120);

  const order = await prisma.order.findUnique({
    where: { serial },
    include: { seller: true, campaign: true },
  });

  const found = order !== null;

  // Log every scan
  await prisma.scanLog.create({
    data: { serial, found, ipHash, userAgent },
  });

  if (!found) {
    return res.json({ verified: false, serial });
  }

  // Increment scanCount and set firstScannedAt once
  const updatedOrder = await prisma.order.update({
    where: { serial },
    data: {
      scanCount: { increment: 1 },
      firstScannedAt: order.firstScannedAt ?? new Date(),
    },
  });

  const suspicious = updatedOrder.scanCount > 10;

  res.json({
    verified:      true,
    serial:        order.serial,
    item:          order.itemName,
    batch:         order.batch,
    seller:        order.seller.name,
    authorized:    order.seller.authorized,
    campaign:      order.campaign.title,
    registeredAt:  order.createdAt,
    scanCount:     updatedOrder.scanCount,
    suspicious,
  });
});

// ── GET /api/pledges/:id/order?pseudonymousId=... ──────────────────────────
// Returns { status, order? }. 404 unless pseudonymousId matches pledge.

pledgeOrderRouter.get("/:id/order", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return sendError(res, 400, "Invalid pledge ID");

  const { pseudonymousId } = req.query;
  if (!pseudonymousId || typeof pseudonymousId !== "string") {
    return sendError(res, 400, "pseudonymousId query param required");
  }

  const pledge = await prisma.pledge.findUnique({
    where: { id },
    include: {
      order: {
        include: { seller: true, campaign: true },
      },
    },
  });

  if (!pledge || pledge.pseudonymousId !== pseudonymousId) {
    return sendError(res, 404, "Not found");
  }

  const response: any = { status: pledge.status };

  if (pledge.order) {
    response.order = {
      serial:      pledge.order.serial,
      itemName:    pledge.order.itemName,
      batch:       pledge.order.batch,
      seller:      pledge.order.seller.name,
      authorized:  pledge.order.seller.authorized,
      campaign:    pledge.order.campaign.title,
      registeredAt: pledge.order.createdAt,
      scanCount:   pledge.order.scanCount,
    };
  }

  res.json(response);
});
