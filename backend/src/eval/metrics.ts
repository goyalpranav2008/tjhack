/**
 * Pure evaluation metric functions.
 * No I/O — fully unit testable.
 */

export type ConfusionMatrix = Record<string, Record<string, number>>;

// ── Accuracy ──────────────────────────────────────────────────────────────

export function accuracy(trues: string[], preds: string[]): number {
  if (trues.length === 0) return 0;
  const correct = trues.filter((t, i) => t === preds[i]).length;
  return correct / trues.length;
}

// ── Confusion matrix ──────────────────────────────────────────────────────

export function confusionMatrix(
  trues: string[],
  preds: string[],
  labels: string[]
): ConfusionMatrix {
  const matrix: ConfusionMatrix = {};
  for (const t of labels) {
    matrix[t] = {};
    for (const p of labels) matrix[t][p] = 0;
  }
  for (let i = 0; i < trues.length; i++) {
    const t = trues[i];
    const p = preds[i];
    if (matrix[t] && matrix[t][p] !== undefined) {
      matrix[t][p]++;
    }
  }
  return matrix;
}

// ── Precision, recall, F1 per class ──────────────────────────────────────

export function precision(label: string, matrix: ConfusionMatrix): number {
  const col = Object.values(matrix).reduce((s, row) => s + (row[label] ?? 0), 0);
  if (col === 0) return 0;
  return (matrix[label]?.[label] ?? 0) / col;
}

export function recall(label: string, matrix: ConfusionMatrix): number {
  const row = Object.values(matrix[label] ?? {}).reduce((s, v) => s + v, 0);
  if (row === 0) return 0;
  return (matrix[label]?.[label] ?? 0) / row;
}

export function f1(label: string, matrix: ConfusionMatrix): number {
  const p = precision(label, matrix);
  const r = recall(label, matrix);
  if (p + r === 0) return 0;
  return (2 * p * r) / (p + r);
}

// ── Macro F1 ──────────────────────────────────────────────────────────────

export function macroF1(labels: string[], matrix: ConfusionMatrix): number {
  if (labels.length === 0) return 0;
  const scores = labels.map((l) => f1(l, matrix));
  return scores.reduce((s, v) => s + v, 0) / labels.length;
}

// ── Per-language accuracy ─────────────────────────────────────────────────

export type PerLanguageAccuracy = Record<string, { topic: number; sentiment: number; count: number }>;

export function perLanguageAccuracy(
  rows: Array<{ language: string; trueTopic: string; predTopic: string; trueSentiment: string; predSentiment: string }>
): PerLanguageAccuracy {
  const buckets: Record<string, { topicOk: number; sentOk: number; total: number }> = {};

  for (const row of rows) {
    const lang = row.language;
    if (!buckets[lang]) buckets[lang] = { topicOk: 0, sentOk: 0, total: 0 };
    buckets[lang].total++;
    if (row.trueTopic === row.predTopic) buckets[lang].topicOk++;
    if (row.trueSentiment === row.predSentiment) buckets[lang].sentOk++;
  }

  const result: PerLanguageAccuracy = {};
  for (const [lang, b] of Object.entries(buckets)) {
    result[lang] = {
      topic:     b.total > 0 ? b.topicOk / b.total : 0,
      sentiment: b.total > 0 ? b.sentOk  / b.total : 0,
      count:     b.total,
    };
  }
  return result;
}

// ── Top mistakes ──────────────────────────────────────────────────────────

export type Mistake = {
  text: string;
  trueLabel: string;
  predLabel: string;
  kind: "topic" | "sentiment";
};

export function topMistakes(
  rows: Array<{ text: string; trueTopic: string; predTopic: string; trueSentiment: string; predSentiment: string }>,
  n: number = 10
): Mistake[] {
  const mistakes: Mistake[] = [];
  for (const row of rows) {
    if (row.trueTopic !== row.predTopic) {
      mistakes.push({ text: row.text, trueLabel: row.trueTopic, predLabel: row.predTopic, kind: "topic" });
    }
    if (row.trueSentiment !== row.predSentiment) {
      mistakes.push({ text: row.text, trueLabel: row.trueSentiment, predLabel: row.predSentiment, kind: "sentiment" });
    }
  }
  return mistakes.slice(0, n);
}
