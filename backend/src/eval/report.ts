/**
 * Analysis report builder.
 *
 * Assembles the full JSON report consumed by:
 *   - GET /api/analysis/report
 *   - POST /api/analysis/run
 *   - npm run analyze
 */

import prisma from "../db";
import { evaluateGate } from "../gate";
import { buildGateInput } from "../gateInputBuilder";
import { COST_PROFILES } from "../costProfiles";
import { loadTrends } from "../signals/trends";
import { computePriors, blendPriorAndVotes } from "../signals/prior";
import { topMistakes } from "./metrics";

// ── Types ─────────────────────────────────────────────────────────────────

export type AnalysisReport = {
  generatedAt: string;
  dataSources: DataSourceEntry[];
  dataQuality: DataQualitySection;
  nlp: NlpSection;
  demand: DemandSection;
  gate: GateSection;
  limitations: string[];
};

type DataSourceEntry = {
  name: string;
  table: string;
  rowsStored: number;
  lastFetched: string | null;
  isSample: boolean;
  retentionNote: string;
};

type DataQualitySection = {
  missingComments: number;
  missingCity: number;
  missingLanguage: number;
  duplicatePseudonymousIdsPerCampaign: Array<{ campaignSlug: string; duplicates: number }>;
  pricesOutsideBands: number;
  commentsScrubbed: number;
  withdrawnExcluded: number;
};

type NlpSection = {
  latestRunPerMethod: Array<{
    method: string;
    datasetSize: number;
    accuracyTopic: number | null;
    macroF1Topic: number | null;
    accuracySentiment: number | null;
    macroF1Sentiment: number | null;
    perLanguage: Record<string, { topic: number; sentiment: number; count: number }>;
    confusionTopic: Record<string, Record<string, number>> | null;
    confusionSentiment: Record<string, Record<string, number>> | null;
    topMistakes: ReturnType<typeof topMistakes>;
    notes: string | null;
    ranAt: string;
  }>;
  bestMethod: string | null;
  modelNote: string;
};

type DemandSection = Array<{
  campaignSlug: string;
  campaignTitle: string;
  perCity: Array<{
    city: string;
    optIns: number;
    committed: number;
    demandScore: number;
    prior: number | null;
    blended: number | null;
    w: number | null;
  }>;
}>;

type GateSection = Array<{
  campaignSlug: string;
  status: string;
  contribution: number;
  marginPct: number;
  breakEvenOrders: number | null;
  reasons: string[];
}>;

// ── Helpers ───────────────────────────────────────────────────────────────

const VALID_PRICE_BANDS = [99, 299, 699, 999];

function isOutsideBands(price: number): boolean {
  return !VALID_PRICE_BANDS.some((b) => Math.abs(price - b) < 50);
}

// ── Main builder ──────────────────────────────────────────────────────────

