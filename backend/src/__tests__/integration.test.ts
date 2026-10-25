/**
 * Integration tests using supertest.
 * Uses a separate test DB (test.db) created by globalSetup.ts — never touches dev.db.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import request from "supertest";

// DATABASE_URL and SERVER_SECRET are set by globalSetup.ts before this file loads.
import app from "../app";
import prisma from "../db";

// ── Helpers ────────────────────────────────────────────────────────────────

async function createCampaign(slug: string, listPrice = 999, rightsCleared = true, extra: Record<string, any> = {}) {
  return request(app).post("/api/campaigns").send({
    slug,
    title: `Test Campaign ${slug}`,
    format: "TEE",
    listPrice,
    rightsCleared,
    ...extra,
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

async function createPledge(campaignSlug: string, pricePaid: number, identifier?: string, extra: Record<string, any> = {}) {
  const consentRes = await createConsent(identifier ?? `user-${Date.now()}-${Math.random()}`);
  const { consentId, pseudonymousId } = consentRes.body;
  const res = await request(app).post("/api/pledges").send({
    campaignSlug,
    consentId,
    pseudonymousId,
    city: "Mumbai",
    language: "Hindi",
    format: "TEE",
    pricePaid,
    ...extra,
  });
  return { res, consentId, pseudonymousId };
}

// ── Setup / Teardown ───────────────────────────────────────────────────────

beforeAll(async () => {
  // Clean all tables before the suite
  await prisma.scanLog.deleteMany();
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
    expect(res.body.marginGate.platformFeePct).toBe(0.05);
  });

  it("returns 409 on duplicate slug", async () => {
    await createCampaign("duplicate-slug-test");
    const res2 = await createCampaign("duplicate-slug-test");
    expect(res2.status).toBe(409);
  });
});

describe("GET /api/campaigns", () => {
  it("returns a list of campaigns with stats including committedCount and optInCount", async () => {
    const res = await request(app).get("/api/campaigns");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    if (res.body.length > 0) {
      const c = res.body[0];
      expect(c).toHaveProperty("committedCount");
      expect(c).toHaveProperty("optInCount");
      expect(c).toHaveProperty("progressPct");
      expect(c).toHaveProperty("gateVerdict");
      expect(c).toHaveProperty("ourRevenue");
      expect(c.ourRevenue).toHaveProperty("testFee");
      expect(c.ourRevenue).toHaveProperty("commission");
      expect(c.ourRevenue).toHaveProperty("total");
    }
  });
});

// ── Evaluate Gate ─────────────────────────────────────────────────────────

describe("POST /api/campaigns/evaluate-gate — updated values with platformFeePct=0.05", () => {
  it("price 999 TEE, orders 120 → GO, contribution 259", async () => {
    const res = await request(app)
      .post("/api/campaigns/evaluate-gate")
      .send({ price: 999, format: "TEE", orders: 120, rightsCleared: true });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("GO");
    expect(res.body.contribution).toBe(259);
    expect(res.body.breakdown).toBeDefined();
    expect(res.body.breakdown.platformFee).toBe(49.95);
  });

  it("price 799 TEE, orders 120 → ADAPT, contribution 113", async () => {
    const res = await request(app)
      .post("/api/campaigns/evaluate-gate")
      .send({ price: 799, format: "TEE", orders: 120, rightsCleared: true });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ADAPT");
    expect(res.body.contribution).toBe(113);
    expect(res.body.reasons).toContain("margin_below_gate");
  });

  it("price 499 TEE → STOP, contribution -106", async () => {
    const res = await request(app)
      .post("/api/campaigns/evaluate-gate")
      .send({ price: 499, format: "TEE", orders: 120, rightsCleared: true });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("STOP");
    expect(res.body.contribution).toBe(-106);
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

describe("Pledge flow: create → preauthorize → settle GO issues serials", () => {
  let campaignSlug: string;
  let consentId: number;
  let pseudonymousId: string;
  let pledgeId: number;

  beforeAll(async () => {
    campaignSlug = `settle-test-${Date.now()}`;
    // minRun=1, orderCap=10, fixedSetupCost=500
    // contribution at 999 = 259, breakEven = ceil(500/259) = 2 ≤ 10
    // With 1 preauthorized pledge (≥ minRun 1) and margin 0.260 ≥ 0.20 → GO
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

  it("duplicate pledge returns 409", async () => {
    // Same pseudonymousId as the first pledge in this campaign
    const res = await request(app).post("/api/pledges").send({
      campaignSlug,
      consentId,
      pseudonymousId,
      city: "Chennai",
      language: "Tamil",
      format: "TEE",
      pricePaid: 999,
    });
    expect(res.status).toBe(409);
  });

  it("preauthorizes a pledge (mock UPI)", async () => {
    const res = await request(app).post(`/api/pledges/${pledgeId}/preauthorize`);
    expect(res.status).toBe(200);
    expect(res.body.mock).toBe(true);
    expect(res.body.pledge.status).toBe("PREAUTHORIZED");
    expect(res.body.mandateRef).toMatch(/^MOCK-UPI-/);
    // progressPct should now reflect committed count
    expect(res.body).toHaveProperty("progressPct");
  });

  it("settle GO: captures preauthorized pledges and issues serials", async () => {
    const res = await request(app).post(`/api/campaigns/${campaignSlug}/settle`);
    expect(res.status).toBe(200);
    expect(res.body.gateVerdict.status).toBe("GO");
    expect(res.body.campaign.status).toBe("GO");
    expect(res.body.serialsIssued).toBeGreaterThan(0);
    expect(res.body.captured).toBeGreaterThan(0);
    expect(res.body.released).toBe(0);

    // Verify pledge is CAPTURED
    const pledge = await prisma.pledge.findUnique({ where: { id: pledgeId } });
    expect(pledge?.status).toBe("CAPTURED");

    // Verify an order was created for this pledge
    const order = await prisma.order.findUnique({ where: { pledgeId } });
    expect(order).not.toBeNull();
    expect(order?.serial).toMatch(/^FL-\d{4}-/);
  });
});

// ── Settle ADAPT/STOP issues NO serials ───────────────────────────────────

describe("Settle ADAPT/STOP: releases pledges, no serials issued", () => {
  let campaignSlug: string;
  let pledgeId: number;

  beforeAll(async () => {
    campaignSlug = `release-test-${Date.now()}`;
    // price 799 → ADAPT (margin 0.142 < 0.20)
    await createCampaign(campaignSlug, 799, true);

    const { res: pledgeRes } = await createPledge(campaignSlug, 799, `release-user-${Date.now()}`);
    pledgeId = pledgeRes.body.pledge.id;
    await request(app).post(`/api/pledges/${pledgeId}/preauthorize`);
  });

  it("settle ADAPT: releases preauthorized pledges and issues NO serials", async () => {
    const res = await request(app).post(`/api/campaigns/${campaignSlug}/settle`);
    expect(res.status).toBe(200);
    expect(["ADAPT", "STOP"]).toContain(res.body.gateVerdict.status);
    expect(res.body.serialsIssued).toBe(0);
    expect(res.body.captured).toBe(0);
    expect(res.body.released).toBeGreaterThan(0);

    const pledge = await prisma.pledge.findUnique({ where: { id: pledgeId } });
    expect(pledge?.status).toBe("RELEASED");

    const order = await prisma.order.findUnique({ where: { pledgeId } });
    expect(order).toBeNull();
  });
});

// ── POST /api/orders returns 404 ──────────────────────────────────────────

describe("POST /api/orders is disabled", () => {
  it("returns 404", async () => {
    const res = await request(app).post("/api/orders").send({
      campaignSlug: "any-slug",
      itemName: "Test",
      batch: "B-1",
      sellerName: "Test Seller",
    });
    expect(res.status).toBe(404);
  });
});

// ── Verify with scan logging ───────────────────────────────────────────────

describe("GET /api/verify/:serial — scan logging", () => {
  let verifySerial: string;

  beforeAll(async () => {
    // Ensure the demo serial exists via seed logic
    const seller = await prisma.seller.upsert({
      where: { name: "Test Seller Verify" },
      update: {},
      create: { name: "Test Seller Verify", authorized: true },
    });

    const verifyCampaign = await prisma.campaign.create({
      data: {
        slug: `verify-campaign-${Date.now()}`,
        title: "Verify Campaign",
        format: "TEE",
        listPrice: 999,
        minRun: 1,
        orderCap: 10,
        fixedSetupCost: 500,
        rightsCleared: true,
        status: "GO",
        sellerId: seller.id,
        marginGate: {
          create: {
            thresholdPct: 0.20,
            royaltyPct: 0.15,
            paymentFeePct: 0.02,
            referralPct: 0.05,
            platformFeePct: 0.05,
            productionCost: 360,
            logisticsCost: 85,
            packagingCost: 25,
          },
        },
      },
    });

    verifySerial = `FL-TEST-${Date.now().toString(16).toUpperCase().slice(-8)}`;
    await prisma.order.create({
      data: {
        serial: verifySerial,
        campaignId: verifyCampaign.id,
        itemName: "Test Item",
        batch: "B-TEST",
        sellerId: seller.id,
      },
    });
  });

  it("GET /api/verify/:serial returns verified: true and scanCount for known serial", async () => {
    const res = await request(app).get(`/api/verify/${verifySerial}`);
    expect(res.status).toBe(200);
    expect(res.body.verified).toBe(true);
    expect(res.body.serial).toBe(verifySerial);
    expect(res.body).toHaveProperty("scanCount");
    expect(res.body.scanCount).toBe(1);
    expect(res.body).toHaveProperty("suspicious");
    expect(res.body.suspicious).toBe(false);
  });

  it("GET /api/verify/:serial increments scanCount on each scan", async () => {
    await request(app).get(`/api/verify/${verifySerial}`);
    await request(app).get(`/api/verify/${verifySerial}`);
    const res = await request(app).get(`/api/verify/${verifySerial}`);
    expect(res.body.scanCount).toBeGreaterThanOrEqual(3);
  });

  it("GET /api/verify/:serial is case-insensitive", async () => {
    const res = await request(app).get(`/api/verify/${verifySerial.toLowerCase()}`);
    expect(res.status).toBe(200);
    expect(res.body.verified).toBe(true);
  });

  it("GET /api/verify/:serial returns verified: false for unknown serial and logs invalid scan", async () => {
    const before = await prisma.scanLog.count({ where: { found: false } });
    const res = await request(app).get("/api/verify/FL-9999-DEADBEEF");
    expect(res.status).toBe(200);
    expect(res.body.verified).toBe(false);

    const after = await prisma.scanLog.count({ where: { found: false } });
    expect(after).toBe(before + 1);
  });

  it("marks order as suspicious when scanCount > 10", async () => {
    // Scan many times
    for (let i = 0; i < 11; i++) {
      await request(app).get(`/api/verify/${verifySerial}`);
    }
    const res = await request(app).get(`/api/verify/${verifySerial}`);
    expect(res.body.suspicious).toBe(true);
  });
});

// ── Pledge order lookup ───────────────────────────────────────────────────

describe("GET /api/pledges/:id/order", () => {
  let slug: string;
  let pledgeId: number;
  let pseudonymousId: string;

  beforeAll(async () => {
    slug = `order-lookup-${Date.now()}`;
    await request(app).post("/api/campaigns").send({
      slug,
      title: "Order Lookup Campaign",
      format: "TEE",
      listPrice: 999,
      minRun: 1,
      orderCap: 5,
      fixedSetupCost: 500,
      rightsCleared: true,
    });

    const { res, pseudonymousId: pid } = await createPledge(slug, 999, `lookup-user-${Date.now()}`);
    pledgeId = res.body.pledge.id;
    pseudonymousId = pid;

    await request(app).post(`/api/pledges/${pledgeId}/preauthorize`);
    await request(app).post(`/api/campaigns/${slug}/settle`);
  });

  it("returns 404 without pseudonymousId", async () => {
    const res = await request(app).get(`/api/pledges/${pledgeId}/order`);
    expect(res.status).toBe(400);
  });

  it("returns 404 with wrong pseudonymousId", async () => {
    const res = await request(app).get(`/api/pledges/${pledgeId}/order?pseudonymousId=wrong-id`);
    expect(res.status).toBe(404);
  });

  it("returns order with serial for CAPTURED pledge when pseudonymousId matches", async () => {
    const res = await request(app).get(`/api/pledges/${pledgeId}/order?pseudonymousId=${pseudonymousId}`);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("CAPTURED");
    expect(res.body.order).toBeDefined();
    expect(res.body.order.serial).toMatch(/^FL-/);
  });
});

// ── Withdraw consent ──────────────────────────────────────────────────────

describe("POST /api/consent/withdraw — excludes person from counts", () => {
  let slug: string;
  let withdrawPseudonymousId: string;
  let keepPseudonymousId: string;

  beforeAll(async () => {
    slug = `withdraw-test-${Date.now()}`;
    await request(app).post("/api/campaigns").send({
      slug,
      title: "Withdraw Test Campaign",
      format: "TEE",
      listPrice: 999,
      minRun: 1,
      orderCap: 100,
      fixedSetupCost: 500,
      rightsCleared: true,
    });

    // Two pledges — one will withdraw
    const { res: r1, pseudonymousId: pid1 } = await createPledge(slug, 999, `withdraw-fan-${Date.now()}`);
    withdrawPseudonymousId = pid1;
    await request(app).post(`/api/pledges/${r1.body.pledge.id}/preauthorize`);

    const { res: r2, pseudonymousId: pid2 } = await createPledge(slug, 999, `keep-fan-${Date.now()}`);
    keepPseudonymousId = pid2;
    await request(app).post(`/api/pledges/${r2.body.pledge.id}/preauthorize`);
  });

  it("withdraw: appends consent log, sets withdrawn=true, releases PREAUTHORIZED pledge", async () => {
    const before = await prisma.pledge.count({ where: { pseudonymousId: withdrawPseudonymousId, withdrawn: false } });
    expect(before).toBeGreaterThan(0);

    const res = await request(app).post("/api/consent/withdraw").send({ pseudonymousId: withdrawPseudonymousId });
    expect(res.status).toBe(200);
    expect(res.body.withdrawn).toBeGreaterThan(0);

    const after = await prisma.pledge.count({ where: { pseudonymousId: withdrawPseudonymousId, withdrawn: false } });
    expect(after).toBe(0);

    // The PREAUTHORIZED pledge should now be RELEASED
    const released = await prisma.pledge.findFirst({ where: { pseudonymousId: withdrawPseudonymousId } });
    expect(released?.status).toBe("RELEASED");
    expect(released?.comment).toBeNull();
  });

  it("withdrawn person excluded from committedCount in campaign stats", async () => {
    const res = await request(app).get(`/api/campaigns/${slug}`);
    expect(res.status).toBe(200);
    // Only the non-withdrawn person's preauth counts
    expect(res.body.committedCount).toBe(1);

    // keepPseudonymousId pledge is still counted
    const keepPledge = await prisma.pledge.findFirst({ where: { pseudonymousId: keepPseudonymousId, withdrawn: false } });
    expect(keepPledge).not.toBeNull();
  });

  it("withdrawal appends a new ConsentLog row with purpose 'withdrawal'", async () => {
    const log = await prisma.consentLog.findFirst({
      where: { pseudonymousId: withdrawPseudonymousId, purpose: "withdrawal" },
      orderBy: { givenAt: "desc" },
    });
    expect(log).not.toBeNull();
    expect(log?.purpose).toBe("withdrawal");
  });
});

// ── Source endpoint ───────────────────────────────────────────────────────

describe("GET /api/campaigns/:slug/sources — grouping by source", () => {
  let slug: string;

  beforeAll(async () => {
    slug = `sources-test-${Date.now()}`;
    await request(app).post("/api/campaigns").send({
      slug,
      title: "Sources Test Campaign",
      format: "TEE",
      listPrice: 999,
      minRun: 1,
      orderCap: 100,
      fixedSetupCost: 500,
      rightsCleared: true,
    });

    // 2 pledges from comic-con, 1 direct (no source)
    await createPledge(slug, 999, `src-a-${Date.now()}`, { source: "mumbai-comic-con" });
    await createPledge(slug, 999, `src-b-${Date.now()}`, { source: "mumbai-comic-con" });
    await createPledge(slug, 999, `src-c-${Date.now()}`);  // no source → "direct"
  });

  it("returns source groups including null as 'direct'", async () => {
    const res = await request(app).get(`/api/campaigns/${slug}/sources`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);

    const comicCon = res.body.find((s: any) => s.source === "mumbai-comic-con");
    const direct   = res.body.find((s: any) => s.source === "direct");

    expect(comicCon).toBeDefined();
    expect(comicCon.optIns).toBe(2);
    expect(direct).toBeDefined();
    expect(direct.optIns).toBe(1);
  });

  it("rejects invalid source value at pledge creation", async () => {
    const consentRes = await createConsent(`bad-src-${Date.now()}`);
    const res = await request(app).post("/api/pledges").send({
      campaignSlug: slug,
      consentId: consentRes.body.consentId,
      pseudonymousId: consentRes.body.pseudonymousId,
      city: "Mumbai",
      language: "Hindi",
      format: "TEE",
      pricePaid: 999,
      source: "INVALID SOURCE!",  // uppercase and special chars not allowed
    });
    expect(res.status).toBe(422);
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

// ── Demo reset ────────────────────────────────────────────────────────────

describe("POST /api/demo/reset", () => {
  it("returns 403 when DEMO_MODE is not set", async () => {
    const saved = process.env.DEMO_MODE;
    delete process.env.DEMO_MODE;
    const res = await request(app).post("/api/demo/reset");
    expect(res.status).toBe(403);
    if (saved !== undefined) process.env.DEMO_MODE = saved;
  });

  it("returns 403 when DEMO_MODE=false", async () => {
    const saved = process.env.DEMO_MODE;
    process.env.DEMO_MODE = "false";
    const res = await request(app).post("/api/demo/reset");
    expect(res.status).toBe(403);
    process.env.DEMO_MODE = saved ?? "";
  });

  it("resets and returns campaigns when DEMO_MODE=true", async () => {
    process.env.DEMO_MODE = "true";
    const res = await request(app).post("/api/demo/reset");
    expect(res.status).toBe(200);
    expect(res.body.reset).toBe(true);
    expect(Array.isArray(res.body.campaigns)).toBe(true);
    expect(res.body.campaigns.length).toBeGreaterThanOrEqual(3);
    // Check FL-DEMO-0001 was recreated
    const demoOrder = await prisma.order.findUnique({ where: { serial: "FL-DEMO-0001" } });
    expect(demoOrder).not.toBeNull();
  });
});

// ── Reopen campaign ───────────────────────────────────────────────────────

describe("POST /api/campaigns/:slug/reopen", () => {
  let adaptSlug: string;
  let stopSlug: string;
  let goSlug: string;

  beforeAll(async () => {
    // Create and settle campaigns to get them into ADAPT, STOP, GO states
    adaptSlug = `reopen-adapt-${Date.now()}`;
    stopSlug  = `reopen-stop-${Date.now()}`;
    goSlug    = `reopen-go-${Date.now()}`;

    // ADAPT: price 799, minRun=1, orderCap=10 → margin below gate
    await createCampaign(adaptSlug, 799, true, { minRun: 1, orderCap: 10, fixedSetupCost: 500 });
    const { res: pr1 } = await createPledge(adaptSlug, 799, `reopen-a-${Date.now()}`);
    await request(app).post(`/api/pledges/${pr1.body.pledge.id}/preauthorize`);
    await request(app).post(`/api/campaigns/${adaptSlug}/settle`);

    // STOP: price 499, negative contribution
    await createCampaign(stopSlug, 499, true, { minRun: 1, orderCap: 10, fixedSetupCost: 500 });
    const { res: pr2 } = await createPledge(stopSlug, 499, `reopen-s-${Date.now()}`);
    await request(app).post(`/api/pledges/${pr2.body.pledge.id}/preauthorize`);
    await request(app).post(`/api/campaigns/${stopSlug}/settle`);

    // GO: price 999, minRun=1, fixedSetupCost=500 → contribution 259, breakEven=2, but orderCap=10 → GO
    await createCampaign(goSlug, 999, true, { minRun: 1, orderCap: 10, fixedSetupCost: 500 });
    const { res: pr3 } = await createPledge(goSlug, 999, `reopen-g-${Date.now()}`);
    await request(app).post(`/api/pledges/${pr3.body.pledge.id}/preauthorize`);
    await request(app).post(`/api/campaigns/${goSlug}/settle`);
  });

  it("reopens an ADAPT campaign to TESTING", async () => {
    const res = await request(app).post(`/api/campaigns/${adaptSlug}/reopen`);
    expect(res.status).toBe(200);
    expect(res.body.campaign.status).toBe("TESTING");
  });

  it("reopens a STOP campaign to TESTING", async () => {
    const res = await request(app).post(`/api/campaigns/${stopSlug}/reopen`);
    expect(res.status).toBe(200);
    expect(res.body.campaign.status).toBe("TESTING");
  });

  it("returns 409 for a GO campaign", async () => {
    const res = await request(app).post(`/api/campaigns/${goSlug}/reopen`);
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/already went ahead/i);
  });

  it("returns 404 for unknown slug", async () => {
    const res = await request(app).post(`/api/campaigns/no-such-slug/reopen`);
    expect(res.status).toBe(404);
  });
});

// ── Late preorder on GO campaign ──────────────────────────────────────────

describe("Late preorder: preauthorize on GO campaign", () => {
  let goSlug: string;
  let lateOrderPledgeId: number;

  beforeAll(async () => {
    // Create a GO campaign with plenty of cap remaining
    goSlug = `late-preorder-${Date.now()}`;
    await createCampaign(goSlug, 999, true, { minRun: 1, orderCap: 50, fixedSetupCost: 500 });

    // Pledge + preauth + settle → GO
    const { res: pr } = await createPledge(goSlug, 999, `late-settler-${Date.now()}`);
    await request(app).post(`/api/pledges/${pr.body.pledge.id}/preauthorize`);
    await request(app).post(`/api/campaigns/${goSlug}/settle`);

    // Verify GO status
    const campaign = await prisma.campaign.findUnique({ where: { slug: goSlug } });
    expect(campaign?.status).toBe("GO");
  });

  it("creates pledge + preauthorizes on GO → CAPTURED immediately with serial", async () => {
    // Create a new pledge on the GO campaign
    const { res: pledgeRes } = await createPledge(goSlug, 999, `late-fan-${Date.now()}`);
    expect(pledgeRes.status).toBe(201);
    lateOrderPledgeId = pledgeRes.body.pledge.id;

    const res = await request(app).post(`/api/pledges/${lateOrderPledgeId}/preauthorize`);
    expect(res.status).toBe(200);
    expect(res.body.mock).toBe(true);
    expect(res.body.captured).toBe(true);
    expect(res.body.serial).toMatch(/^FL-\d{4}-/);
    expect(typeof res.body.remaining).toBe("number");

    // The pledge should be CAPTURED in DB
    const pledge = await prisma.pledge.findUnique({ where: { id: lateOrderPledgeId } });
    expect(pledge?.status).toBe("CAPTURED");

    // An order should exist with the serial
    const order = await prisma.order.findUnique({ where: { pledgeId: lateOrderPledgeId } });
    expect(order?.serial).toBe(res.body.serial);
  });

  it("returns 409 with remaining=0 when campaign is sold out", async () => {
    // Override: create a GO campaign with orderCap=1 and fill it
    // fixedSetupCost=100 → breakEven=ceil(100/259)=1 ≤ orderCap=1 → GO
    const soldOutSlug = `sold-out-${Date.now()}`;
    await createCampaign(soldOutSlug, 999, true, { minRun: 1, orderCap: 1, fixedSetupCost: 100 });

    const { res: pr1 } = await createPledge(soldOutSlug, 999, `so-settler-${Date.now()}`);
    await request(app).post(`/api/pledges/${pr1.body.pledge.id}/preauthorize`);
    await request(app).post(`/api/campaigns/${soldOutSlug}/settle`);

    // Now try a late pledge
    const { res: pr2 } = await createPledge(soldOutSlug, 999, `so-late-${Date.now()}`);
    const preAuthRes = await request(app).post(`/api/pledges/${pr2.body.pledge.id}/preauthorize`);
    expect(preAuthRes.status).toBe(409);
    expect(preAuthRes.body.error).toMatch(/sold out/i);
    expect(preAuthRes.body.remaining).toBe(0);
  });

  it("returns 409 on ADAPT campaign", async () => {
    const adaptSlug = `closed-adapt-${Date.now()}`;
    await createCampaign(adaptSlug, 799, true, { minRun: 1, orderCap: 10, fixedSetupCost: 500 });
    const { res: pr } = await createPledge(adaptSlug, 799, `cadapt-${Date.now()}`);
    await request(app).post(`/api/pledges/${pr.body.pledge.id}/preauthorize`);
    await request(app).post(`/api/campaigns/${adaptSlug}/settle`);

    // New pledge on closed campaign
    const { res: pr2 } = await createPledge(adaptSlug, 799, `cadapt2-${Date.now()}`);
    const res = await request(app).post(`/api/pledges/${pr2.body.pledge.id}/preauthorize`);
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/not open for preorders/i);
  });

  it("returns 409 on STOP campaign", async () => {
    const stopSlug = `closed-stop-${Date.now()}`;
    await createCampaign(stopSlug, 499, true, { minRun: 1, orderCap: 10, fixedSetupCost: 500 });
    const { res: pr } = await createPledge(stopSlug, 499, `cstop-${Date.now()}`);
    await request(app).post(`/api/pledges/${pr.body.pledge.id}/preauthorize`);
    await request(app).post(`/api/campaigns/${stopSlug}/settle`);

    const { res: pr2 } = await createPledge(stopSlug, 499, `cstop2-${Date.now()}`);
    const res = await request(app).post(`/api/pledges/${pr2.body.pledge.id}/preauthorize`);
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/not open for preorders/i);
  });
});

// ── openState and remainingUnits in campaign list ─────────────────────────

describe("GET /api/campaigns — openState and remainingUnits", () => {
  it("includes openState and remainingUnits", async () => {
    const res = await request(app).get("/api/campaigns");
    expect(res.status).toBe(200);
    for (const c of res.body) {
      expect(c).toHaveProperty("openState");
      expect(c).toHaveProperty("remainingUnits");
      expect(["testing","limited","soldOut","closed"]).toContain(c.openState);
      expect(typeof c.remainingUnits).toBe("number");
    }
  });
});
