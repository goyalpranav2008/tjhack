/**
 * Integration tests using supertest.
 * Uses a separate test DB (test.db) created by globalSetup.ts — never touches dev.db.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import path from "path";

const testDbPath = path.join(__dirname, "../../test.db");
// DATABASE_URL and SERVER_SECRET are set by globalSetup.ts before this file loads.

import app from "../app";
import prisma from "../db";

// ── Helpers ────────────────────────────────────────────────────────────────

async function createCampaign(slug: string, listPrice = 999, rightsCleared = true) {
  return request(app).post("/api/campaigns").send({
    slug,
    title: `Test Campaign ${slug}`,
    format: "TEE",
    listPrice,
    rightsCleared,
  });
}

async function createConsent(identifier = "test-user-001") {
  return request(app).post("/api/consent").send({
    identifier,
    purpose: "test_pledge",
    noticeVersion: "v1.0",
    ageConfirmed: true,
  });
}

// ── Setup / Teardown ───────────────────────────────────────────────────────

beforeAll(async () => {
  // Clean all tables before the suite
  await prisma.gateEvaluation.deleteMany();
  await prisma.order.deleteMany();
  await prisma.pledge.deleteMany();
  await prisma.consentLog.deleteMany();
  await prisma.marginGate.deleteMany();
  await prisma.campaign.deleteMany();
  await prisma.seller.deleteMany();
});

afterAll(async () => {
  await prisma.$disconnect();
});

// ── Health ─────────────────────────────────────────────────────────────────

describe("GET /api/health", () => {
  it("returns 200 ok", async () => {
    const res = await request(app).get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
  });
});

// ── Consent ───────────────────────────────────────────────────────────────

describe("POST /api/consent", () => {
  it("creates a consent log and returns pseudonymousId + consentId", async () => {
    const res = await createConsent("phone-12345");
    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty("pseudonymousId");
    expect(res.body).toHaveProperty("consentId");
    expect(res.body.pseudonymousId).toHaveLength(24);
  });

  it("rejects when ageConfirmed is false and guardianConsent is missing", async () => {
    const res = await request(app).post("/api/consent").send({
      identifier: "minor-user",
      purpose: "test",
      noticeVersion: "v1.0",
      ageConfirmed: false,
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Age confirmation/i);
  });

  it("rejects when ageConfirmed is false and guardianConsent is false", async () => {
    const res = await request(app).post("/api/consent").send({
      identifier: "minor-user",
      purpose: "test",
      noticeVersion: "v1.0",
      ageConfirmed: false,
      guardianConsent: false,
    });
    expect(res.status).toBe(400);
  });

  it("allows when ageConfirmed is false but guardianConsent is true", async () => {
    const res = await request(app).post("/api/consent").send({
      identifier: "minor-with-guardian",
      purpose: "test",
      noticeVersion: "v1.0",
      ageConfirmed: false,
      guardianConsent: true,
    });
    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty("consentId");
  });
});

// ── Campaigns ─────────────────────────────────────────────────────────────

describe("POST /api/campaigns", () => {
  it("creates a campaign and returns 201", async () => {
    const res = await createCampaign("integration-test-tee");
    expect(res.status).toBe(201);
    expect(res.body.slug).toBe("integration-test-tee");
    expect(res.body.marginGate).not.toBeNull();
  });

  it("returns 409 on duplicate slug", async () => {
    await createCampaign("duplicate-slug-test");
    const res2 = await createCampaign("duplicate-slug-test");
    expect(res2.status).toBe(409);
  });
});

describe("GET /api/campaigns", () => {
  it("returns a list of campaigns with stats", async () => {
    const res = await request(app).get("/api/campaigns");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    if (res.body.length > 0) {
      expect(res.body[0]).toHaveProperty("pledgeCount");
      expect(res.body[0]).toHaveProperty("progressPct");
      expect(res.body[0]).toHaveProperty("gateVerdict");
    }
  });
});

// ── Evaluate Gate ─────────────────────────────────────────────────────────

describe("POST /api/campaigns/evaluate-gate", () => {
  it("price 999 TEE, orders 120 → GO", async () => {
    const res = await request(app)
      .post("/api/campaigns/evaluate-gate")
      .send({ price: 999, format: "TEE", orders: 120, rightsCleared: true });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("GO");
    expect(res.body.contribution).toBe(309);
  });

  it("price 799 TEE, orders 120 → ADAPT, contribution 153", async () => {
    const res = await request(app)
      .post("/api/campaigns/evaluate-gate")
      .send({ price: 799, format: "TEE", orders: 120, rightsCleared: true });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ADAPT");
    expect(res.body.contribution).toBe(153);
    expect(res.body.reasons).toContain("margin_below_gate");
  });

  it("price 499 TEE → STOP", async () => {
    const res = await request(app)
      .post("/api/campaigns/evaluate-gate")
      .send({ price: 499, format: "TEE", orders: 120, rightsCleared: true });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("STOP");
    expect(res.body.contribution).toBe(-81);
  });

  it("logs gate evaluation to DB", async () => {
    const before = await prisma.gateEvaluation.count();
    await request(app)
      .post("/api/campaigns/evaluate-gate")
      .send({ price: 999, format: "TEE", orders: 120, rightsCleared: true });
    const after = await prisma.gateEvaluation.count();
    expect(after).toBe(before + 1);
  });
});

// ── Pledge Flow ───────────────────────────────────────────────────────────

describe("Pledge flow: create → preauthorize → settle", () => {
  let campaignSlug: string;
  let consentId: number;
  let pseudonymousId: string;
  let pledgeId: number;

  beforeAll(async () => {
    campaignSlug = `settle-test-${Date.now()}`;
    // Use a low minRun so a single pledge can reach GO at price 999
    // minRun=1, orderCap=10, fixedSetupCost=500 → breakEven = ceil(500/309) = 2 <= 10 → GO with 1+ pledge
    await request(app).post("/api/campaigns").send({
      slug: campaignSlug,
      title: "Settle Test Campaign",
      format: "TEE",
      listPrice: 999,
      minRun: 1,
      orderCap: 10,
      fixedSetupCost: 500,
      rightsCleared: true,
    });

    const consentRes = await createConsent(`settle-user-${Date.now()}`);
    consentId = consentRes.body.consentId;
    pseudonymousId = consentRes.body.pseudonymousId;
  });

  it("creates a pledge with all required fields", async () => {
    const res = await request(app).post("/api/pledges").send({
      campaignSlug,
      consentId,
      pseudonymousId,
      city: "Bengaluru",
      language: "English",
      format: "TEE",
      pricePaid: 999,
    });

    expect(res.status).toBe(201);
    expect(res.body.pledge.status).toBe("OPTED_IN");
    expect(res.body).toHaveProperty("progressPct");
    pledgeId = res.body.pledge.id;
  });

  it("creates a pledge with an optional comment", async () => {
    const consentRes = await createConsent(`comment-user-${Date.now()}`);
    const res = await request(app).post("/api/pledges").send({
      campaignSlug,
      consentId: consentRes.body.consentId,
      pseudonymousId: consentRes.body.pseudonymousId,
      city: "Mumbai",
      language: "Hindi",
      format: "TEE",
      pricePaid: 999,
      comment: "Would love a Hindi dub",
    });

    expect(res.status).toBe(201);
    expect(res.body.pledge.comment).toBe("Would love a Hindi dub");
  });

  it("rejects a comment longer than 280 characters", async () => {
    const consentRes = await createConsent(`long-comment-user-${Date.now()}`);
    const res = await request(app).post("/api/pledges").send({
      campaignSlug,
      consentId: consentRes.body.consentId,
      pseudonymousId: consentRes.body.pseudonymousId,
      city: "Delhi NCR",
      language: "Hindi",
      format: "TEE",
      pricePaid: 999,
      comment: "x".repeat(281),
    });
    expect(res.status).toBe(422);
  });

  it("rejects pledge with mismatched pseudonymousId", async () => {
    const res = await request(app).post("/api/pledges").send({
      campaignSlug,
      consentId,
      pseudonymousId: "wrong-id-000000000000000000000000",
      city: "Bengaluru",
      language: "English",
      format: "TEE",
      pricePaid: 999,
    });
    expect(res.status).toBe(403);
  });

  it("preauthorizes a pledge (mock UPI)", async () => {
    const res = await request(app).post(`/api/pledges/${pledgeId}/preauthorize`);
    expect(res.status).toBe(200);
    expect(res.body.mock).toBe(true);
    expect(res.body.pledge.status).toBe("PREAUTHORIZED");
    expect(res.body.mandateRef).toMatch(/^MOCK-UPI-/);
  });

  it("settle: GO captures preauthorized pledges", async () => {
    const res = await request(app).post(`/api/campaigns/${campaignSlug}/settle`);
    expect(res.status).toBe(200);
    // price 999, minRun=1, orderCap=10, fixedSetupCost=500 → contribution=309, breakEven=2
    // but we only have 1 pledge, so breakEven(2) <= orderCap(10) but orders(1) >= minRun(1)
    // margin 0.309 >= 0.20, orders 1 >= minRun 1, breakEven 2 <= orderCap 10 → GO
    expect(res.body.gateVerdict.status).toBe("GO");
    expect(res.body.campaign.status).toBe("GO");

    // Verify pledge is CAPTURED
    const pledge = await prisma.pledge.findUnique({ where: { id: pledgeId } });
    expect(pledge?.status).toBe("CAPTURED");
  });
});

// ── Extended cities, languages, formats ───────────────────────────────────

describe("Pledge validation — extended enums", () => {
  let baseCampaignSlug: string;

  beforeAll(async () => {
    baseCampaignSlug = `enum-test-${Date.now()}`;
    await request(app).post("/api/campaigns").send({
      slug: baseCampaignSlug,
      title: "Enum Test Campaign",
      format: "TEE",
      listPrice: 999,
      rightsCleared: true,
    });
  });

  const EXTENDED_CITIES = [
    "Delhi NCR", "Bengaluru", "Mumbai", "Pune",
    "Chennai", "Hyderabad", "Kolkata", "Jaipur", "Other city",
  ];

  const EXTENDED_LANGUAGES = [
    "Hindi", "English", "Tamil", "Telugu", "Bengali", "Other language",
  ];

  it.each(EXTENDED_CITIES)("accepts city: %s", async (city) => {
    const consentRes = await createConsent(`city-test-${city}-${Date.now()}`);
    const res = await request(app).post("/api/pledges").send({
      campaignSlug: baseCampaignSlug,
      consentId: consentRes.body.consentId,
      pseudonymousId: consentRes.body.pseudonymousId,
      city,
      language: "Hindi",
      format: "TEE",
      pricePaid: 999,
    });
    expect(res.status).toBe(201);
  }, 60000);

  it.each(EXTENDED_LANGUAGES)("accepts language: %s", async (language) => {
    const consentRes = await createConsent(`lang-test-${language}-${Date.now()}`);
    const res = await request(app).post("/api/pledges").send({
      campaignSlug: baseCampaignSlug,
      consentId: consentRes.body.consentId,
      pseudonymousId: consentRes.body.pseudonymousId,
      city: "Delhi NCR",
      language,
      format: "TEE",
      pricePaid: 999,
    });
    expect(res.status).toBe(201);
  }, 60000);

  it("rejects an unknown city", async () => {
    const consentRes = await createConsent(`bad-city-${Date.now()}`);
    const res = await request(app).post("/api/pledges").send({
      campaignSlug: baseCampaignSlug,
      consentId: consentRes.body.consentId,
      pseudonymousId: consentRes.body.pseudonymousId,
      city: "Atlantis",
      language: "Hindi",
      format: "TEE",
      pricePaid: 999,
    });
    expect(res.status).toBe(422);
  });

  it("rejects an unknown language", async () => {
    const consentRes = await createConsent(`bad-lang-${Date.now()}`);
    const res = await request(app).post("/api/pledges").send({
      campaignSlug: baseCampaignSlug,
      consentId: consentRes.body.consentId,
      pseudonymousId: consentRes.body.pseudonymousId,
      city: "Delhi NCR",
      language: "Klingon",
      format: "TEE",
      pricePaid: 999,
    });
    expect(res.status).toBe(422);
  });

  it("accepts EVENT format pledge", async () => {
    const eventSlug = `event-campaign-${Date.now()}`;
    await request(app).post("/api/campaigns").send({
      slug: eventSlug,
      title: "Event Campaign",
      format: "EVENT",
      listPrice: 599,
      rightsCleared: true,
    });
    const consentRes = await createConsent(`event-user-${Date.now()}`);
    const res = await request(app).post("/api/pledges").send({
      campaignSlug: eventSlug,
      consentId: consentRes.body.consentId,
      pseudonymousId: consentRes.body.pseudonymousId,
      city: "Mumbai",
      language: "Hindi",
      format: "EVENT",
      pricePaid: 599,
    });
    expect(res.status).toBe(201);
    expect(res.body.pledge.format).toBe("EVENT");
  });

  it("POST /api/campaigns accepts EVENT format", async () => {
    const res = await request(app).post("/api/campaigns").send({
      slug: `event-fmt-${Date.now()}`,
      title: "EVENT Format Campaign",
      format: "EVENT",
      listPrice: 599,
      rightsCleared: true,
    });
    expect(res.status).toBe(201);
    expect(res.body.format).toBe("EVENT");
  });

  it("POST /api/campaigns/evaluate-gate accepts EVENT format", async () => {
    const res = await request(app)
      .post("/api/campaigns/evaluate-gate")
      .send({ price: 599, format: "EVENT", orders: 60, rightsCleared: true });
    expect(res.status).toBe(200);
    expect(["GO", "ADAPT", "STOP"]).toContain(res.body.status);
  });
});

// ── Orders and Verification ────────────────────────────────────────────────

describe("POST /api/orders and GET /api/verify/:serial", () => {
  let orderCampaignSlug: string;
  let createdSerial: string;

  beforeAll(async () => {
    orderCampaignSlug = `order-test-${Date.now()}`;
    await request(app).post("/api/campaigns").send({
      slug: orderCampaignSlug,
      title: "Order Test Campaign",
      format: "TEE",
      listPrice: 999,
      rightsCleared: true,
    });
  });

  it("creates an order and returns a FL-YYYY-XXXX serial", async () => {
    const res = await request(app).post("/api/orders").send({
      campaignSlug: orderCampaignSlug,
      itemName: "Skyblade Chronicles hoodie",
      batch: "B-2026-01",
      sellerName: "Otaku Hub India",
    });

    expect(res.status).toBe(201);
    expect(res.body.serial).toMatch(/^FL-\d{4}-\d{4,}$/);
    expect(res.body.itemName).toBe("Skyblade Chronicles hoodie");
    expect(res.body.batch).toBe("B-2026-01");
    expect(res.body.seller).toBe("Otaku Hub India");
    expect(res.body).toHaveProperty("registeredAt");
    createdSerial = res.body.serial;
  });

  it("GET /api/verify/:serial returns verified: true for known serial", async () => {
    const res = await request(app).get(`/api/verify/${createdSerial}`);
    expect(res.status).toBe(200);
    expect(res.body.verified).toBe(true);
    expect(res.body.serial).toBe(createdSerial);
    expect(res.body.item).toBe("Skyblade Chronicles hoodie");
    expect(res.body.seller).toBe("Otaku Hub India");
    expect(res.body).toHaveProperty("registeredAt");
  });

  it("GET /api/verify/:serial is case-insensitive", async () => {
    const res = await request(app).get(`/api/verify/${createdSerial.toLowerCase()}`);
    expect(res.status).toBe(200);
    expect(res.body.verified).toBe(true);
  });

  it("GET /api/verify/:serial returns verified: false for unknown serial", async () => {
    const res = await request(app).get("/api/verify/FL-9999-0000");
    expect(res.status).toBe(200);
    expect(res.body.verified).toBe(false);
  });

  it("creating an order with the same pledgeId is idempotent (returns existing order)", async () => {
    // Create a consent + pledge first
    const consentRes = await createConsent(`order-pledge-user-${Date.now()}`);
    const { consentId, pseudonymousId } = consentRes.body;

    const pledgeRes = await request(app).post("/api/pledges").send({
      campaignSlug: orderCampaignSlug,
      consentId,
      pseudonymousId,
      city: "Delhi NCR",
      language: "Hindi",
      format: "TEE",
      pricePaid: 999,
    });
    const pledgeId = pledgeRes.body.pledge.id;

    // First order creation
    const first = await request(app).post("/api/orders").send({
      campaignSlug: orderCampaignSlug,
      pledgeId,
      itemName: "Skyblade hoodie",
      batch: "B-2026-02",
      sellerName: "Otaku Hub India",
    });
    expect(first.status).toBe(201);

    // Second call with same pledgeId returns the existing order (200)
    const second = await request(app).post("/api/orders").send({
      campaignSlug: orderCampaignSlug,
      pledgeId,
      itemName: "Different name ignored",
      batch: "B-2026-99",
      sellerName: "Otaku Hub India",
    });
    expect(second.status).toBe(200);
    expect(second.body.serial).toBe(first.body.serial);
  });

  it("rejects order with unknown campaign slug", async () => {
    const res = await request(app).post("/api/orders").send({
      campaignSlug: "no-such-campaign",
      itemName: "x",
      batch: "B-1",
      sellerName: "Someone",
    });
    expect(res.status).toBe(404);
  });

  it("rejects order with missing required fields", async () => {
    const res = await request(app).post("/api/orders").send({
      campaignSlug: orderCampaignSlug,
      // missing itemName, batch, sellerName
    });
    expect(res.status).toBe(422);
  });
});

describe("Settle ADAPT/STOP releases pledges", () => {
  let campaignSlug: string;
  let pledgeId: number;

  beforeAll(async () => {
    campaignSlug = `release-test-${Date.now()}`;
    // price 799 → ADAPT
    await createCampaign(campaignSlug, 799, true);

    const consentRes = await createConsent(`release-user-${Date.now()}`);
    const { consentId, pseudonymousId } = consentRes.body;

    const pledgeRes = await request(app).post("/api/pledges").send({
      campaignSlug,
      consentId,
      pseudonymousId,
      city: "Delhi NCR",
      language: "Hindi",
      format: "TEE",
      pricePaid: 799,
    });
    pledgeId = pledgeRes.body.pledge.id;

    await request(app).post(`/api/pledges/${pledgeId}/preauthorize`);
  });

  it("settle: ADAPT releases preauthorized pledges", async () => {
    const res = await request(app).post(`/api/campaigns/${campaignSlug}/settle`);
    expect(res.status).toBe(200);
    // Only 1 pledge, so orders_below_min_run and other reasons may apply
    expect(["ADAPT", "STOP"]).toContain(res.body.gateVerdict.status);

    const pledge = await prisma.pledge.findUnique({ where: { id: pledgeId } });
    expect(pledge?.status).toBe("RELEASED");
  });
});