export async function buildReport(): Promise<AnalysisReport> {
  const generatedAt = new Date().toISOString();
  const limitations: string[] = [];

  // ── DATA SOURCES ─────────────────────────────────────────────────────────

  const [
    pledgeCount,
    commentCount,
    snapshotCount,
    labeledCount,
    withdrawnCount,
    signalSnapshots,
  ] = await Promise.all([
    prisma.pledge.count({ where: { withdrawn: false } }),
    prisma.pledge.count({ where: { withdrawn: false, comment: { not: null } } }),
    prisma.signalSnapshot.count(),
    prisma.labeledComment.count(),
    prisma.pledge.count({ where: { withdrawn: true } }),
    prisma.signalSnapshot.findMany({ orderBy: { fetchedAt: "desc" }, take: 10 }),
  ]);

  const anilistSnap = signalSnapshots.find((s) => s.source === "anilist");
  const trendsSnap  = signalSnapshots.find((s) => s.source === "google-trends");

  const allSynthetic = await prisma.labeledComment.count({ where: { source: "synthetic-demo" } });
  const hasRealLabels = labeledCount > allSynthetic;

  const dataSources: DataSourceEntry[] = [
    {
      name: "Fan pledges",
      table: "Pledge",
      rowsStored: pledgeCount,
      lastFetched: null,
      isSample: false,
      retentionNote: "Kept until withdrawal (POST /api/consent/withdraw). Pseudonymous IDs only — no raw phone numbers.",
    },
    {
      name: "Fan comments",
      table: "Pledge.comment",
      rowsStored: commentCount,
      lastFetched: null,
      isSample: false,
      retentionNote: "PII-scrubbed before storage. Excluded for withdrawn users.",
    },
    {
      name: "AniList signal",
      table: "SignalSnapshot (source=anilist)",
      rowsStored: signalSnapshots.filter((s) => s.source === "anilist").length,
      lastFetched: anilistSnap?.fetchedAt?.toISOString() ?? null,
      isSample: anilistSnap?.isSample ?? true,
      retentionNote: "24-hour TTL. Only fields used in prior score stored (id, popularity, trending, genres). No full DB mirror.",
    },
    {
      name: "Google Trends CSV",
      table: "SignalSnapshot (source=google-trends)",
      rowsStored: signalSnapshots.filter((s) => s.source === "google-trends").length,
      lastFetched: trendsSnap?.fetchedAt?.toISOString() ?? null,
      isSample: false,
      retentionNote: "Manually exported from trends.google.com. Stored per campaign slug. Refreshed manually.",
    },
    {
      name: "Labeled comment set",
      table: "LabeledComment",
      rowsStored: labeledCount,
      lastFetched: null,
      isSample: !hasRealLabels,
      retentionNote: "Ground-truth for classifier evaluation. PII-scrubbed. Mark source=team-labeled when real labels are added.",
    },
  ];

  if (!hasRealLabels) {
    limitations.push("Labeled comment set is entirely synthetic-demo. Replace with real team-labeled comments before relying on evaluation metrics.");
  }
  if (pledgeCount < 50) {
    limitations.push("Fewer than 50 active pledges — demand scores have high variance.");
  }

  // ── DATA QUALITY ─────────────────────────────────────────────────────────

  const [missingComments, missingCity, missingLang, allPledges] = await Promise.all([
    prisma.pledge.count({ where: { withdrawn: false, comment: null } }),
    prisma.pledge.count({ where: { withdrawn: false, city: "" } }),
    prisma.pledge.count({ where: { withdrawn: false, language: "" } }),
    prisma.pledge.findMany({
      where: { withdrawn: false },
      select: { campaignId: true, pseudonymousId: true, pricePaid: true, campaign: { select: { slug: true } } },
    }),
  ]);

  // Duplicate pseudonymousIds per campaign
  const pIdByCampaign: Record<number, { slug: string; ids: string[] }> = {};
  let pricesOutside = 0;
  for (const p of allPledges) {
    if (!pIdByCampaign[p.campaignId]) {
      pIdByCampaign[p.campaignId] = { slug: p.campaign.slug, ids: [] };
    }
    pIdByCampaign[p.campaignId].ids.push(p.pseudonymousId);
    if (isOutsideBands(p.pricePaid)) pricesOutside++;
  }

  const dupRows = Object.values(pIdByCampaign)
    .map(({ slug, ids }) => {
      const unique = new Set(ids).size;
      return { campaignSlug: slug, duplicates: ids.length - unique };
    })
    .filter((r) => r.duplicates > 0);

  const dataQuality: DataQualitySection = {
    missingComments,
    missingCity,
    missingLanguage: missingLang,
    duplicatePseudonymousIdsPerCampaign: dupRows,
    pricesOutsideBands: pricesOutside,
    commentsScrubbed: commentCount,   // all comments pass through scrubPII — count equals stored
    withdrawnExcluded: withdrawnCount,
  };

  // ── NLP ───────────────────────────────────────────────────────────────────

  const latestRuns = await prisma.evalRun.findMany({
    orderBy: { startedAt: "desc" },
    take: 30,
    include: {
      predictions: {
        include: { labeledComment: { select: { text: true } } },
        take: 50,
      },
    },
  });

  const bestPerMethod: Record<string, typeof latestRuns[0]> = {};
  for (const r of latestRuns) {
    if (!bestPerMethod[r.method]) bestPerMethod[r.method] = r;
  }

  const llmRun = bestPerMethod["llm"];
  if (!llmRun || llmRun.notes?.includes("not-run")) {
    limitations.push("LLM classifier not run (LLM_API_KEY not set). Evaluation covers keyword and baseline only.");
  }
  if (!process.env.LLM_API_KEY) {
    limitations.push("LLM_API_KEY is not configured. The 'llm' method in eval shows no metrics.");
  }

  const nlpRows = Object.values(bestPerMethod).map((r) => {
    const preds = r.predictions;
    const mistakeRows = preds.map((p) => ({
      text:           p.labeledComment.text,
      trueTopic:      p.labeledComment ? "" : "",  // we need the label — reload below
      predTopic:      p.predictedTopic,
      trueSentiment:  "",
      predSentiment:  p.predictedSentiment,
    }));

    return {
      method:             r.method,
      datasetSize:        r.datasetSize,
      accuracyTopic:      r.accuracyTopic,
      macroF1Topic:       r.macroF1Topic,
      accuracySentiment:  r.accuracySentiment,
      macroF1Sentiment:   r.macroF1Sentiment,
      perLanguage:        r.perLanguageJson ? JSON.parse(r.perLanguageJson) : {},
      confusionTopic:     r.confusionTopicJson ? JSON.parse(r.confusionTopicJson) : null,
      confusionSentiment: r.confusionSentimentJson ? JSON.parse(r.confusionSentimentJson) : null,
      topMistakes:        [] as ReturnType<typeof topMistakes>, // filled below
      notes:              r.notes,
      ranAt:              r.startedAt.toISOString(),
    };
  });

  // Fill top mistakes properly
  for (let i = 0; i < nlpRows.length; i++) {
    const r = Object.values(bestPerMethod)[i];
    const preds = await prisma.evalPrediction.findMany({
      where: { evalRunId: r.id },
      include: { labeledComment: true },
      take: 200,
    });
    const mRows = preds.map((p) => ({
      text:          p.labeledComment.text,
      trueTopic:     p.labeledComment.topicLabel,
      predTopic:     p.predictedTopic,
      trueSentiment: p.labeledComment.sentimentLabel,
      predSentiment: p.predictedSentiment,
    }));
    nlpRows[i].topMistakes = topMistakes(mRows, 10);
  }

  // Best method = highest topic macroF1 among methods that ran
  let bestMethod: string | null = null;
  let bestF1 = -1;
  for (const row of nlpRows) {
    if (row.macroF1Topic != null && row.macroF1Topic > bestF1) {
      bestF1 = row.macroF1Topic;
      bestMethod = row.method;
    }
  }

  const nlp: NlpSection = {
    latestRunPerMethod: nlpRows,
    bestMethod,
    modelNote: "No model is trained. We use rules (keyword classifier) plus an optional LLM API call, evaluated on a labeled test set.",
  };

  if (nlpRows.length === 0) {
    limitations.push("No evaluation runs found. Run: npm run eval:import && npm run eval:run");
  }

  // ── DEMAND ────────────────────────────────────────────────────────────────

  const campaigns = await prisma.campaign.findMany({
    include: { marginGate: true },
    orderBy: { createdAt: "desc" },
  });

  const demand: DemandSection = [];

  for (const c of campaigns) {
    const pledges = await prisma.pledge.findMany({
      where: { campaignId: c.id, withdrawn: false },
      select: { city: true, status: true },
    });

    const cityOptIns:    Record<string, number> = {};
    const cityCommitted: Record<string, number> = {};

    for (const p of pledges) {
      cityOptIns[p.city]    = (cityOptIns[p.city] ?? 0) + 1;
      if (p.status === "PREAUTHORIZED" || p.status === "CAPTURED") {
        cityCommitted[p.city] = (cityCommitted[p.city] ?? 0) + 1;
      }
    }

    const trendsData = loadTrends(c.slug);
    const totalCommitted = Object.values(cityCommitted).reduce((s, v) => s + v, 0);
    const externalTitle = (c as any).externalTitle as string | null;

    const priorResult = computePriors(
      Object.keys(trendsData.regional).length > 0 ? trendsData.regional : null,
      null,
      trendsData.timeseries,
      externalTitle
    );

    const perCity = Object.keys(cityOptIns).map((city) => {
      const cp = priorResult.perCity.find((p) => p.city === city);
      const voteScore = pledges.length > 0
        ? Math.min(100, ((cityOptIns[city] ?? 0) / pledges.length) * 300)
        : 0;
      const blend = cp
        ? blendPriorAndVotes(city, cp.prior, voteScore, totalCommitted)
        : null;

      return {
        city,
        optIns:      cityOptIns[city] ?? 0,
        committed:   cityCommitted[city] ?? 0,
        demandScore: 0,  // from segments endpoint — simplified here
        prior:       cp?.prior ?? null,
        blended:     blend?.posterior ?? null,
        w:           blend?.w ?? null,
      };
    });

    demand.push({ campaignSlug: c.slug, campaignTitle: c.title, perCity });
  }

  // ── GATE ─────────────────────────────────────────────────────────────────

  const gate: GateSection = [];

  for (const c of campaigns) {
    const committed = await prisma.pledge.count({
      where: { campaignId: c.id, withdrawn: false, status: { in: ["PREAUTHORIZED", "CAPTURED"] } },
    });
    const input = buildGateInput(c, committed);
    const verdict = evaluateGate(input);
    gate.push({
      campaignSlug:    c.slug,
      status:          verdict.status,
      contribution:    verdict.contribution,
      marginPct:       verdict.marginPct,
      breakEvenOrders: verdict.breakEvenOrders,
      reasons:         verdict.reasons,
    });
  }

  // ── LIMITATIONS ───────────────────────────────────────────────────────────

  if (!process.env.STUDIO_API_KEY) {
    limitations.push("STUDIO_API_KEY not set — studio endpoints are unauthenticated in this environment.");
  }
  limitations.push("No real outcome data yet (no completed, shipped campaigns). Demand forecasting model cannot be trained.");
  limitations.push("AniList popularity score is a public proxy for fandom engagement, not a direct measure of purchase intent.");
  limitations.push("Google Trends data is manually exported — it may lag real-time trends by hours to days.");
  limitations.push("Sentiment lexicon is small and hand-curated. It may under-perform on sarcasm and mixed-code (Hinglish) text.");

  return {
    generatedAt,
    dataSources,
    dataQuality,
    nlp,
    demand,
    gate,
    limitations,
  };
}
