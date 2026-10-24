import { Router } from "express";
import { randomUUID } from "crypto";
import { z } from "zod";
import prisma from "../db";
import { sendError, sendZodError } from "../errorShape";

export const ordersRouter = Router();
export const verifyRouter = Router();

// ── Serial generation ──────────────────────────────────────────────────────

/**
 * Generate a unique serial of the form FL-YYYY-XXXXXXXX where XXXXXXXX is an
 * 8-character hex string derived from crypto.randomUUID(). Retries up to 10
 * times on collision (astronomically unlikely with 4 billion+ possibilities).
 */
async function generateSerial(): Promise<string> {
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

// ── Schemas ────────────────────────────────────────────────────────────────

const CreateOrderSchema = z.object({
  campaignSlug: z.string().min(1),
  pledgeId:     z.number().int().positive().optional(),
  itemName:     z.string().min(1),
  batch:        z.string().min(1),
  sellerName:   z.string().min(1),
});

// ── POST /api/orders ───────────────────────────────────────────────────────
// Called by the frontend after a successful preauthorization.

ordersRouter.post("/", async (req, res) => {
  const parsed = CreateOrderSchema.safeParse(req.body);
  if (!parsed.success) return sendZodError(res, parsed.error);

  const { campaignSlug, pledgeId, itemName, batch, sellerName } = parsed.data;

  const campaign = await prisma.campaign.findUnique({ where: { slug: campaignSlug } });
  if (!campaign) return sendError(res, 404, "Campaign not found");

  if (pledgeId !== undefined) {
    const pledge = await prisma.pledge.findUnique({ where: { id: pledgeId } });
    if (!pledge) return sendError(res, 404, "Pledge not found");
    if (pledge.campaignId !== campaign.id) {
      return sendError(res, 400, "Pledge does not belong to this campaign");
    }
    // Idempotent — if an order already exists for this pledge, return it
    const existing = await prisma.order.findUnique({
      where: { pledgeId },
      include: { seller: true },
    });
    if (existing) {
      return res.status(200).json(formatOrder(existing));
    }
  }

  // Upsert seller — new sellers default to unauthorized
  let seller = await prisma.seller.findUnique({ where: { name: sellerName } });
  if (!seller) {
    seller = await prisma.seller.create({ data: { name: sellerName, authorized: false } });
  }

  const serial = await generateSerial();

  const order = await prisma.order.create({
    data: {
      serial,
      campaignId: campaign.id,
      pledgeId:   pledgeId ?? null,
      itemName,
      batch,
      sellerId:   seller.id,
    },
    include: { seller: true },
  });

  res.status(201).json(formatOrder(order));
});

// ── GET /api/verify/:serial ────────────────────────────────────────────────
// Public endpoint — called by Verify.jsx on every device, including QR scans.

verifyRouter.get("/:serial", async (req, res) => {
  const serial = req.params.serial.trim().toUpperCase();

  const order = await prisma.order.findUnique({
    where: { serial },
    include: { seller: true, campaign: true },
  });

  if (!order) {
    return res.json({ verified: false });
  }

  res.json({
    verified:     true,
    serial:       order.serial,
    item:         order.itemName,
    batch:        order.batch,
    seller:       order.seller.name,
    authorized:   order.seller.authorized,
    campaign:     order.campaign.title,
    registeredAt: order.createdAt,
  });
});

// ── helpers ────────────────────────────────────────────────────────────────

function formatOrder(order: any) {
  return {
    serial:       order.serial,
    itemName:     order.itemName,
    batch:        order.batch,
    seller:       order.seller.name,
    authorized:   order.seller.authorized,
    registeredAt: order.createdAt,
  };
}
