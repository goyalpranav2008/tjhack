/**
 * Seed script: npm run db:seed
 *
 * Creates:
 *  - 3 demo campaigns (monsoon-samurai-tee product):
 *      monsoon-samurai-tee-999  TEE ₹999  130 pledges, 110 PREAUTHORIZED → GO
 *      monsoon-samurai-tee      TEE ₹799  120 pledges, 105 PREAUTHORIZED → ADAPT
 *      monsoon-samurai-tee-499  TEE ₹499  120 pledges, 100 PREAUTHORIZED → STOP
 *
 * Exports seedDemo(prisma) so it can also be called from the demo/reset route.
 */

import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { makePseudonymousId } from "./pseudonym";
import { COST_PROFILES } from "./costProfiles";

// ── Shared enum arrays ────────────────────────────────────────────────────

const CITIES = [
  "Delhi NCR", "Bengaluru", "Mumbai", "Pune",
  "Chennai", "Hyderabad", "Kolkata", "Jaipur", "Other city",
] as const;

const LANGUAGES = [
  "Hindi", "English", "Tamil", "Telugu", "Bengali", "Other language",
] as const;

const FORMATS = ["TEE", "POSTER", "CHAPTER", "EVENT"] as const;

const SOURCES: (string | null)[] = [
  "mumbai-comic-con", "creator-demo", null,
  "mumbai-comic-con", null, "creator-demo",
  null, null, "mumbai-comic-con", null,
];

const COMMENTS = [
  "Bhai yeh toh ekdum mast hai! 🔥",
  "Yeh design bahut achha hai, zaroor khareedunga",
  "இந்த டிசைன் மிகவும் அழகாக இருக்கிறது!",
  "ఈ డిజైన్ చాలా బాగుంది, తప్పకుండా కొంటాను",
  "এই ডিজাইনটি অসাধারণ, অবশ্যই কিনব",
  "Please Hindi dubbed version chahiye",
  "Quality kaisi hogi? Cotton fabric chahiye",
  "Mumbai mein pickup available hai kya?",
  "திரும்பவும் தயவுசெய்து தமிழில் டப் செய்யுங்கள்",
  "Delivery fast karo bhai, event ke pehle chahiye",
  "সুন্দর ডিজাইন, দাম একটু বেশি মনে হচ্ছে",
  "ఈ ధర కొంచెం ఎక్కువగా ఉంది, తగ్గించగలరా?",
  "Would love a Bengaluru exclusive drop!",
  "Kab aayega? Release date confirm karo",
  "Screen printing quality acchi honi chahiye",
] as const;

function pick<T>(arr: readonly T[], i: number): T {
  return arr[i % arr.length];
}

function pickSource(i: number): string | null {
  return SOURCES[i % SOURCES.length];
}

// ── Exported seeding function (also used by POST /api/demo/reset) ─────────

