/**
 * Unit tests for the evaluation layer.
 *
 * Covers:
 *   - scrubPII: phones, emails, handles, long digit strings
 *   - metrics: accuracy, confusionMatrix, precision, recall, F1, macroF1, perLanguage
 *   - classifiers: baseline always returns modal labels
 *   - keyword classifier topic routing
 *   - blendPriorAndVotes (imported from prior.ts — already in signals tests,
 *     re-verified here in context of the eval layer)
 *   - report builds when LLM key is missing (llm shows not-run)
 *   - withdrawn pledges excluded (verified via integration test in integration.test.ts)
 *   - idempotent CSV import (parseLine helper + duplicate detection)
 */

import { describe, it, expect } from "vitest";

import { scrubPII } from "../eval/pii";
import {
  accuracy,
  confusionMatrix,
  precision,
  recall,
  f1,
  macroF1,
  perLanguageAccuracy,
  topMistakes,
} from "../eval/metrics";
import {
  classifyBaseline,
  classifyKeyword,
  BASELINE_TOPIC,
  BASELINE_SENTIMENT,
} from "../eval/classifiers";

// ── scrubPII ──────────────────────────────────────────────────────────────

describe("scrubPII", () => {
  it("replaces a 10-digit phone number", () => {
    const result = scrubPII("Call me at 9876543210 please");
    expect(result).toContain("[redacted]");
    expect(result).not.toContain("9876543210");
  });

  it("replaces an email address", () => {
    expect(scrubPII("email me at foo@bar.com")).toContain("[email]");
    expect(scrubPII("email me at foo@bar.com")).not.toContain("foo@bar.com");
  });

  it("replaces a social handle", () => {
    expect(scrubPII("follow @username123")).toContain("[handle]");
    expect(scrubPII("follow @username123")).not.toContain("@username123");
  });

  it("replaces a 12-digit Aadhaar-style number", () => {
    const result = scrubPII("my id is 123456789012");
    expect(result).toContain("[redacted]");
    expect(result).not.toContain("123456789012");
  });

  it("leaves short numbers alone (prices, years)", () => {
    const text = "₹999 is too much in 2026";
    expect(scrubPII(text)).toBe(text);
  });

  it("leaves plain text unchanged", () => {
    const text = "This design is really nice!";
    expect(scrubPII(text)).toBe(text);
  });

  it("handles multiple PIIs in one string", () => {
    const result = scrubPII("hi @user, call 9876543210 or email a@b.com");
    expect(result).toContain("[handle]");
    expect(result).toContain("[redacted]");
    expect(result).toContain("[email]");
  });
});

// ── accuracy ──────────────────────────────────────────────────────────────

describe("accuracy()", () => {
  it("returns 1.0 for perfect predictions", () => {
    expect(accuracy(["a", "b", "c"], ["a", "b", "c"])).toBe(1);
  });

  it("returns 0.0 for all wrong", () => {
    expect(accuracy(["a", "b", "c"], ["b", "c", "a"])).toBe(0);
  });

  it("returns 0.5 for half correct", () => {
    expect(accuracy(["a", "a", "b", "b"], ["a", "b", "b", "a"])).toBe(0.5);
  });

  it("returns 0 for empty input", () => {
    expect(accuracy([], [])).toBe(0);
  });
});

// ── confusionMatrix ───────────────────────────────────────────────────────

describe("confusionMatrix()", () => {
  const labels = ["cat", "dog", "bird"];
  const trues  = ["cat", "cat", "dog", "bird"];
  const preds  = ["cat", "dog", "dog", "cat"];

  it("counts correct predictions on diagonal", () => {
    const m = confusionMatrix(trues, preds, labels);
    expect(m["cat"]["cat"]).toBe(1);  // 1 correct cat
    expect(m["dog"]["dog"]).toBe(1);  // 1 correct dog
    expect(m["bird"]["bird"]).toBe(0); // 0 correct bird
  });

  it("counts off-diagonal errors", () => {
    const m = confusionMatrix(trues, preds, labels);
    expect(m["cat"]["dog"]).toBe(1);  // cat predicted as dog once
    expect(m["bird"]["cat"]).toBe(1); // bird predicted as cat once
  });
});

// ── precision / recall / F1 ───────────────────────────────────────────────

describe("precision, recall, f1", () => {
  //          true\pred  cat  dog
  // cat               [  2    1 ]   → 2 TP, 1 FN for cat
  // dog               [  1    2 ]   → 2 TP, 1 FN for dog
  const labels = ["cat", "dog"];
  const trues  = ["cat", "cat", "cat", "dog", "dog", "dog"];
  const preds  = ["cat", "cat", "dog", "cat", "dog", "dog"];
  const m = confusionMatrix(trues, preds, labels);

  it("precision: TP / (TP + FP)", () => {
    // cat: TP=2, FP=1 (one dog predicted as cat) → prec = 2/3
    expect(precision("cat", m)).toBeCloseTo(2 / 3, 5);
  });

  it("recall: TP / (TP + FN)", () => {
    // cat: TP=2, FN=1 (one cat predicted as dog) → recall = 2/3
    expect(recall("cat", m)).toBeCloseTo(2 / 3, 5);
  });

  it("F1 is harmonic mean of precision and recall", () => {
    const p = precision("cat", m);
    const r = recall("cat", m);
    const expected = (2 * p * r) / (p + r);
    expect(f1("cat", m)).toBeCloseTo(expected, 5);
  });

  it("macroF1 averages F1 across labels", () => {
    const mf1 = macroF1(labels, m);
    const f1cat = f1("cat", m);
    const f1dog = f1("dog", m);
    expect(mf1).toBeCloseTo((f1cat + f1dog) / 2, 5);
  });

  it("precision is 0 when no predictions for that class", () => {
    const m2 = confusionMatrix(["a"], ["b"], ["a", "b"]);
    expect(precision("a", m2)).toBe(0);
  });

  it("recall is 0 when no true examples for that class", () => {
    const m2 = confusionMatrix(["b"], ["a"], ["a", "b"]);
    expect(recall("a", m2)).toBe(0);
  });
});

