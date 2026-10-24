/**
 * Seed script: npm run db:seed
 *
 * Creates:
 *  - 4 demo campaigns:
 *      skyblade-chronicles   TEE  ₹799  (ADAPT — used by the fan frontend)
 *      monsoon-samurai-999   TEE  ₹999  (GO)
 *      monsoon-samurai-799   TEE  ₹799  (ADAPT)
 *      monsoon-samurai-499   TEE  ₹499  (STOP)
 *  - Pledges spread across all 9 cities, 6 languages, and 4 formats (TEE/POSTER/CHAPTER/EVENT)
 *  - A ConsentLog row for each pledge
 *
 * The three price cases (499 STOP, 799 ADAPT, 999 GO) are preserved exactly
 * so gate.test.ts and integration.test.ts continue to pass.
 */

import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { makePseudonymousId } from "./pseudonym";
import { COST_PROFILES } from "./costProfiles";

const prisma = new PrismaClient();

// ── Shared enum arrays (mirror backend/src/routes/pledges.ts) ─────────────
const CITIES = [
  "Delhi NCR", "Bengaluru", "Mumbai", "Pune",
  "Chennai", "Hyderabad", "Kolkata", "Jaipur", "Other city",
] as const;

const LANGUAGES = [
  "Hindi", "English", "Tamil", "Telugu", "Bengali", "Other language",
] as const;

const FORMATS = ["TEE", "POSTER", "CHAPTER", "EVENT"] as const;

const SECRET = process.env.SERVER_SECRET ?? "fallback-secret";

// Round-robin pick from an array by index
function pick<T>(arr: readonly T[], i: number): T {
  return arr[i % arr.length];
}

async function main() {
  console.log("🌱 Seeding FandomLoop India...");

  // ── Clean slate ──────────────────────────────────────────────────────────
  await prisma.gateEvaluation.deleteMany();
  await prisma.order.deleteMany();
  await prisma.pledge.deleteMany();
  await prisma.consentLog.deleteMany();
  await prisma.marginGate.deleteMany();
  await prisma.campaign.deleteMany();
  await prisma.seller.deleteMany();

  // ── Campaigns ────────────────────────────────────────────────────────────
  // All use TEE so the three price cases (499/799/999) retain their exact
  // gate verdicts and keep existing tests green.
  const campaignDefs = [
    { slug: "skyblade-chronicles",   title: "Skyblade Chronicles",         listPrice: 799, format: "TEE" as const },
    { slug: "monsoon-samurai-tee-999", title: "Monsoon Samurai Tee (₹999)", listPrice: 999, format: "TEE" as const },
    { slug: "monsoon-samurai-tee",     title: "Monsoon Samurai Tee (₹799)", listPrice: 799, format: "TEE" as const },
    { slug: "monsoon-samurai-tee-499", title: "Monsoon Samurai Tee (₹499)", listPrice: 499, format: "TEE" as const },
  ];

  const createdCampaigns = [];

  for (const c of campaignDefs) {
    const profile = COST_PROFILES[c.format];
    const campaign = await prisma.campaign.create({
      data: {
        slug: c.slug,
        title: c.title,
        format: c.format,
        listPrice: c.listPrice,
        minRun: profile.minRun,
        orderCap: profile.orderCap,
        fixedSetupCost: profile.fixedSetupCost,
        rightsCleared: true,
        status: "TESTING",
        marginGate: {
          create: {
            thresholdPct: 0.20,
            royaltyPct: profile.royaltyPct,
            paymentFeePct: profile.paymentFeePct,
            referralPct: profile.referralPct,
            productionCost: profile.productionCost,
            logisticsCost: profile.logisticsCost,
            packagingCost: profile.packagingCost,
          },
        },
      },
    });
    createdCampaigns.push(campaign);
    console.log(`  ✓ Campaign: ${campaign.slug} (${campaign.format} ₹${campaign.listPrice})`);
  }

  // ── Pledges ──────────────────────────────────────────────────────────────
  // 36 pledges per campaign: cycles through all 9 cities × 4 formats × 6 languages,
  // giving complete coverage across every dimension.
  const PLEDGES_PER_CAMPAIGN = 36;
  let total = 0;

  for (const campaign of createdCampaigns) {
    for (let i = 0; i < PLEDGES_PER_CAMPAIGN; i++) {
      const city     = pick(CITIES,    i);
      const language = pick(LANGUAGES, i);
      const format   = pick(FORMATS,   i);

      const identifier    = `fan-${campaign.slug}-${i}-seed`;
      const pseudonymousId = makePseudonymousId(identifier, SECRET);

      const comment = i % 5 === 0
        ? `Would love a ${language} dub — seed comment #${i}`
        : undefined;

      const consent = await prisma.consentLog.create({
        data: {
          pseudonymousId,
          purpose: "campaign_pledge",
          noticeVersion: "v1.0",
          ageConfirmed: true,
          guardianConsent: false,
        },
      });

      // Use the correct cost profile for each format so pricePaid makes sense
      const profile = COST_PROFILES[format];
      // Price: use campaign.listPrice for TEE (preserves gate cases);
      // for other formats use the format's minRun-aligned price.
      const pricePaid =
        format === "TEE"     ? campaign.listPrice :
        format === "POSTER"  ? 299 :
        format === "CHAPTER" ? 149 :
        /* EVENT */            599;

      await prisma.pledge.create({
        data: {
          campaignId: campaign.id,
          pseudonymousId,
          city,
          language,
          format,
          pricePaid,
          comment: comment ?? null,
          status: "OPTED_IN",
          consentId: consent.id,
        },
      });

      total++;
    }
  }

  console.log(`  ✓ Created ${total} pledges with consent logs`);

  // ── Sellers ──────────────────────────────────────────────────────────────
  const authorizedSeller = await prisma.seller.upsert({
    where: { name: "Otaku Hub India" },
    update: { authorized: true },
    create: { name: "Otaku Hub India", authorized: true },
  });

  // An unauthorized seller — used to test the "doesn't check out" UI path
  await prisma.seller.upsert({
    where: { name: "Fake Merch Co." },
    update: { authorized: false },
    create: { name: "Fake Merch Co.", authorized: false },
  });

  console.log(`  ✓ Sellers: Otaku Hub India (authorized), Fake Merch Co. (unauthorized)`);

  // ── Demo order FL-DEMO-0001 ───────────────────────────────────────────────
  // Always present so the QR demo works on any device without a preorder.
  const skybladeChronicles = createdCampaigns[0]; // skyblade-chronicles
  await prisma.order.upsert({
    where: { serial: "FL-DEMO-0001" },
    update: {},
    create: {
      serial: "FL-DEMO-0001",
      campaignId: skybladeChronicles.id,
      pledgeId: null,
      itemName: "Skyblade Chronicles hoodie (demo)",
      batch: "B-2026-01",
      sellerId: authorizedSeller.id,
    },
  });

  console.log(`  ✓ Demo order: FL-DEMO-0001`);
  console.log("✅ Seed complete.");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
