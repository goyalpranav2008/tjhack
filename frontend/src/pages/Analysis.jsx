import { useCallback, useEffect, useState } from "react"
import { motion } from "framer-motion"
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
} from "recharts"
import { AlertTriangle, Download, RefreshCw, Database, FlaskConical, BarChart2, ShieldAlert } from "lucide-react"
import { getAnalysisReport, runAnalysis, getStudioKey } from "../lib/api"
import { pct, num } from "../lib/format"

// ── helpers ────────────────────────────────────────────────────────────────

function SampleBadge() {
  return (
    <span className="ml-2 rounded-full border border-marigold/60 bg-marigold/10 px-2 py-0.5 text-xs font-medium text-marigold">
      Sample data
    </span>
  )
}

function SectionCard({ icon: Icon, title, children }) {
  return (
    <section className="rounded-2xl border border-ai-700/70 bg-ai-900 p-6">
      <h2 className="flex items-center gap-2 font-display text-xl font-bold">
        {Icon && <Icon size={18} aria-hidden="true" />}
        {title}
      </h2>
      <div className="mt-4">{children}</div>
    </section>
  )
}

function Spinner() {
  return (
    <div className="flex items-center gap-2 text-sm text-ai-300">
      <RefreshCw size={14} className="animate-spin" aria-hidden="true" />
      Loading…
    </div>
  )
}

function Err({ msg }) {
  return (
    <p className="flex items-center gap-2 text-sm text-vermilion">
      <AlertTriangle size={14} aria-hidden="true" /> {msg}
    </p>
  )
}

function pctFmt(v) {
  if (v == null) return "n/a"
  return `${(v * 100).toFixed(1)}%`
}

// ── Heatmap for confusion matrix ──────────────────────────────────────────

