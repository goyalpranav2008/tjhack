# FandomLoop India — Data and Model Evaluation

Honest answers for judges and reviewers. No marketing language.

---

## Where do you get the data?

| Source | What | How |
|---|---|---|
| **Fan pledges** | City, language, format, price band, optional comment | Fans submit via `POST /api/pledges`. Phone/device ID is HMAC-hashed before any storage — never stored raw. |
| **AniList** | Anime popularity, trending rank, genre, air status | GraphQL API — no key required. Cached 24 h in `.cache/anilist-<title>.json`. Only the fields we use are stored in `SignalSnapshot`. We do not mirror the database. |
| **Google Trends** | Regional interest index (0-100 per Indian state) | Manual CSV export from trends.google.com, placed in `data/trends/<slug>.csv`. We do not use any scraping or undocumented API. |
| **Labeled comments** | 85 rows: text + topic + sentiment + language | Synthetically generated for the demo. Marked `source=synthetic-demo`. Replace with real team-labeled comments before relying on metrics. |

All data is stored in a single SQLite file (`prisma/dev.db`) in development, or Postgres in production. Prisma ORM manages all access.

---

## Did you train a model?

**No.** There is no model training anywhere in this codebase.

The two "AI" components are:

1. **Keyword classifier** (`src/eval/classifiers.ts`, `src/ai/cluster.ts`) — pure rules: Unicode script detection + keyword matching. No training data used for fitting, no weights learned.
2. **LLM API call** (`src/ai/brief.ts`, `src/eval/classifiers.ts`) — optional calls to an OpenAI-compatible endpoint at temperature 0. The model runs on someone else's server; we just call it. No fine-tuning.

---

## Why an API and not training?

- **Data volume**: 370 demo pledges and 85 synthetic labeled comments are far too few to fine-tune a meaningful model.
- **Latency**: LLM inference via API is fast enough for the demo. A fine-tuned model would require GPU infrastructure.
- **Honesty**: We cannot claim model performance on real production data that does not yet exist. The keyword rules are transparent, auditable, and fast.
- **Privacy**: Sending fan comments to an external LLM API requires explicit consent. The keyword path works entirely offline.

---

## Where is the data stored?

All tables are in one Prisma-managed database:

| Table | Purpose | Sensitive? |
|---|---|---|
| `Pledge` | Fan pledges with pseudonymous ID | Pseudonymous only — no PII |
| `ConsentLog` | DPDPA consent records | Pseudonymous only |
| `SignalSnapshot` | AniList + Trends cached results | Public data |
| `LabeledComment` | Ground-truth for eval | PII-scrubbed text only |
| `EvalRun` | Evaluation run metrics | Aggregated metrics |
| `EvalPrediction` | Per-comment predictions | No PII |
| `ScanLog` | QR scan events | IP hash (HMAC), not raw IP |

The database file is **never committed to git** (`.gitignore` excludes `*.db`).

---

## How do you know it works?

We evaluate both classifiers on the labeled test set and report:

- **Accuracy** (fraction correct)
- **Macro-F1** (average F1 across all classes — penalises models that ignore rare classes)
- **Per-language accuracy** (separately for Hindi, Tamil, Telugu, Bengali, English, Hinglish)
- **Confusion matrix** (shows which classes are confused with which)
- **Top 10 wrong predictions** (concrete examples of failures)

The baseline classifier always predicts the modal label. Any real classifier must beat it to be useful.

### Reproduce the numbers

```bash
cd backend

# 1. Set up database and seed
cp .env.example .env
npm run db:push
npm run db:seed

# 2. Import the labeled comment set
npm run eval:import
#    → Parsed 85 rows, Created: 85, Skipped (already exists): 0

# 3. Run evaluation
npm run eval:run
#    → Prints per-method table + per-language accuracy + top mistakes

# 4. Full analysis report (CLI)
npm run analyze
#    → Prints data sources, quality counts, gate verdicts, limitations

# 5. Full analysis report (API)
#    Start server: npm run dev
#    GET http://localhost:4000/api/analysis/report   (add X-Studio-Key if set)

# 6. Frontend
#    Open http://localhost:5173/studio/analysis
```

### Re-run forced (clears today's cached run)

```bash
npm run eval:run -- --force
```

---

## What are the limits?

These limitations are also returned by the API in `report.limitations` and shown in the frontend analysis page.

1. **Synthetic labeled set** — metrics are computed on 85 synthetically generated comments, not real fan comments. They should be replaced with team-labeled real data before the metrics mean anything commercially.

2. **No real outcome data** — no campaigns have shipped yet, so there is no ground truth for "did the demand signal predict actual sales?". We cannot train or evaluate a demand forecasting model.

3. **LLM method depends on external API** — if `LLM_API_KEY` is not set, the LLM method shows "not-run" in evaluation. The keyword method always runs offline.

4. **AniList popularity is a proxy** — it measures public fandom engagement (follows/lists), not purchase intent in India specifically.

5. **Google Trends is manually refreshed** — there is no automatic refresh; data may be days old.

6. **Sentiment lexicon is small** — ~150 words across 6 languages. It under-performs on sarcasm, irony, and mixed-language (Hinglish) text.

7. **Keyword topic classifier is deterministic and brittle** — it cannot handle novel phrasings that don't match any keyword. The LLM method handles these better but costs API credits.

---

## How PII is protected

Before any comment is stored:

```
scrubPII(text)
  → replaces 10+ digit numbers with [redacted]   (phone numbers, Aadhaar-style IDs)
  → replaces email addresses     with [email]
  → replaces @handles            with [handle]
```

Fan identifiers are pseudonymised: `HMAC-SHA256(phone_or_device_id, SERVER_SECRET)` truncated to 24 hex chars. The raw identifier is never stored. Withdrawals (`POST /api/consent/withdraw`) remove the person from all counts and clear their comments.
