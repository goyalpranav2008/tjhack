import { useCallback, useEffect, useRef, useState } from "react"
import { Link } from "react-router-dom"
import { motion, AnimatePresence } from "framer-motion"
import { AlertTriangle, Key, RefreshCw, RotateCcw, Sparkles, WifiOff } from "lucide-react"
import {
  getCampaigns,
  getCampaignSegments,
  getCampaignSources,
  getCampaignScans,
  getCampaignPrior,
  evaluateGate,
  settleCampaign,
  healthCheck,
  getCampaignInsights,
  getCampaignBrief,
  getStudioKey,
  setStudioKey,
} from "../lib/api"
import { inr, num, pct } from "../lib/format"
import { VERDICT_COLORS } from "../lib/theme"
import VerdictStamp from "../components/VerdictStamp"
import Slider from "../components/Slider"
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
} from "recharts"

// ── helpers ────────────────────────────────────────────────────────────────

function useDebounce(value, ms) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), ms)
    return () => clearTimeout(id)
  }, [value, ms])
  return debounced
}

// ── sub-components ─────────────────────────────────────────────────────────

function OfflineBanner({ onRetry }) {
  return (
    <div
      role="alert"
      className="mb-6 flex items-center gap-3 rounded-2xl border border-vermilion/40 bg-vermilion/10 px-5 py-4"
    >
      <WifiOff size={20} className="shrink-0 text-vermilion" aria-hidden="true" />
      <p className="flex-1 text-sm text-vermilion">Backend offline — showing cached data only.</p>
      <button
        onClick={onRetry}
        className="inline-flex items-center gap-1.5 rounded-lg border border-vermilion/50 px-3 py-1.5 text-sm text-vermilion hover:bg-vermilion/10"
      >
        <RefreshCw size={13} aria-hidden="true" />
        Retry
      </button>
    </div>
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

function SectionError({ message }) {
  return (
    <p className="mt-2 flex items-center gap-2 text-sm text-vermilion">
      <AlertTriangle size={14} aria-hidden="true" />
      {message}
    </p>
  )
}

function StatCard({ label, value, sub, highlight }) {
  return (
    <div className={`rounded-xl border p-3 ${highlight ? "border-sakura/40 bg-sakura/5" : "border-ai-700/70 bg-ai-800"}`}>
      <p className="text-xs text-ai-300">{label}</p>
      <p className={`num mt-0.5 text-2xl font-bold leading-none ${highlight ? "text-sakura" : ""}`}>{value}</p>
      {sub && <p className="mt-1 text-xs text-ai-300">{sub}</p>}
    </div>
  )
}

function CheckRow({ label, ok }) {
  return (
    <li className="flex items-center gap-2 text-sm">
      <span className={`h-4 w-4 shrink-0 rounded-full ${ok ? "bg-jade" : "bg-vermilion"}`} aria-hidden="true" />
      <span className={ok ? "" : "text-ai-400"}>{label}</span>
    </li>
  )
}

// ── default slider values for gate evaluation ──────────────────────────────
const GATE_DEFAULTS = {
  price: 799,
  royaltyPct: 0.15,
  productionCost: 360,
  thresholdPct: 0.20,
  platformFeePct: 0.05,
}

const PRICE_PRESETS = [
  { label: "₹499", price: 499, note: "STOP" },
  { label: "₹799", price: 799, note: "ADAPT" },
  { label: "₹999", price: 999, note: "GO" },
]

// ── main component ─────────────────────────────────────────────────────────

export default function Console() {
  const [offline, setOffline] = useState(false)
  const [studioKeyInput, setStudioKeyInput] = useState(() => getStudioKey())
  const [keyVisible, setKeyVisible] = useState(false)
  const [keySaved, setKeySaved] = useState(() => Boolean(getStudioKey()))
  const [authError, setAuthError] = useState("")

  const [campaigns, setCampaigns] = useState([])
  const [campaignsLoading, setCampaignsLoading] = useState(true)
  const [campaignsError, setCampaignsError] = useState("")
  const [selectedSlug, setSelectedSlug] = useState(null)

  const [segments, setSegments] = useState([])
  const [segmentsLoading, setSegmentsLoading] = useState(false)
  const [segmentsError, setSegmentsError] = useState("")

  const [sources, setSources] = useState([])
  const [sourcesLoading, setSourcesLoading] = useState(false)

  const [scans, setScans] = useState(null)
  const [scansLoading, setScansLoading] = useState(false)

  const [sliders, setSliders] = useState(GATE_DEFAULTS)
  const debouncedSliders = useDebounce(sliders, 250)
  const [gateResult, setGateResult] = useState(null)
  const [gateLoading, setGateLoading] = useState(false)
  const [gateError, setGateError] = useState("")

  const [settleLoading, setSettleLoading] = useState(false)
  const [settleResult, setSettleResult] = useState(null)
  const [settleError, setSettleError] = useState("")

  const [insights, setInsights] = useState(null)
  const [insightsLoading, setInsightsLoading] = useState(false)
  const [insightsError, setInsightsError] = useState("")
  const [brief, setBrief] = useState(null)
  const [briefLoading, setBriefLoading] = useState(false)
  const [briefError, setBriefError] = useState("")

  const [prior, setPrior] = useState(null)
  const [priorLoading, setPriorLoading] = useState(false)
  const [priorError, setPriorError] = useState("")

  // ── fetch campaigns ────────────────────────────────────────────────────────
  const fetchCampaigns = useCallback(async () => {
    setCampaignsLoading(true)
    setCampaignsError("")
    try {
      await healthCheck()
      setOffline(false)
      const data = await getCampaigns()
      setCampaigns(data)
      if (data.length && !selectedSlug) setSelectedSlug(data[0].slug)
    } catch {
      setCampaignsError("Could not load campaigns.")
      setOffline(true)
    } finally {
      setCampaignsLoading(false)
    }
  }, [selectedSlug])

  useEffect(() => { fetchCampaigns() }, [fetchCampaigns])

  // ── fetch segments, sources, scans when selection changes ────────────────
  useEffect(() => {
    if (!selectedSlug) return
    let cancelled = false

    setSegmentsLoading(true)
    setSegmentsError("")
    setSegments([])
    getCampaignSegments(selectedSlug)
      .then(({ segments: s }) => { if (!cancelled) setSegments(s) })
      .catch(() => { if (!cancelled) setSegmentsError("Could not load segments.") })
      .finally(() => { if (!cancelled) setSegmentsLoading(false) })

    setSourcesLoading(true)
    getSources(selectedSlug, cancelled, setSources, setSourcesLoading)

    setScansLoading(true)
    getScans(selectedSlug, cancelled, setScans, setScansLoading)

    setPriorLoading(true)
    getPrior(selectedSlug, cancelled, setPrior, setPriorError, setPriorLoading)

    return () => { cancelled = true }
  }, [selectedSlug])

  async function getSources(slug, cancelled, set, setLoading) {
    try {
      const data = await getCampaignSources(slug)
      if (!cancelled) set(data)
    } catch {
      if (!cancelled) set([])
    } finally {
      if (!cancelled) setLoading(false)
    }
  }

  async function getScans(slug, cancelled, set, setLoading) {
    try {
      const data = await getCampaignScans(slug)
      if (!cancelled) set(data)
    } catch {
      if (!cancelled) set(null)
    } finally {
      if (!cancelled) setLoading(false)
    }
  }

  async function getPrior(slug, cancelled, set, setError, setLoading) {
    try {
      const data = await getCampaignPrior(slug)
      if (!cancelled) set(data)
    } catch (err) {
      if (!cancelled) {
        set(null)
        setError(err?.message ?? "Could not load prior data.")
      }
    } finally {
      if (!cancelled) setLoading(false)
    }
  }

  // ── run gate evaluation on slider change ─────────────────────────────────
  const selectedCampaign = campaigns.find((c) => c.slug === selectedSlug)

  useEffect(() => {
    if (!selectedCampaign) return
    let cancelled = false
    setGateLoading(true)
    setGateError("")
    evaluateGate({
      campaignId: selectedCampaign.id,
      price: debouncedSliders.price,
      format: selectedCampaign.format,
      orders: selectedCampaign.committedCount ?? 0,
      royaltyPct: debouncedSliders.royaltyPct,
      productionCost: debouncedSliders.productionCost,
      thresholdPct: debouncedSliders.thresholdPct,
      platformFeePct: debouncedSliders.platformFeePct,
    })
      .then((r) => { if (!cancelled) setGateResult(r) })
      .catch(() => { if (!cancelled) setGateError("Gate evaluation failed.") })
      .finally(() => { if (!cancelled) setGateLoading(false) })
    return () => { cancelled = true }
  }, [debouncedSliders, selectedCampaign])

  // re-sync sliders when campaign changes
  useEffect(() => {
    if (!selectedCampaign) return
    setSliders({
      price: selectedCampaign.listPrice,
      royaltyPct: selectedCampaign.marginGate?.royaltyPct ?? 0.15,
      productionCost: selectedCampaign.marginGate?.productionCost ?? 360,
      thresholdPct: selectedCampaign.marginGate?.thresholdPct ?? 0.20,
      platformFeePct: selectedCampaign.marginGate?.platformFeePct ?? 0.05,
    })
    setGateResult(null)
    setSettleResult(null)
    setSettleError("")
  }, [selectedSlug])

  const set = (patch) => setSliders((prev) => ({ ...prev, ...patch }))
  const resetSliders = () => {
    if (!selectedCampaign) return
    setSliders({
      price: selectedCampaign.listPrice,
      royaltyPct: selectedCampaign.marginGate?.royaltyPct ?? 0.15,
      productionCost: selectedCampaign.marginGate?.productionCost ?? 360,
      thresholdPct: selectedCampaign.marginGate?.thresholdPct ?? 0.20,
      platformFeePct: selectedCampaign.marginGate?.platformFeePct ?? 0.05,
    })
  }

  // ── settle ────────────────────────────────────────────────────────────────
  const handleSettle = async () => {
    if (!selectedSlug) return
    setSettleLoading(true)
    setSettleError("")
    setSettleResult(null)
    setAuthError("")
    try {
      const r = await settleCampaign(selectedSlug)
      setSettleResult(r)
      await fetchCampaigns()
    } catch (err) {
      if (err.status === 401) {
        setAuthError("Studio key required or incorrect. Enter your STUDIO_API_KEY above.")
      } else {
        setSettleError(err.message ?? "Settle failed.")
      }
    } finally {
      setSettleLoading(false)
    }
  }

  // ── AI handlers ──────────────────────────────────────────────────────────
  const fetchInsights = useCallback(async () => {
    if (!selectedSlug) return
    setInsightsLoading(true)
    setInsightsError("")
    try { setInsights(await getCampaignInsights(selectedSlug)) }
    catch (err) { setInsightsError(err.message ?? "Could not load insights.") }
    finally { setInsightsLoading(false) }
  }, [selectedSlug])

  const fetchBrief = useCallback(async () => {
    if (!selectedSlug) return
    setBriefLoading(true)
    setBriefError("")
    try { setBrief(await getCampaignBrief(selectedSlug)) }
    catch (err) { setBriefError(err.message ?? "Could not generate brief.") }
    finally { setBriefLoading(false) }
  }, [selectedSlug])

  useEffect(() => {
    setInsights(null)
    setBrief(null)
    setInsightsError("")
    setBriefError("")
    setPrior(null)
    setPriorError("")
  }, [selectedSlug])

  // ── headline counts from live campaigns ───────────────────────────────────
  const counts = campaigns.reduce(
    (acc, c) => {
      const v = c.gateVerdict?.status
      if (v && acc[v] !== undefined) acc[v]++
      return acc
    },
    { GO: 0, ADAPT: 0, STOP: 0 }
  )

  const totalOptIns = campaigns.reduce((s, c) => s + (c.optInCount ?? 0), 0)

  // ── gate checks helper ────────────────────────────────────────────────────
  const gateChecks = gateResult ? [
    {
      label: "Rights cleared",
      ok: !gateResult.reasons?.includes("rights_not_cleared"),
    },
    {
      label: `Margin above gate (${pct(gateResult.gatePct)})`,
      ok: !gateResult.reasons?.includes("margin_below_gate"),
    },
    {
      label: `Minimum run met (${num(selectedCampaign?.minRun ?? 0)})`,
      ok: !gateResult.reasons?.includes("orders_below_min_run"),
    },
    {
      label: `Break-even within cap (${num(selectedCampaign?.orderCap ?? 0)})`,
      ok: !gateResult.reasons?.includes("break_even_exceeds_cap"),
    },
  ] : []

  // ── render ────────────────────────────────────────────────────────────────
  return (
    <div>
      {/* Studio key input */}
      <div className="mb-5 rounded-2xl border border-ai-700/50 bg-ai-900 px-4 py-3">
        <div className="flex items-center gap-3">
          <Key size={16} className="shrink-0 text-ai-300" aria-hidden="true" />
          <label htmlFor="studio-key" className="text-sm text-ai-300 shrink-0">Studio key</label>
          <input
            id="studio-key"
            type={keyVisible ? "text" : "password"}
            value={studioKeyInput}
            onChange={(e) => {
              setStudioKeyInput(e.target.value)
              setKeySaved(false)
              setAuthError("")
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                setStudioKey(studioKeyInput)
                setKeySaved(true)
                setAuthError("")
              }
            }}
            placeholder="Leave empty if STUDIO_API_KEY is not set"
            autoComplete="off"
            className="min-w-0 flex-1 rounded-lg border border-ai-700 bg-ai-800 px-3 py-1.5 text-sm text-washi placeholder:text-ai-500 focus:outline-none focus:border-sakura/60"
          />
          <button
            type="button"
            onClick={() => {
              setStudioKey(studioKeyInput)
              setKeySaved(true)
              setAuthError("")
            }}
            className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
              keySaved
                ? "border-jade/60 bg-jade/10 text-jade"
                : "border-ai-600 text-ai-300 hover:text-washi"
            }`}
          >
            {keySaved ? "Saved ✓" : "Save"}
          </button>
          <button type="button" onClick={() => setKeyVisible((v) => !v)} className="text-xs text-ai-400 hover:text-washi">
            {keyVisible ? "Hide" : "Show"}
          </button>
        </div>
        {authError && (
          <div role="alert" className="mt-2 flex items-center gap-2 text-sm text-vermilion">
            <AlertTriangle size={14} aria-hidden="true" />
            {authError}
          </div>
        )}
      </div>

      {offline && <OfflineBanner onRetry={fetchCampaigns} />}

      {/* Header */}
      <section className="grid gap-8 lg:grid-cols-[1fr_auto] lg:items-end">
        <div>
          <h1 className="font-display text-4xl font-extrabold leading-tight sm:text-5xl">
            Where should we launch next?
          </h1>
          <p className="mt-3 max-w-2xl text-lg text-ai-300">
            Monsoon Samurai — {num(totalOptIns)} total opt-ins across {campaigns.length} campaign
            {campaigns.length !== 1 ? "s" : ""}. Gate verdicts update live as you move the sliders.
          </p>
        </div>
        {/* Verdict summary from live campaigns */}
        <div className="flex gap-10" role="group" aria-label="Verdict totals">
          {["GO", "ADAPT", "STOP"].map((v) => (
            <div key={v} className="flex flex-col items-start gap-2">
              <VerdictStamp verdict={v} />
              <motion.span
                key={`${v}-${counts[v]}`}
                initial={{ y: 8, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                className="num font-display text-5xl font-extrabold leading-none"
              >
                {campaignsLoading ? "—" : counts[v]}
              </motion.span>
              <span className="text-sm text-ai-300">campaigns</span>
            </div>
          ))}
        </div>
      </section>

      {/* Main grid */}
      <div className="mt-8 grid gap-6 lg:grid-cols-[320px_1fr] lg:items-start">

        {/* ── Left sidebar ── */}
        <aside className="space-y-5 lg:sticky lg:top-6">

          {/* Campaign selector */}
          <div className="rounded-2xl border border-ai-700/70 bg-ai-900 p-5">
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-display text-xl font-bold">Campaign</h2>
              <button
                onClick={fetchCampaigns}
                disabled={campaignsLoading}
                aria-label="Refresh campaigns"
                className="inline-flex items-center gap-1.5 rounded-lg border border-ai-700 px-3 py-1.5 text-sm text-ai-300 hover:text-washi disabled:opacity-50"
              >
                <RefreshCw size={13} className={campaignsLoading ? "animate-spin" : ""} aria-hidden="true" />
                Refresh
              </button>
            </div>

            {campaignsLoading && <div className="mt-3"><Spinner /></div>}
            {campaignsError && <SectionError message={campaignsError} />}

            {!campaignsLoading && campaigns.length > 0 && (
              <div className="mt-3 space-y-1.5">
                {campaigns.map((c) => {
                  const on = c.slug === selectedSlug
                  return (
                    <button
                      key={c.slug}
                      onClick={() => setSelectedSlug(c.slug)}
                      className={`w-full rounded-xl border px-3 py-2.5 text-left text-sm transition-colors ${
                        on
                          ? "border-sakura/60 bg-sakura/10 text-washi"
                          : "border-ai-700/60 text-ai-300 hover:border-ai-600 hover:text-washi"
                      }`}
                    >
                      <span className="block font-medium">{c.title}</span>
                      <span className="flex items-center justify-between gap-2 text-xs opacity-70">
                        <span>{c.format} · {inr(c.listPrice)}</span>
                        <span>{num(c.committedCount ?? 0)} committed · {num(c.optInCount ?? 0)} opt-ins</span>
                      </span>
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          {/* Gate sliders */}
          {selectedCampaign && (
            <div className="rounded-2xl border border-ai-700/70 bg-ai-900 p-5">
              <div className="flex items-center justify-between gap-3">
                <h2 className="font-display text-xl font-bold">Gate inputs</h2>
                <button
                  onClick={resetSliders}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-ai-700 px-3 py-1.5 text-sm text-ai-300 hover:text-washi"
                >
                  <RotateCcw size={13} aria-hidden="true" />
                  Reset
                </button>
              </div>

              {/* Price presets */}
              <div className="mt-4">
                <p className="mb-2 text-xs font-medium text-ai-300 uppercase tracking-wide">Price test</p>
                <div className="flex gap-2">
                  {PRICE_PRESETS.map(({ label, price, note }) => (
                    <button
                      key={price}
                      onClick={() => set({ price })}
                      className={`flex-1 rounded-lg border px-2 py-1.5 text-center text-xs font-medium transition-colors ${
                        sliders.price === price
                          ? "border-sakura/60 bg-sakura/10 text-sakura"
                          : "border-ai-700 text-ai-300 hover:border-ai-600 hover:text-washi"
                      }`}
                    >
                      <span className="block">{label}</span>
                      <span className="block opacity-60">{note}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="mt-5 space-y-5">
                <Slider id="price" label="Price" value={sliders.price} min={99} max={2999} step={50}
                  onChange={(v) => set({ price: v })} display={inr(sliders.price)}
                  hint="Retail price per unit." />
                <Slider id="royalty" label="Royalty" value={sliders.royaltyPct} min={0.05} max={0.5}
                  onChange={(v) => set({ royaltyPct: v })} display={pct(sliders.royaltyPct)}
                  hint="Share paid to the rights holder." />
                <Slider id="production" label="Production cost" value={sliders.productionCost} min={0} max={1000} step={10}
                  onChange={(v) => set({ productionCost: v })} display={inr(sliders.productionCost)}
                  hint="Cost to make one unit." />
                <Slider id="platform" label="Platform fee" value={sliders.platformFeePct} min={0} max={0.2}
                  onChange={(v) => set({ platformFeePct: v })} display={pct(sliders.platformFeePct)}
                  hint="FandomLoop platform commission." />
                <Slider id="gate" label="Margin gate" value={sliders.thresholdPct} min={0.05} max={0.5}
                  onChange={(v) => set({ thresholdPct: v })} display={pct(sliders.thresholdPct)}
                  hint="Lowest margin the studio will accept." />
              </div>
            </div>
          )}
        </aside>

        {/* ── Right panel ── */}
        <div className="space-y-6">

          {/* Gate result */}
          {selectedCampaign && (
            <section className="rounded-2xl border border-ai-700/70 bg-ai-900 p-5">
              <div className="flex items-center justify-between gap-4">
                <h2 className="font-display text-2xl font-bold">Gate result</h2>
                {gateLoading && <Spinner />}
              </div>
              {gateError && <SectionError message={gateError} />}

              {gateResult && !gateLoading && (
                <div className="mt-4 space-y-5">
                  {/* Status stamp */}
                  <div className="flex items-start gap-4 flex-wrap">
                    <VerdictStamp verdict={gateResult.status} size="lg" />
                    {/* Three checks */}
                    {gateChecks.length > 0 && (
                      <ul className="space-y-1.5">
                        {gateChecks.map((c) => (
                          <CheckRow key={c.label} label={c.label} ok={c.ok} />
                        ))}
                      </ul>
                    )}
                  </div>

                  {/* Key numbers */}
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <StatCard
                      label="Contribution / order"
                      value={inr(gateResult.contribution)}
                      highlight={gateResult.contribution > 0}
                    />
                    <StatCard
                      label="Margin"
                      value={pct(gateResult.marginPct)}
                      sub={`gate: ${pct(gateResult.gatePct)}`}
                      highlight={gateResult.marginPct >= gateResult.gatePct}
                    />
                    <StatCard
                      label="Break-even orders"
                      value={gateResult.breakEvenOrders != null ? num(gateResult.breakEvenOrders) : "—"}
                      sub={`committed: ${num(selectedCampaign.committedCount ?? 0)}`}
                    />
                    <StatCard
                      label="Progress (committed)"
                      value={`${selectedCampaign.progressPct}%`}
                      sub={`${num(selectedCampaign.committedCount ?? 0)} / ${num(selectedCampaign.minRun)}`}
                    />
                  </div>

                  {/* Cost breakdown */}
                  {gateResult.breakdown && (
                    <div className="rounded-xl border border-ai-700/70 bg-ai-800 p-4">
                      <h3 className="text-sm font-bold text-ai-300 uppercase tracking-wide mb-3">Cost breakdown per order</h3>
                      <dl className="space-y-1.5 text-sm">
                        {[
                          { label: "Price", value: inr(gateResult.breakdown.price) },
                          { label: "Royalty", value: `-${inr(gateResult.breakdown.royalty)}` },
                          { label: "Production", value: `-${inr(gateResult.breakdown.production)}` },
                          { label: "Logistics", value: `-${inr(gateResult.breakdown.logistics)}` },
                          { label: "Packaging", value: `-${inr(gateResult.breakdown.packaging)}` },
                          { label: "Payment fee", value: `-${inr(gateResult.breakdown.paymentFee)}` },
                          { label: "Referral", value: `-${inr(gateResult.breakdown.referral)}` },
                          { label: "Platform fee", value: `-${inr(gateResult.breakdown.platformFee)}` },
                        ].map(({ label, value }) => (
                          <div key={label} className="flex justify-between gap-4">
                            <dt className="text-ai-300">{label}</dt>
                            <dd className="num">{value}</dd>
                          </div>
                        ))}
                        <div className="flex justify-between gap-4 border-t border-ai-700 pt-1.5 font-bold">
                          <dt>Contribution</dt>
                          <dd className={`num ${gateResult.contribution > 0 ? "text-jade" : "text-vermilion"}`}>
                            {inr(gateResult.contribution)}
                          </dd>
                        </div>
                      </dl>
                    </div>
                  )}

                  {/* FandomLoop earns */}
                  {selectedCampaign.ourRevenue && (
                    <div className="rounded-xl border border-sakura/30 bg-sakura/5 p-4">
                      <h3 className="text-sm font-bold text-sakura uppercase tracking-wide mb-2">FandomLoop earns</h3>
                      <dl className="space-y-1.5 text-sm">
                        <div className="flex justify-between gap-4">
                          <dt className="text-ai-300">Test fee</dt>
                          <dd className="num">{inr(selectedCampaign.ourRevenue.testFee)}</dd>
                        </div>
                        <div className="flex justify-between gap-4">
                          <dt className="text-ai-300">Commission (GO only)</dt>
                          <dd className="num">{inr(selectedCampaign.ourRevenue.commission)}</dd>
                        </div>
                        <div className="flex justify-between gap-4 border-t border-sakura/20 pt-1.5 font-bold">
                          <dt>Total</dt>
                          <dd className="num text-sakura">{inr(selectedCampaign.ourRevenue.total)}</dd>
                        </div>
                      </dl>
                      <p className="mt-2 text-xs text-ai-400">
                        Test fee is charged on every campaign; commission only on GO.
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* Settle */}
              <div className="mt-5 border-t border-ai-700/50 pt-5">
                <div className="flex flex-wrap items-center gap-4">
                  <button
                    onClick={handleSettle}
                    disabled={settleLoading}
                    className="inline-flex items-center gap-2 rounded-xl border border-sakura/60 bg-sakura/10 px-4 py-2 text-sm font-medium text-sakura hover:bg-sakura/20 disabled:opacity-50"
                  >
                    {settleLoading && <RefreshCw size={14} className="animate-spin" aria-hidden="true" />}
                    Settle campaign
                  </button>
                  <p className="text-xs text-ai-300">
                    Runs gate on committed count. Captures (GO) or releases (ADAPT/STOP) preauthorised pledges.
                  </p>
                </div>
                {settleError && <SectionError message={settleError} />}
                {settleResult && (
                  <AnimatePresence>
                    <motion.div
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="mt-4 rounded-xl border border-ai-700/70 bg-ai-800 p-4 text-sm"
                    >
                      <div className="flex items-center gap-3">
                        <VerdictStamp verdict={settleResult.gateVerdict.status} />
                        <div>
                          {settleResult.gateVerdict.status === "GO" ? (
                            <p>
                              {num(settleResult.captured)} pledge{settleResult.captured !== 1 ? "s" : ""} captured —{" "}
                              <strong>{num(settleResult.serialsIssued)} serial{settleResult.serialsIssued !== 1 ? "s" : ""}</strong> issued.
                            </p>
                          ) : (
                            <p>
                              {num(settleResult.released)} pledge{settleResult.released !== 1 ? "s" : ""} released — no fans were charged.
                            </p>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  </AnimatePresence>
                )}
              </div>
            </section>
          )}

          {/* Sources chart */}
          {selectedCampaign && (
            <section className="rounded-2xl border border-ai-700/70 bg-ai-900 p-5">
              <h2 className="font-display text-2xl font-bold">Opt-ins by source</h2>
              {sourcesLoading && <div className="mt-4"><Spinner /></div>}
              {!sourcesLoading && sources.length === 0 && (
                <p className="mt-2 text-sm text-ai-300">No source data yet.</p>
              )}
              {sources.length > 0 && (
                <div className="mt-4">
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={sources} layout="vertical" margin={{ left: 16 }}>
                      <XAxis type="number" tick={{ fill: "#7d86a0", fontSize: 12 }} />
                      <YAxis type="category" dataKey="source" width={130} tick={{ fill: "#7d86a0", fontSize: 12 }} />
                      <Tooltip
                        contentStyle={{ background: "#141b2d", border: "1px solid #2a3350", borderRadius: 8, fontSize: 13 }}
                        formatter={(v, name) => [v, name === "optIns" ? "Opt-ins" : "Committed"]}
                      />
                      <Bar dataKey="optIns" name="Opt-ins" fill="#e88ba0" radius={[0, 4, 4, 0]} />
                      <Bar dataKey="committed" name="Committed" fill="#46c79a" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </section>
          )}

          {/* Scans */}
          {selectedCampaign && (
            <section className="rounded-2xl border border-ai-700/70 bg-ai-900 p-5">
              <h2 className="font-display text-2xl font-bold">Scans</h2>
              {scansLoading && <div className="mt-4"><Spinner /></div>}
              {!scansLoading && scans && (
                <div className="mt-4 space-y-4">
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-2">
                    <StatCard label="Valid scans" value={num(scans.validScans)} highlight />
                    <StatCard label="Invalid scans" value={num(scans.invalidScans)} />
                  </div>

                  {scans.topScannedSerials?.length > 0 && (
                    <div>
                      <h3 className="text-sm font-bold text-ai-300 uppercase tracking-wide mb-2">Most scanned serials</h3>
                      <ol className="space-y-1 text-sm">
                        {scans.topScannedSerials.slice(0, 5).map((s) => (
                          <li key={s.serial} className="flex items-center justify-between gap-4 rounded-lg border border-ai-700/60 bg-ai-800 px-3 py-2">
                            <span className="num font-medium">{s.serial}</span>
                            <span className="text-ai-300">{s.count}×</span>
                          </li>
                        ))}
                      </ol>
                    </div>
                  )}

                  {scans.recentInvalid?.length > 0 && (
                    <div>
                      <h3 className="text-sm font-bold text-vermilion uppercase tracking-wide mb-2">
                        Possible counterfeits — last {scans.recentInvalid.length} invalid scan{scans.recentInvalid.length !== 1 ? "s" : ""}
                      </h3>
                      <ul className="space-y-1.5 text-sm">
                        {scans.recentInvalid.slice(0, 10).map((s, i) => (
                          <li key={i} className="flex flex-wrap items-center gap-3 rounded-lg border border-vermilion/30 bg-vermilion/5 px-3 py-2">
                            <span className="num font-medium text-vermilion">{s.serial}</span>
                            <span className="text-ai-400 text-xs">{new Date(s.createdAt).toLocaleString("en-IN")}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
              {!scansLoading && !scans && (
                <p className="mt-2 text-sm text-ai-300">No scan data yet.</p>
              )}
            </section>
          )}

          {/* Segments table */}
          <section className="rounded-2xl border border-ai-700/70 bg-ai-900 p-5">
            <h2 className="font-display text-2xl font-bold">Demand segments</h2>
            <p className="mt-1 text-sm text-ai-300">
              {selectedCampaign ? `"${selectedCampaign.title}" — grouped by city × language × format.` : "Select a campaign above."}
            </p>

            {segmentsLoading && <div className="mt-4"><Spinner /></div>}
            {segmentsError && <SectionError message={segmentsError} />}

            {!segmentsLoading && segments.length === 0 && selectedSlug && !segmentsError && (
              <p className="mt-3 text-sm text-ai-300">No pledges yet for this campaign.</p>
            )}

            {segments.length > 0 && (
              <div className="mt-4 overflow-x-auto rounded-xl border border-ai-700/70">
                <table className="w-full min-w-[640px] text-left text-sm">
                  <thead className="border-b border-ai-700/70 text-ai-300">
                    <tr>
                      <th className="px-4 py-3 font-medium">City</th>
                      <th className="px-4 py-3 font-medium">Language</th>
                      <th className="px-4 py-3 font-medium">Format</th>
                      <th className="px-4 py-3 text-right font-medium">Opt-ins</th>
                      <th className="px-4 py-3 text-right font-medium">Avg price</th>
                      <th className="px-4 py-3 text-right font-medium">Demand score</th>
                      <th className="px-4 py-3 font-medium">Verdict</th>
                    </tr>
                  </thead>
                  <tbody>
                    {segments.map((s) => (
                      <tr
                        key={`${s.city}|${s.language}|${s.format}`}
                        className="border-b border-ai-700/40 last:border-0"
                      >
                        <td className="px-4 py-3 font-medium">{s.city}</td>
                        <td className="px-4 py-3">{s.language}</td>
                        <td className="px-4 py-3 text-ai-300">{s.format}</td>
                        <td className="num px-4 py-3 text-right">{num(s.count)}</td>
                        <td className="num px-4 py-3 text-right">{inr(s.avgPrice)}</td>
                        <td className="px-4 py-3 text-right">
                          <div className="ml-auto flex w-28 items-center gap-2">
                            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-ai-700">
                              <div
                                className="h-full rounded-full transition-all"
                                style={{ width: `${s.demandScore}%`, background: VERDICT_COLORS[s.verdict] }}
                              />
                            </div>
                            <span className="num w-7 text-right text-xs">{s.demandScore}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3"><VerdictStamp verdict={s.verdict} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* All campaigns table */}
          <section className="rounded-2xl border border-ai-700/70 bg-ai-900 p-5">
            <h2 className="font-display text-2xl font-bold">All campaigns</h2>
            {campaignsLoading && <div className="mt-4"><Spinner /></div>}
            {campaignsError && <SectionError message={campaignsError} />}
            {!campaignsLoading && campaigns.length === 0 && !campaignsError && (
              <p className="mt-2 text-sm text-ai-300">
                No campaigns yet. Use{" "}
                <code className="rounded bg-ai-800 px-1 py-0.5 text-xs">POST /api/campaigns</code> to create one.
              </p>
            )}
            {campaigns.length > 0 && (
              <div className="mt-4 overflow-x-auto rounded-xl border border-ai-700/70">
                <table className="w-full min-w-[640px] text-left text-sm">
                  <thead className="border-b border-ai-700/70 text-ai-300">
                    <tr>
                      <th className="px-4 py-2 font-medium">Title</th>
                      <th className="px-4 py-2 font-medium">Format</th>
                      <th className="px-4 py-2 text-right font-medium">Price</th>
                      <th className="px-4 py-2 text-right font-medium">Committed</th>
                      <th className="px-4 py-2 text-right font-medium">Progress</th>
                      <th className="px-4 py-2 font-medium">Status</th>
                      <th className="px-4 py-2 font-medium">Gate</th>
                    </tr>
                  </thead>
                  <tbody>
                    {campaigns.map((c) => (
                      <tr
                        key={c.id}
                        onClick={() => setSelectedSlug(c.slug)}
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSelectedSlug(c.slug) }
                        }}
                        aria-label={`Select ${c.title}`}
                        className={`cursor-pointer border-b border-ai-700/40 transition-colors last:border-0 hover:bg-ai-800/70 focus-visible:bg-ai-800 ${
                          c.slug === selectedSlug ? "bg-ai-800/50" : ""
                        }`}
                      >
                        <td className="px-4 py-2 font-medium">{c.title}</td>
                        <td className="px-4 py-2 text-ai-300">{c.format}</td>
                        <td className="num px-4 py-2 text-right">{inr(c.listPrice)}</td>
                        <td className="num px-4 py-2 text-right">{num(c.committedCount ?? 0)}</td>
                        <td className="num px-4 py-2 text-right">{c.progressPct}%</td>
                        <td className="px-4 py-2 text-ai-300">{c.status}</td>
                        <td className="px-4 py-2">
                          {c.gateVerdict && <VerdictStamp verdict={c.gateVerdict.status} />}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* ── Demand prior vs fan votes ── */}
          {selectedCampaign && (
            <section className="rounded-2xl border border-ai-700/70 bg-ai-900 p-5">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                  <h2 className="font-display text-2xl font-bold">Demand prior vs fan votes</h2>
                  <p className="mt-1 text-sm text-ai-300">
                    Public signals suggest what to test; our fan test decides what to make. Not a forecast.
                  </p>
                </div>
                {priorLoading && <Spinner />}
                {!priorLoading && prior && (
                  <div className="flex items-center gap-2 text-xs text-ai-400">
                    {prior._meta?.isSample && (
                      <span className="rounded-full border border-marigold/60 bg-marigold/10 px-2 py-0.5 text-marigold font-medium">
                        Sample data
                      </span>
                    )}
                    <span>as of {new Date(prior.asOf).toLocaleString("en-IN", { dateStyle: "short", timeStyle: "short" })}</span>
                  </div>
                )}
              </div>

              {priorError && <SectionError message={priorError} />}

              {prior && !priorLoading && (
                <div className="mt-5 space-y-5">
                  {/* Trend badge */}
                  {prior.trend && (
                    <div className="flex flex-wrap items-center gap-3 text-sm">
                      <span className={`rounded-full px-3 py-1 font-bold border ${
                        prior.trend.label === "rising"
                          ? "border-jade/60 bg-jade/10 text-jade"
                          : prior.trend.label === "falling"
                          ? "border-vermilion/60 bg-vermilion/10 text-vermilion"
                          : "border-ai-600 bg-ai-800 text-ai-300"
                      }`}>
                        {prior.trend.label === "rising" ? "↑ Rising" :
                         prior.trend.label === "falling" ? "↓ Falling" : "→ Flat"}
                      </span>
                      {prior.trend.weekOverWeek !== null && (
                        <span className="text-ai-300">
                          Week-over-week: <span className="num font-bold">{prior.trend.weekOverWeek > 0 ? "+" : ""}{prior.trend.weekOverWeek}%</span>
                        </span>
                      )}
                      {prior.trend.movingAvg4w !== null && (
                        <span className="text-ai-300">
                          4-week avg: <span className="num font-bold">{prior.trend.movingAvg4w}</span>
                        </span>
                      )}
                    </div>
                  )}

                  {/* Per-city table */}
                  <div className="overflow-x-auto rounded-xl border border-ai-700/70">
                    <table className="w-full min-w-[560px] text-left text-sm">
                      <thead className="border-b border-ai-700/70 text-ai-300">
                        <tr>
                          <th className="px-4 py-3 font-medium">City</th>
                          <th className="px-4 py-3 text-right font-medium">Prior</th>
                          <th className="px-4 py-3 text-right font-medium">Fan votes</th>
                          <th className="px-4 py-3 text-right font-medium">Blended</th>
                          <th className="px-4 py-3 font-medium">Signal mix</th>
                        </tr>
                      </thead>
                      <tbody>
                        {prior.perCity
                          .slice()
                          .sort((a, b) => b.posterior - a.posterior)
                          .map((row) => (
                            <tr key={row.city} className="border-b border-ai-700/40 last:border-0">
                              <td className="px-4 py-3 font-medium">{row.city}</td>
                              <td className="num px-4 py-3 text-right">{row.prior}</td>
                              <td className="num px-4 py-3 text-right">{row.voteScore.toFixed(1)}</td>
                              <td className="px-4 py-3 text-right">
                                <div className="flex items-center justify-end gap-2">
                                  {/* Mini bar */}
                                  <div className="h-2 w-20 overflow-hidden rounded-full bg-ai-700">
                                    <div
                                      className="h-full rounded-full bg-sakura"
                                      style={{ width: `${Math.min(100, row.posterior)}%` }}
                                    />
                                  </div>
                                  <span className="num w-8 text-right font-bold">{row.posterior.toFixed(1)}</span>
                                </div>
                              </td>
                              <td className="px-4 py-3">
                                <span className="text-xs text-ai-400">
                                  {(row.w * 100).toFixed(0)}% prior
                                </span>
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Sources */}
                  {prior.sources?.length > 0 && (
                    <div className="flex flex-wrap gap-3 text-xs text-ai-400">
                      <span className="font-medium text-ai-300">Sources:</span>
                      {prior.sources.map((s) => (
                        <a
                          key={s.name}
                          href={s.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="hover:text-washi underline underline-offset-2"
                        >
                          {s.name}
                          {s.isSample && " (sample)"}
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {!prior && !priorLoading && !priorError && (
                <p className="mt-4 text-sm text-ai-300">Loading prior scores…</p>
              )}
            </section>
          )}

          {/* ── Title shortlist ── */}
          {campaigns.length > 0 && (
            <section className="rounded-2xl border border-ai-700/70 bg-ai-900 p-5">
              <h2 className="font-display text-2xl font-bold">Title shortlist</h2>
              <p className="mt-1 text-sm text-ai-300">
                Campaigns ranked by highest city prior score — suggests what to test next.
              </p>
              <div className="mt-4 overflow-x-auto rounded-xl border border-ai-700/70">
                <table className="w-full min-w-[480px] text-left text-sm">
                  <thead className="border-b border-ai-700/70 text-ai-300">
                    <tr>
                      <th className="px-4 py-3 font-medium">Campaign</th>
                      <th className="px-4 py-3 font-medium">Format</th>
                      <th className="px-4 py-3 text-right font-medium">Price</th>
                      <th className="px-4 py-3 text-right font-medium">Committed</th>
                      <th className="px-4 py-3 font-medium">Gate</th>
                    </tr>
                  </thead>
                  <tbody>
                    {campaigns
                      .slice()
                      .sort((a, b) => {
                        // Sort by gate status priority: GO > ADAPT > STOP > others
                        const rank = { GO: 0, ADAPT: 1, STOP: 2 }
                        const ra = rank[a.gateVerdict?.status] ?? 3
                        const rb = rank[b.gateVerdict?.status] ?? 3
                        if (ra !== rb) return ra - rb
                        return (b.committedCount ?? 0) - (a.committedCount ?? 0)
                      })
                      .map((c, i) => (
                        <tr
                          key={c.id}
                          onClick={() => setSelectedSlug(c.slug)}
                          tabIndex={0}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSelectedSlug(c.slug) }
                          }}
                          aria-label={`Select ${c.title}`}
                          className={`cursor-pointer border-b border-ai-700/40 last:border-0 hover:bg-ai-800/70 focus-visible:bg-ai-800 ${
                            c.slug === selectedSlug ? "bg-ai-800/50" : ""
                          }`}
                        >
                          <td className="px-4 py-3">
                            <span className="num mr-2 text-ai-500">#{i + 1}</span>
                            <span className="font-medium">{c.title}</span>
                          </td>
                          <td className="px-4 py-3 text-ai-300">{c.format}</td>
                          <td className="num px-4 py-3 text-right">{inr(c.listPrice)}</td>
                          <td className="num px-4 py-3 text-right">{num(c.committedCount ?? 0)}</td>
                          <td className="px-4 py-3">
                            {c.gateVerdict && <VerdictStamp verdict={c.gateVerdict.status} />}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {/* AI insights + brief */}
          {selectedCampaign && (
            <section className="rounded-2xl border border-ai-700/70 bg-ai-900 p-5">
              <h2 className="font-display text-2xl font-bold flex items-center gap-2">
                <Sparkles size={20} aria-hidden="true" />
                AI insights
              </h2>
              <div className="mt-4 flex flex-wrap gap-3">
                <button
                  onClick={fetchInsights}
                  disabled={insightsLoading}
                  className="inline-flex items-center gap-2 rounded-xl border border-ai-600 px-4 py-2 text-sm text-ai-300 hover:text-washi disabled:opacity-50"
                >
                  {insightsLoading && <RefreshCw size={13} className="animate-spin" aria-hidden="true" />}
                  Cluster comments
                </button>
                <button
                  onClick={fetchBrief}
                  disabled={briefLoading}
                  className="inline-flex items-center gap-2 rounded-xl border border-sakura/50 bg-sakura/5 px-4 py-2 text-sm text-sakura hover:bg-sakura/10 disabled:opacity-50"
                >
                  {briefLoading && <RefreshCw size={13} className="animate-spin" aria-hidden="true" />}
                  Generate brief
                </button>
              </div>

              {insightsError && <SectionError message={insightsError} />}
              {briefError && <SectionError message={briefError} />}

              {insights && (
                <div className="mt-4 space-y-2">
                  <p className="text-sm text-ai-300">{insights.totalComments} comment{insights.totalComments !== 1 ? "s" : ""} · {insights.method}</p>
                  {insights.clusters?.map((cl) => (
                    <div key={cl.label} className="rounded-xl border border-ai-700/70 bg-ai-800 p-3 text-sm">
                      <p className="font-bold">{cl.label} <span className="font-normal text-ai-400">({cl.count})</span></p>
                      {cl.samples?.[0] && <p className="mt-1 text-ai-300 italic">"{cl.samples[0]}"</p>}
                    </div>
                  ))}
                </div>
              )}

              {brief && (
                <div className="mt-4 space-y-2">
                  {brief.sections?.map((s) => (
                    <div key={s.heading} className="rounded-xl border border-ai-700/70 bg-ai-800 p-3 text-sm">
                      <p className="text-xs font-bold uppercase tracking-wide text-ai-300">{s.heading}</p>
                      <p className="mt-1 leading-relaxed">{s.body}</p>
                    </div>
                  ))}
                  {brief.generatedBy === "template" && (
                    <p className="text-xs text-ai-500 italic">
                      Template brief — add LLM_API_KEY to backend .env for AI-generated content.
                    </p>
                  )}
                </div>
              )}
            </section>
          )}
        </div>
      </div>
    </div>
  )
}
