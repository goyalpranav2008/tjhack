/**
 * Evaluation runner.
 *
 * npm run eval:run [--force]
 *
 * Runs every method over all LabeledComments, stores EvalRun + EvalPrediction
 * rows, and prints a readable results table.
 *
 * --force  Re-runs even if a run already exists for today (default: skip).
 */

import "dotenv/config";
import prisma from "../db";
import { scrubPII } from "./pii";
import {
  classifyBaseline,
  classifyKeyword,
  classifyLlmBatch,
  ClassifierResult,
  TopicLabel,
  SentimentLabel,
  BASELINE_TOPIC,
  BASELINE_SENTIMENT,
} from "./classifiers";
import {
  accuracy,
  confusionMatrix,
  macroF1,
  perLanguageAccuracy,
  topMistakes,
} from "./metrics";

const TOPIC_LABELS: TopicLabel[]         = ["price","dubbing","merch-quality","delivery","events","other"];
const SENTIMENT_LABELS: SentimentLabel[] = ["positive","negative","neutral"];

// ── Helpers ───────────────────────────────────────────────────────────────

function pad(s: string | number, n: number) {
  return String(s).padEnd(n);
}
function num(v: number | undefined | null) {
  if (v == null) return "  n/a";
  return (v * 100).toFixed(1).padStart(5);
}

// ── Main ──────────────────────────────────────────────────────────────────

async function runMethod(
  method: "baseline" | "keyword" | "llm",
  comments: Array<{ id: number; text: string; scriptLanguage: string; topicLabel: string; sentimentLabel: string }>,
  force: boolean
): Promise<void> {
  // Skip if cached run exists and not forced
  if (!force) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const existing = await prisma.evalRun.findFirst({
      where: { method, startedAt: { gte: today } },
    });
    if (existing) {
      console.log(`  [${method}] Skipping — run exists for today (id=${existing.id}). Use --force to re-run.`);
      return;
    }
  }

  console.log(`  [${method}] Classifying ${comments.length} comments…`);

  let preds: ClassifierResult[];

  if (method === "baseline") {
    preds = comments.map((c) => classifyBaseline(c.text));
  } else if (method === "keyword") {
    preds = comments.map((c) => classifyKeyword(c.text));
  } else {
    // LLM — check if LLM_API_KEY set first
    if (!process.env.LLM_API_KEY) {
      console.log(`  [llm] LLM_API_KEY not set — creating not-run record.`);
      await prisma.evalRun.create({
        data: {
          method: "llm",
          datasetSize: comments.length,
          notes: "LLM_API_KEY not configured — method not run.",
        },
      });
      return;
    }

    // Check for cached LLM predictions (don't re-call API if already stored)
    const cachedPreds = force ? [] : await prisma.evalPrediction.findMany({
      where: {
        labeledCommentId: { in: comments.map((c) => c.id) },
        evalRun: { method: "llm" },
      },
      include: { evalRun: true },
    });

    if (!force && cachedPreds.length === comments.length) {
      console.log(`  [llm] Using ${cachedPreds.length} cached predictions.`);
      preds = cachedPreds.map((p) => ({
        topic:     p.predictedTopic as TopicLabel,
        sentiment: p.predictedSentiment as SentimentLabel,
        status:    "ok" as const,
      }));
    } else {
      preds = await classifyLlmBatch(comments.map((c) => c.text));
    }
  }

  const allNotRun = preds.every((p) => p.status === "not-run");

  // Compute metrics
  const trueTopics     = comments.map((c) => c.topicLabel);
  const trueSentiments = comments.map((c) => c.sentimentLabel);
  const predTopics     = preds.map((p) => p.topic);
  const predSentiments = preds.map((p) => p.sentiment);

  const accTopic     = allNotRun ? null : accuracy(trueTopics, predTopics);
  const accSent      = allNotRun ? null : accuracy(trueSentiments, predSentiments);
  const matTopic     = allNotRun ? null : confusionMatrix(trueTopics, predTopics, TOPIC_LABELS);
  const matSent      = allNotRun ? null : confusionMatrix(trueSentiments, predSentiments, SENTIMENT_LABELS);
  const mf1Topic     = allNotRun || !matTopic ? null : macroF1(TOPIC_LABELS, matTopic);
  const mf1Sent      = allNotRun || !matSent  ? null : macroF1(SENTIMENT_LABELS, matSent);

  const langRows = comments.map((c, i) => ({
    language: c.scriptLanguage,
    trueTopic: c.topicLabel,
    predTopic: predTopics[i],
    trueSentiment: c.sentimentLabel,
    predSentiment: predSentiments[i],
  }));
  const perLang = allNotRun ? {} : perLanguageAccuracy(langRows);

  const mistakeRows = comments.map((c, i) => ({
    text: c.text,
    trueTopic: c.topicLabel,
    predTopic: predTopics[i],
    trueSentiment: c.sentimentLabel,
    predSentiment: predSentiments[i],
  }));
  const mistakes = allNotRun ? [] : topMistakes(mistakeRows, 10);

  // Create EvalRun
  const run = await prisma.evalRun.create({
    data: {
      method,
      datasetSize: comments.length,
      accuracyTopic:    accTopic,
      macroF1Topic:     mf1Topic,
      accuracySentiment: accSent,
      macroF1Sentiment: mf1Sent,
      perLanguageJson:       JSON.stringify(perLang),
      confusionTopicJson:    matTopic ? JSON.stringify(matTopic) : null,
      confusionSentimentJson: matSent  ? JSON.stringify(matSent)  : null,
      notes: allNotRun ? "LLM_API_KEY not configured — method not run." : null,
    },
  });

  // Create EvalPredictions (skip if not-run)
  if (!allNotRun) {
    for (const [i, c] of comments.entries()) {
      try {
        await prisma.evalPrediction.create({
          data: {
            evalRunId:          run.id,
            labeledCommentId:   c.id,
            predictedTopic:     preds[i].topic,
            predictedSentiment: preds[i].sentiment,
            correctTopic:       preds[i].topic === c.topicLabel,
            correctSentiment:   preds[i].sentiment === c.sentimentLabel,
          },
        });
      } catch {
        // @@unique([evalRunId, labeledCommentId]) — skip duplicates
      }
    }
  }

  console.log(`  [${method}] Done — EvalRun id=${run.id}`);

  // Print summary
  if (!allNotRun) {
    console.log(`           topic acc=${num(accTopic)}%  topic macroF1=${num(mf1Topic)}%`);
    console.log(`           sent  acc=${num(accSent)}%  sent  macroF1=${num(mf1Sent)}%`);
    if (Object.keys(perLang).length > 0) {
      console.log("           Per-language topic accuracy:");
      for (const [lang, vals] of Object.entries(perLang)) {
        console.log(`             ${pad(lang, 12)} ${num(vals.topic)}%  (n=${vals.count})`);
      }
    }
    if (mistakes.length > 0) {
      console.log(`           Top ${mistakes.length} mistakes:`);
      for (const m of mistakes) {
        const snippet = m.text.slice(0, 60).replace(/\n/g, " ");
        console.log(`             [${m.kind}] true="${m.trueLabel}" pred="${m.predLabel}"  "${snippet}"`);
      }
    }
  }
}