export async function seedDemo(prisma: PrismaClient): Promise<void> {
  const SECRET = process.env.SERVER_SECRET ?? "fallback-secret";

  console.log("🌱 Seeding FandomLoop India...");

  // Clean slate
  await prisma.scanLog.deleteMany();
  await prisma.gateEvaluation.deleteMany();
  await prisma.order.deleteMany();
  await prisma.pledge.deleteMany();
  await prisma.consentLog.deleteMany();
  await prisma.marginGate.deleteMany();
  await prisma.campaign.deleteMany();
  await prisma.seller.deleteMany();

  // Sellers
  const authorizedSeller = await prisma.seller.upsert({
    where: { name: "Otaku Hub India" },
    update: { authorized: true },
    create: { name: "Otaku Hub India", authorized: true },
  });

  await prisma.seller.upsert({
    where: { name: "Fake Merch Co." },
    update: { authorized: false },
    create: { name: "Fake Merch Co.", authorized: false },
  });

  console.log("  ✓ Sellers created");

  // Campaign definitions
  const campaignDefs = [
    { slug: "monsoon-samurai-tee-999", title: "Monsoon Samurai Tee (₹999)", listPrice: 999, totalPledges: 130, preauthorized: 110 },
    { slug: "monsoon-samurai-tee",     title: "Monsoon Samurai Tee",         listPrice: 799, totalPledges: 120, preauthorized: 105 },
    { slug: "monsoon-samurai-tee-499", title: "Monsoon Samurai Tee (₹499)", listPrice: 499, totalPledges: 120, preauthorized: 100 },
  ];

  const createdCampaigns = [];

  for (const c of campaignDefs) {
    const profile = COST_PROFILES["TEE"];
    const campaign = await prisma.campaign.create({
      data: {
        slug: c.slug,
        title: c.title,
        format: "TEE",
        listPrice: c.listPrice,
        minRun: profile.minRun,
        orderCap: profile.orderCap,
        fixedSetupCost: profile.fixedSetupCost,
        rightsCleared: true,
        status: "TESTING",
        sellerId: authorizedSeller.id,
        externalTitle: "Jujutsu Kaisen",
        marginGate: {
          create: {
            thresholdPct: 0.20,
            royaltyPct: profile.royaltyPct,
            paymentFeePct: profile.paymentFeePct,
            referralPct: profile.referralPct,
            platformFeePct: profile.platformFeePct,
            productionCost: profile.productionCost,
            logisticsCost: profile.logisticsCost,
            packagingCost: profile.packagingCost,
          },
        },
      },
    });
    createdCampaigns.push({ campaign, def: c });
    console.log(`  ✓ Campaign: ${campaign.slug} (₹${campaign.listPrice})`);
  }

  // Pledges
  let totalPledges = 0;

  for (const { campaign, def } of createdCampaigns) {
    for (let i = 0; i < def.totalPledges; i++) {
      const city     = pick(CITIES,    i);
      const language = pick(LANGUAGES, i);
      const format   = pick(FORMATS,   i);
      const source   = pickSource(i);

      const identifier     = `fan-${campaign.slug}-${i}-seed`;
      const pseudonymousId = makePseudonymousId(identifier, SECRET);
      const comment        = i % 4 === 0 ? COMMENTS[i % COMMENTS.length] : undefined;
      const platforms      = i % 2 === 0 ? "netflix" : null;

      const consent = await prisma.consentLog.create({
        data: {
          pseudonymousId,
          purpose: "campaign_pledge",
          noticeVersion: "v1.0",
          ageConfirmed: true,
          guardianConsent: false,
        },
      });

      const pricePaid =
        format === "TEE"    ? campaign.listPrice :
        format === "POSTER" ? 299 :
        format === "CHAPTER"? 149 : 599;

      const status = i < def.preauthorized ? "PREAUTHORIZED" : "OPTED_IN";

      await prisma.pledge.create({
        data: {
          campaignId: campaign.id,
          pseudonymousId,
          city, language, format, pricePaid,
          comment: comment ?? null,
          status,
          consentId: consent.id,
          withdrawn: false,
          source,
          platforms,
        },
      });
      totalPledges++;
    }
    console.log(`  ✓ ${def.totalPledges} pledges for ${campaign.slug}`);
  }
  console.log(`  ✓ Total pledges: ${totalPledges}`);

  // Demo order FL-DEMO-0001
  const tee999 = createdCampaigns[0].campaign;
  await prisma.order.upsert({
    where: { serial: "FL-DEMO-0001" },
    update: {},
    create: {
      serial:     "FL-DEMO-0001",
      campaignId: tee999.id,
      pledgeId:   null,
      itemName:   "Monsoon Samurai Tee (demo)",
      batch:      "B-2026-01",
      sellerId:   authorizedSeller.id,
    },
  });

  console.log("  ✓ Demo order: FL-DEMO-0001");
  console.log("✅ Seed complete.");
}

// ── CLI entry point ───────────────────────────────────────────────────────

const prisma = new PrismaClient();

seedDemo(prisma)
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