function ConfusionHeatmap({ matrix, labels, title }) {
  if (!matrix || !labels?.length) return <p className="text-sm text-ai-400">No data.</p>

  const maxVal = Math.max(...labels.flatMap((t) => labels.map((p) => matrix[t]?.[p] ?? 0)), 1)

  return (
    <div>
      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-ai-400">{title}</p>
      <div className="overflow-x-auto">
        <table className="text-xs" style={{ borderSpacing: "2px", borderCollapse: "separate" }}>
          <thead>
            <tr>
              <th className="px-2 py-1 text-right text-ai-400">true ↓ pred →</th>
              {labels.map((p) => (
                <th key={p} className="px-2 py-1 text-center text-ai-300">{p}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {labels.map((t) => (
              <tr key={t}>
                <td className="px-2 py-1 text-right text-ai-300">{t}</td>
                {labels.map((p) => {
                  const v = matrix[t]?.[p] ?? 0
                  const intensity = maxVal > 0 ? v / maxVal : 0
                  const bg = t === p
                    ? `rgba(70,199,154,${0.15 + intensity * 0.7})`   // diagonal = jade
                    : `rgba(240,98,77,${intensity * 0.7})`            // off-diag = vermilion
                  return (
                    <td
                      key={p}
                      style={{ background: bg }}
                      className="num w-12 rounded px-2 py-1.5 text-center font-medium"
                    >
                      {v}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── main page ──────────────────────────────────────────────────────────────

export default function Analysis() {
  const [report, setReport]   = useState(null)
  const [loading, setLoading] = useState(true)
  const [running, setRunning] = useState(false)
  const [error, setError]     = useState("")

  const fetchReport = useCallback(async () => {
    setLoading(true)
    setError("")
    try {
      const data = await getAnalysisReport()
      setReport(data)
    } catch (err) {
      setError(err.status === 401
        ? "Studio key required — enter it in the Console and come back."
        : err.message ?? "Could not load report.")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchReport() }, [fetchReport])

  const handleRun = async () => {
    setRunning(true)
    setError("")
    try {
      const data = await runAnalysis()
      setReport(data)
    } catch (err) {
      setError(err.message ?? "Run failed.")
    } finally {
      setRunning(false)
    }
  }

  const handleDownload = () => {
    if (!report) return
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement("a")
    a.href     = url
    a.download = `fandomloop-analysis-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const TOPIC_LABELS     = ["price","dubbing","merch-quality","delivery","events","other"]
  const SENTIMENT_LABELS = ["positive","negative","neutral"]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-extrabold">Data & model evaluation</h1>
          <p className="mt-1 text-ai-300">
            Honest answers to: where does the data live, did we train a model, and how do we measure how well the analysis works.
          </p>
          {report && (
            <p className="mt-1 text-xs text-ai-500">
              Report generated at {new Date(report.generatedAt).toLocaleString("en-IN")}
            </p>
          )}
        </div>
        <div className="flex gap-3">
          <button
            onClick={handleRun}
            disabled={running}
            className="inline-flex items-center gap-2 rounded-xl border border-sakura/60 bg-sakura/10 px-4 py-2 text-sm font-medium text-sakura hover:bg-sakura/20 disabled:opacity-50"
          >
            {running
              ? <><RefreshCw size={14} className="animate-spin" aria-hidden="true" />Running…</>
              : <><RefreshCw size={14} aria-hidden="true" />Run evaluation</>
            }
          </button>
          <button
            onClick={handleDownload}
            disabled={!report}
            className="inline-flex items-center gap-2 rounded-xl border border-ai-600 px-4 py-2 text-sm text-ai-300 hover:text-washi disabled:opacity-40"
          >
            <Download size={14} aria-hidden="true" />
            Download report (JSON)
          </button>
        </div>
      </div>

      {loading && <Spinner />}
      {error   && <Err msg={error} />}

      {report && (
        <>
          {/* ── Where our data lives ── */}
          <SectionCard icon={Database} title="Where our data lives">
            <p className="mb-4 text-sm text-ai-400">
              All data is stored in a single SQLite database (dev) or Postgres (production) using Prisma ORM.
              No data is sent to external services except AniList API requests (cached 24 h) and optional LLM API calls.
            </p>
            <div className="overflow-x-auto rounded-xl border border-ai-700/70">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead className="border-b border-ai-700/70 text-ai-300">
                  <tr>
                    <th className="px-4 py-3 font-medium">Source</th>
                    <th className="px-4 py-3 font-medium">Table</th>
                    <th className="px-4 py-3 text-right font-medium">Rows</th>
                    <th className="px-4 py-3 font-medium">Last fetched</th>
                    <th className="px-4 py-3 font-medium">Retention</th>
                  </tr>
                </thead>
                <tbody>
                  {report.dataSources.map((s) => (
                    <tr key={s.name} className="border-b border-ai-700/40 last:border-0">
                      <td className="px-4 py-3 font-medium">
                        {s.name}
                        {s.isSample && <SampleBadge />}
                      </td>
                      <td className="px-4 py-3 text-ai-300 font-mono text-xs">{s.table}</td>
                      <td className="num px-4 py-3 text-right">{num(s.rowsStored)}</td>
                      <td className="px-4 py-3 text-ai-400 text-xs">
                        {s.lastFetched ? new Date(s.lastFetched).toLocaleString("en-IN") : "—"}
                      </td>
                      <td className="px-4 py-3 text-xs text-ai-400 max-w-xs">{s.retentionNote}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </SectionCard>

          {/* ── How the analysis works ── */}
          <SectionCard icon={FlaskConical} title="How the analysis works">
            <div className="mb-5 rounded-xl border border-jade/30 bg-jade/5 px-5 py-4 text-sm font-medium text-jade">
              No model is trained. We use rules plus an API, evaluated on a labeled test set.
            </div>
            <ol className="space-y-3 text-sm">
              {[
                ["Collect",         "Fan pledges, comments, and public signals (AniList, Google Trends CSV) are stored in Prisma/SQLite.",  "Pledge · SignalSnapshot"],
                ["Scrub PII",       "Before storing, scrubPII() removes phone numbers (10+ digits), email addresses, and @handles.",         "pii.ts"],
                ["Classify",        "Comments are classified into 6 topic buckets and 3 sentiment labels using keyword rules (no model).",   "classifiers.ts · cluster.ts"],
                ["Score demand",    "Demand score per city = blend of fan vote share and public prior (AniList popularity + Trends).",       "prior.ts · signals/routes.ts"],
                ["Run gate",        "The margin gate evaluates economics: contribution, margin %, break-even vs cap.",                       "gate.ts"],
                ["Evaluate",        "Classifiers are evaluated against a labeled test set (eval:run). Metrics: accuracy, macro-F1.",        "metrics.ts · run.ts"],
              ].map(([step, desc, code]) => (
                <li key={step} className="flex gap-4">
                  <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 border-ai-600 text-xs font-bold text-ai-300">
                    {["Collect","Scrub PII","Classify","Score demand","Run gate","Evaluate"].indexOf(step) + 1}
                  </span>
                  <div>
                    <span className="font-bold">{step} — </span>
                    {desc}
                    <code className="ml-2 rounded bg-ai-800 px-1.5 py-0.5 text-xs text-ai-300">{code}</code>
                  </div>
                </li>
              ))}
            </ol>
          </SectionCard>

          {/* ── Data quality ── */}
          <SectionCard icon={Database} title="Data quality">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                { label: "Missing comments",    value: report.dataQuality.missingComments },
                { label: "Prices outside bands",value: report.dataQuality.pricesOutsideBands },
                { label: "Withdrawn excluded",  value: report.dataQuality.withdrawnExcluded },
                { label: "Comments scrubbed",   value: report.dataQuality.commentsScrubbed },
              ].map(({ label, value }) => (
                <div key={label} className="rounded-xl border border-ai-700/70 bg-ai-800 p-3">
                  <p className="text-xs text-ai-300">{label}</p>
                  <p className="num mt-0.5 text-2xl font-bold">{num(value)}</p>
                </div>
              ))}
            </div>
          </SectionCard>

          {/* ── Model evaluation ── */}
          <SectionCard icon={BarChart2} title="Model evaluation">
            <p className="mb-4 text-sm text-ai-400">
              All methods evaluated on the same {report.nlp.latestRunPerMethod[0]?.datasetSize ?? "—"}-comment labeled set.
              {report.nlp.latestRunPerMethod.some((m) => m.notes?.includes("synthetic")) && (
                <> <SampleBadge /> Labeled set is synthetic — replace with real labels for meaningful metrics.</>
              )}
            </p>

            {/* Comparison table */}
            {report.nlp.latestRunPerMethod.length > 0 ? (
              <div className="overflow-x-auto rounded-xl border border-ai-700/70">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-ai-700/70 text-ai-300">
                    <tr>
                      <th className="px-4 py-3 font-medium">Method</th>
                      <th className="px-4 py-3 text-right font-medium">Topic acc</th>
                      <th className="px-4 py-3 text-right font-medium">Topic macro-F1</th>
                      <th className="px-4 py-3 text-right font-medium">Sentiment acc</th>
                      <th className="px-4 py-3 text-right font-medium">Sentiment macro-F1</th>
                      <th className="px-4 py-3 font-medium">Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {["baseline","keyword","llm"].map((method) => {
                      const row = report.nlp.latestRunPerMethod.find((r) => r.method === method)
                      const isBest = report.nlp.bestMethod === method
                      return (
                        <tr key={method} className={`border-b border-ai-700/40 last:border-0 ${isBest ? "bg-jade/5" : ""}`}>
                          <td className="px-4 py-3 font-medium">
                            {method}
                            {isBest && <span className="ml-2 rounded-full bg-jade/20 px-2 py-0.5 text-xs text-jade">best</span>}
                          </td>
                          <td className="num px-4 py-3 text-right">{row ? pctFmt(row.accuracyTopic) : "—"}</td>
                          <td className="num px-4 py-3 text-right">{row ? pctFmt(row.macroF1Topic) : "—"}</td>
                          <td className="num px-4 py-3 text-right">{row ? pctFmt(row.accuracySentiment) : "—"}</td>
                          <td className="num px-4 py-3 text-right">{row ? pctFmt(row.macroF1Sentiment) : "—"}</td>
                          <td className="px-4 py-3 text-xs text-ai-400">
                            {row?.notes ?? (row ? "ok" : "not run")}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-sm text-ai-400">No eval runs yet. Click "Run evaluation" above.</p>
            )}

            {/* Per-language accuracy bar chart */}
            {(() => {
              const kwRun = report.nlp.latestRunPerMethod.find((r) => r.method === "keyword")
              const langs = kwRun ? Object.entries(kwRun.perLanguage).map(([lang, v]) => ({
                lang,
                topic:     parseFloat((v.topic * 100).toFixed(1)),
                sentiment: parseFloat((v.sentiment * 100).toFixed(1)),
                count:     v.count,
              })) : []

              return langs.length > 0 ? (
                <div className="mt-6">
                  <p className="mb-3 text-sm font-medium text-ai-300">Per-language topic accuracy (keyword method)</p>
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={langs} margin={{ left: 0 }}>
                      <XAxis dataKey="lang" tick={{ fill: "#7d86a0", fontSize: 12 }} />
                      <YAxis domain={[0,100]} tick={{ fill: "#7d86a0", fontSize: 12 }} tickFormatter={(v) => `${v}%`} />
                      <Tooltip
                        contentStyle={{ background: "#141b2d", border: "1px solid #2a3350", borderRadius: 8, fontSize: 12 }}
                        formatter={(v, name) => [`${v}%`, name]}
                      />
                      <Bar dataKey="topic" name="Topic acc" radius={[4,4,0,0]}>
                        {langs.map((_, i) => (
                          <Cell key={i} fill="#46c79a" />
                        ))}
                      </Bar>
                      <Bar dataKey="sentiment" name="Sentiment acc" radius={[4,4,0,0]}>
                        {langs.map((_, i) => (
                          <Cell key={i} fill="#e88ba0" />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                  <p className="mt-1 text-xs text-ai-500">Green = topic, pink = sentiment</p>
                </div>
              ) : null
            })()}

            {/* Confusion matrices */}
            {(() => {
              const kwRun = report.nlp.latestRunPerMethod.find((r) => r.method === "keyword")
              return kwRun ? (
                <div className="mt-6 grid gap-6 lg:grid-cols-2">
                  <ConfusionHeatmap
                    matrix={kwRun.confusionTopic}
                    labels={TOPIC_LABELS}
                    title="Topic confusion (keyword)"
                  />
                  <ConfusionHeatmap
                    matrix={kwRun.confusionSentiment}
                    labels={SENTIMENT_LABELS}
                    title="Sentiment confusion (keyword)"
                  />
                </div>
              ) : null
            })()}

            {/* Top 10 wrong predictions */}
            {(() => {
              const kwRun = report.nlp.latestRunPerMethod.find((r) => r.method === "keyword")
              const mistakes = kwRun?.topMistakes ?? []
              return mistakes.length > 0 ? (
                <div className="mt-6">
                  <p className="mb-3 text-sm font-medium text-ai-300">Top {mistakes.length} wrong predictions</p>
                  <div className="space-y-2">
                    {mistakes.map((m, i) => (
                      <div key={i} className="rounded-xl border border-ai-700/60 bg-ai-800 px-4 py-3 text-sm">
                        <div className="flex flex-wrap gap-x-4 gap-y-1">
                          <span className="rounded bg-ai-700 px-1.5 text-xs">{m.kind}</span>
                          <span className="text-jade">true: <span className="font-bold">{m.trueLabel}</span></span>
                          <span className="text-vermilion">predicted: <span className="font-bold">{m.predLabel}</span></span>
                        </div>
                        <p className="mt-1 text-ai-300 italic">"{m.text.slice(0, 120)}"</p>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null
            })()}
          </SectionCard>

          {/* ── Results on our data ── */}
          <SectionCard icon={BarChart2} title="Results on our data">
            {/* Gate verdicts */}
            <div className="mb-6">
              <p className="mb-3 text-sm font-medium text-ai-300">Gate verdicts</p>
              <div className="overflow-x-auto rounded-xl border border-ai-700/70">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-ai-700/70 text-ai-300">
                    <tr>
                      <th className="px-4 py-2 font-medium">Campaign</th>
                      <th className="px-4 py-2 font-medium">Verdict</th>
                      <th className="px-4 py-2 text-right font-medium">Contribution</th>
                      <th className="px-4 py-2 text-right font-medium">Margin</th>
                      <th className="px-4 py-2 text-right font-medium">Break-even</th>
                      <th className="px-4 py-2 font-medium">Reasons</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.gate.map((g) => (
                      <tr key={g.campaignSlug} className="border-b border-ai-700/40 last:border-0">
                        <td className="px-4 py-2 font-medium">{g.campaignSlug}</td>
                        <td className="px-4 py-2">
                          <span className={`rounded-md border px-2 py-0.5 text-xs font-bold ${
                            g.status === "GO"   ? "border-jade/60 text-jade" :
                            g.status === "STOP" ? "border-vermilion/60 text-vermilion" :
                            "border-marigold/60 text-marigold"
                          }`}>{g.status}</span>
                        </td>
                        <td className="num px-4 py-2 text-right">₹{num(g.contribution)}</td>
                        <td className="num px-4 py-2 text-right">{pctFmt(g.marginPct)}</td>
                        <td className="num px-4 py-2 text-right">{g.breakEvenOrders ?? "—"}</td>
                        <td className="px-4 py-2 text-xs text-ai-400">{g.reasons.join(", ") || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Demand by city (first campaign) */}
            {report.demand[0] && (() => {
              const camp = report.demand[0]
              const chartData = camp.perCity
                .filter((c) => c.optIns > 0)
                .map((c) => ({
                  city:    c.city.replace(" NCR","").replace("Other city","Other"),
                  optIns:  c.optIns,
                  committed: c.committed,
                  prior:   c.prior ?? 0,
                  blended: c.blended ?? 0,
                }))
                .sort((a, b) => b.blended - a.blended)

              return chartData.length > 0 ? (
                <div>
                  <p className="mb-3 text-sm font-medium text-ai-300">
                    Demand by city — {camp.campaignTitle} (prior vs fan votes vs blended)
                  </p>
                  <ResponsiveContainer width="100%" height={260}>
                    <BarChart data={chartData} layout="vertical" margin={{ left: 16 }}>
                      <XAxis type="number" domain={[0, 100]} tick={{ fill: "#7d86a0", fontSize: 11 }} />
                      <YAxis type="category" dataKey="city" width={90} tick={{ fill: "#7d86a0", fontSize: 11 }} />
                      <Tooltip
                        contentStyle={{ background: "#141b2d", border: "1px solid #2a3350", borderRadius: 8, fontSize: 12 }}
                        formatter={(v, name) => [`${v}`, name]}
                      />
                      <Bar dataKey="prior"   name="Prior"   fill="#7f90c4" radius={[0,3,3,0]} />
                      <Bar dataKey="blended" name="Blended" fill="#46c79a" radius={[0,3,3,0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : <p className="text-sm text-ai-400">No pledge data yet for this campaign.</p>
            })()}
          </SectionCard>

          {/* ── Limitations ── */}
          <SectionCard icon={ShieldAlert} title="Limitations">
            <ul className="space-y-3">
              {report.limitations.map((l, i) => (
                <motion.li
                  key={i}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.05 }}
                  className="flex items-start gap-3 rounded-xl border border-marigold/30 bg-marigold/5 px-4 py-3 text-sm"
                >
                  <AlertTriangle size={15} className="mt-0.5 shrink-0 text-marigold" aria-hidden="true" />
                  {l}
                </motion.li>
              ))}
            </ul>
          </SectionCard>
        </>
      )}
    </div>
  )
}