async function main() {
  const force = process.argv.includes("--force");
  console.log(`\n=== FandomLoop Evaluation Run (force=${force}) ===`);

  const comments = await prisma.labeledComment.findMany({
    orderBy: { id: "asc" },
  });

  if (comments.length === 0) {
    console.error("No labeled comments found. Run: npm run eval:import");
    process.exit(1);
  }

  console.log(`Dataset: ${comments.length} labeled comments`);

  for (const method of ["baseline", "keyword", "llm"] as const) {
    await runMethod(method, comments, force);
  }

  // Print comparison table
  const latestRuns = await prisma.evalRun.findMany({
    orderBy: { startedAt: "desc" },
    take: 20,
  });

  // Keep only the most recent run per method
  const best: Record<string, typeof latestRuns[0]> = {};
  for (const r of latestRuns) {
    if (!best[r.method]) best[r.method] = r;
  }

  console.log("\n┌─────────────┬───────────┬──────────────┬───────────────┬──────────────────┐");
  console.log("│ Method      │ Topic acc │ Topic macF1  │ Sentiment acc │ Sentiment macF1  │");
  console.log("├─────────────┼───────────┼──────────────┼───────────────┼──────────────────┤");
  for (const method of ["baseline", "keyword", "llm"]) {
    const r = best[method];
    if (!r) { console.log(`│ ${pad(method, 11)} │   (no run)                                               │`); continue; }
    const note = r.notes?.includes("not-run") ? " [not-run]" : "";
    console.log(`│ ${pad(method, 11)} │ ${num(r.accuracyTopic)}%    │ ${num(r.macroF1Topic)}%        │ ${num(r.accuracySentiment)}%         │ ${num(r.macroF1Sentiment)}%             │${note}`);
  }
  console.log("└─────────────┴───────────┴──────────────┴───────────────┴──────────────────┘");
  console.log("\nDone.\n");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