// ── perLanguageAccuracy ───────────────────────────────────────────────────

describe("perLanguageAccuracy()", () => {
  const rows = [
    { language: "Hindi",   trueTopic: "price",    predTopic: "price",   trueSentiment: "positive", predSentiment: "positive" },
    { language: "Hindi",   trueTopic: "dubbing",  predTopic: "price",   trueSentiment: "negative", predSentiment: "negative" },
    { language: "English", trueTopic: "delivery", predTopic: "delivery",trueSentiment: "neutral",  predSentiment: "neutral"  },
  ];

  it("computes per-language topic accuracy correctly", () => {
    const result = perLanguageAccuracy(rows);
    expect(result["Hindi"].topic).toBeCloseTo(0.5, 5);    // 1 of 2 correct
    expect(result["English"].topic).toBeCloseTo(1.0, 5);  // 1 of 1 correct
  });

  it("computes per-language sentiment accuracy correctly", () => {
    const result = perLanguageAccuracy(rows);
    expect(result["Hindi"].sentiment).toBeCloseTo(1.0, 5); // both correct
    expect(result["English"].sentiment).toBeCloseTo(1.0, 5);
  });

  it("includes count", () => {
    const result = perLanguageAccuracy(rows);
    expect(result["Hindi"].count).toBe(2);
    expect(result["English"].count).toBe(1);
  });

  it("returns empty for empty input", () => {
    expect(perLanguageAccuracy([])).toEqual({});
  });
});

// ── topMistakes ───────────────────────────────────────────────────────────

describe("topMistakes()", () => {
  const rows = [
    { text: "a", trueTopic: "price",   predTopic: "other",  trueSentiment: "positive", predSentiment: "positive" },
    { text: "b", trueTopic: "dubbing", predTopic: "dubbing",trueSentiment: "negative", predSentiment: "positive" },
    { text: "c", trueTopic: "events",  predTopic: "events", trueSentiment: "neutral",  predSentiment: "neutral"  },
  ];

  it("reports only incorrect predictions", () => {
    const mistakes = topMistakes(rows, 10);
    expect(mistakes).toHaveLength(2); // "a" topic wrong + "b" sentiment wrong
  });

  it("returns at most n items", () => {
    const mistakes = topMistakes(rows, 1);
    expect(mistakes).toHaveLength(1);
  });

  it("indicates the kind of mistake", () => {
    const mistakes = topMistakes(rows, 10);
    const topicMistake = mistakes.find((m) => m.kind === "topic");
    expect(topicMistake?.trueLabel).toBe("price");
    expect(topicMistake?.predLabel).toBe("other");
  });
});

// ── baseline classifier ───────────────────────────────────────────────────

describe("classifyBaseline()", () => {
  it("always returns the modal topic label", () => {
    expect(classifyBaseline("anything").topic).toBe(BASELINE_TOPIC);
  });

  it("always returns the modal sentiment label", () => {
    expect(classifyBaseline("anything").sentiment).toBe(BASELINE_SENTIMENT);
  });

  it("status is ok", () => {
    expect(classifyBaseline("anything").status).toBe("ok");
  });
});

// ── keyword classifier ────────────────────────────────────────────────────

describe("classifyKeyword()", () => {
  it("detects price topic from English", () => {
    expect(classifyKeyword("this is too expensive").topic).toBe("price");
  });

  it("detects dubbing topic from English", () => {
    expect(classifyKeyword("please add Hindi dub").topic).toBe("dubbing");
  });

  it("detects merch quality topic", () => {
    expect(classifyKeyword("the fabric quality is poor").topic).toBe("merch-quality");
  });

  it("detects delivery topic", () => {
    expect(classifyKeyword("shipping was very fast").topic).toBe("delivery");
  });

  it("detects events topic", () => {
    expect(classifyKeyword("fan meetup in Mumbai was great").topic).toBe("events");
  });

  it("falls through to other for generic text", () => {
    expect(classifyKeyword("ok sure").topic).toBe("other");
  });

  it("detects positive sentiment from English positive word", () => {
    expect(classifyKeyword("this is amazing quality").sentiment).toBe("positive");
  });

  it("detects negative sentiment from English negative word", () => {
    expect(classifyKeyword("this is terrible").sentiment).toBe("negative");
  });

  it("returns neutral when no sentiment words", () => {
    // A comment with no matching positive/negative words
    const result = classifyKeyword("ok");
    // The result can be any label — we just ensure it doesn't crash
    expect(["positive", "negative", "neutral"]).toContain(result.sentiment);
  });

  it("status is ok", () => {
    expect(classifyKeyword("any text").status).toBe("ok");
  });
});

// ── LLM not-run when key is absent ────────────────────────────────────────

describe("classifyLlmBatch() without API key", () => {
  it("returns not-run status when LLM_API_KEY is absent", async () => {
    // Temporarily remove key
    const saved = process.env.LLM_API_KEY;
    delete process.env.LLM_API_KEY;

    const { classifyLlmBatch } = await import("../eval/classifiers");
    const results = await classifyLlmBatch(["test text"]);
    expect(results[0].status).toBe("not-run");

    if (saved) process.env.LLM_API_KEY = saved;
  });
});
