import { useCallback, useEffect, useRef, useState } from "react"
import { Link } from "react-router-dom"
import { motion, AnimatePresence } from "framer-motion"
import { AlertTriangle, Key, RefreshCw, RotateCcw, Sparkles, WifiOff } from "lucide-react"
import { CONCEPT } from "../data/combos"
import { getOptIns } from "../lib/storage"
import {
  getCampaigns,
  getCampaignSegments,
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
      <p className="flex-1 text-sm text-vermilion">
        Backend offline — showing cached data only.
      </p>
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

// Stat card used in the gate result panel
function StatCard({ label, value, sub, highlight }) {
  return (
    <div className={`rounded-xl border p-3 ${highlight ? "border-sakura/40 bg-sakura/5" : "border-ai-700/70 bg-ai-800"}`}>
      <p className="text-xs text-ai-300">{label}</p>
      <p className={`num mt-0.5 text-2xl font-bold leading-none ${highlight ? "text-sakura" : ""}`}>{value}</p>
      {sub && <p className="mt-1 text-xs text-ai-300">{sub}</p>}
    </div>
  )
}

// ── default slider values for gate evaluation ──────────────────────────────
const GATE_DEFAULTS = {
  price: 799,
  royaltyPct: 0.15,
  productionCost: 360,   // TEE default
  thresholdPct: 0.20,
}

const PRICE_PRESETS = [
  { label: "₹499", price: 499, note: "STOP" },
  { label: "₹799", price: 799, note: "ADAPT" },
  { label: "₹999", price: 999, note: "GO" },
]

// ── main component ─────────────────────────────────────────────────────────

export default function Console() {
  // ── backend online state ─────────────────────────────────────────────────
  const [offline, setOffline] = useState(false)

  // ── studio key ───────────────────────────────────────────────────────────
  const [studioKeyInput, setStudioKeyInput] = useState(() => getStudioKey())
  const [keyVisible, setKeyVisible] = useState(false)

  // ── campaigns list ───────────────────────────────────────────────────────
  const [campaigns, setCampaigns] = useState([])
  const [campaignsLoading, setCampaignsLoading] = useState(true)
  const [campaignsError, setCampaignsError] = useState("")
  const [selectedSlug, setSelectedSlug] = useState(null)

  // ── segments for selected campaign ──────────────────────────────────────
  const [segments, setSegments] = useState([])
  const [segmentsLoading, setSegmentsLoading] = useState(false)
  const [segmentsError, setSegmentsError] = useState("")

  // ── gate evaluator sliders ────────────────────────────────────────────────
  const [sliders, setSliders] = useState(GATE_DEFAULTS)
  const debouncedSliders = useDebounce(sliders, 250)
  const [gateResult, setGateResult] = useState(null)
  const [gateLoading, setGateLoading] = useState(false)
  const [gateError, setGateError] = useState("")

  // ── settle ────────────────────────────────────────────────────────────────
  const [settleLoading, setSettleLoading] = useState(false)
  const [settleResult, setSettleResult] = useState(null)
  const [settleError, setSettleError] = useState("")

  // ── AI insights + brief ───────────────────────────────────────────────────
  const [insights, setInsights] = useState(null)
  const [insightsLoading, setInsightsLoading] = useState(false)
  const [insightsError, setInsightsError] = useState("")
  const [brief, setBrief] = useState(null)
  const [briefLoading, setBriefLoading] = useState(false)
  const [briefError, setBriefError] = useState("")

  // ── local opt-ins ─────────────────────────────────────────────────────────
  const [optins, setOptins] = useState(() => getOptIns())
  useEffect(() => { setOptins(getOptIns()) }, [])

  // ── fetch campaigns ────────────────────────────────────────────────────────
  const fetchCampaigns = useCallback(async () => {
    setCampaignsLoading(true)
    setCampaignsError("")
    try {
      await healthCheck()
      setOffline(false)
      const data = await getCampaigns()
      setCampaigns(data)
      // auto-select first campaign
      if (data.length && !selectedSlug) {
        setSelectedSlug(data[0].slug)
      }
    } catch {
      setCampaignsError("Could not load campaigns.")
      setOffline(true)
    } finally {
      setCampaignsLoading(false)
    }
  }, [selectedSlug])

  useEffect(() => { fetchCampaigns() }, [fetchCampaigns])

  // ── fetch segments when selected campaign changes ─────────────────────────
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
    return () => { cancelled = true }
  }, [selectedSlug])

  // ── run gate evaluation when debounced sliders change ─────────────────────
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
      orders: selectedCampaign.pledgeCount,
      royaltyPct: debouncedSliders.royaltyPct,
      productionCost: debouncedSliders.productionCost,
      thresholdPct: debouncedSliders.thresholdPct,
    })
      .then((r) => { if (!cancelled) setGateResult(r) })
      .catch(() => { if (!cancelled) setGateError("Gate evaluation failed.") })
      .finally(() => { if (!cancelled) setGateLoading(false) })
    return () => { cancelled = true }
  }, [debouncedSliders, selectedCampaign])

  // re-sync sliders when campaign selection changes
  useEffect(() => {
    if (!selectedCampaign) return
    setSliders({
      price: selectedCampaign.listPrice,
      royaltyPct: selectedCampaign.marginGate?.royaltyPct ?? 0.15,
      productionCost: selectedCampaign.marginGate?.productionCost ?? 360,
      thresholdPct: selectedCampaign.marginGate?.thresholdPct ?? 0.20,
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
    })
  }

  // ── settle handler ────────────────────────────────────────────────────────
  const handleSettle = async () => {
    if (!selectedSlug) return
    setSettleLoading(true)
    setSettleError("")
    setSettleResult(null)
    try {
      const r = await settleCampaign(selectedSlug)
      setSettleResult(r)
      // refresh campaigns so status + pledgeCount update
      await fetchCampaigns()
    } catch (err) {
      setSettleError(err.message ?? "Settle failed.")
    } finally {
      setSettleLoading(false)
    }
  }

  // ── AI handlers ──────────────────────────────────────────────────────────
  const fetchInsights = useCallback(async () => {
    if (!selectedSlug) return
    setInsightsLoading(true)
    setInsightsError("")
    try {
      const data = await getCampaignInsights(selectedSlug)
      setInsights(data)
    } catch (err) {
      setInsightsError(err.message ?? "Could not load insights.")
    } finally {
      setInsightsLoading(false)
    }
  }, [selectedSlug])

  const fetchBrief = useCallback(async () => {
    if (!selectedSlug) return
    setBriefLoading(true)
    setBriefError("")
    try {
      const data = await getCampaignBrief(selectedSlug)
      setBrief(data)
    } catch (err) {
      setBriefError(err.message ?? "Could not generate brief.")
    } finally {
      setBriefLoading(false)
    }
  }, [selectedSlug])

  // Reset AI state when campaign changes
  useEffect(() => {
    setInsights(null)
    setBrief(null)
    setInsightsError("")
    setBriefError("")
  }, [selectedSlug])

  // ── verdict counts from live campaigns list ───────────────────────────────
  const counts = campaigns.reduce(
    (acc, c) => {
      const v = c.gateVerdict?.status
      if (v && acc[v] !== undefined) acc[v]++
      return acc
    },
    { GO: 0, ADAPT: 0, STOP: 0 }
  )

  const totalPledges = campaigns.reduce((s, c) => s + (c.pledgeCount ?? 0), 0)

  // ── render ────────────────────────────────────────────────────────────────
  return (
    <div>
      {/* Studio key input */}
      <div className="mb-5 flex items-center gap-3 rounded-2xl border border-ai-700/50 bg-ai-900 px-4 py-3">
        <Key size={16} className="shrink-0 text-ai-300" aria-hidden="true" />
        <label htmlFor="studio-key" className="text-sm text-ai-300 shrink-0">Studio key</label>
        <input
          id="studio-key"
          type={keyVisible ? "text" : "password"}
          value={studioKeyInput}
          onChange={(e) => {
            setStudioKeyInput(e.target.value)
            setStudioKey(e.target.value)
          }}
          placeholder="Leave empty if not set"
          autoComplete="off"
          className="min-w-0 flex-1 rounded-lg border border-ai-700 bg-ai-800 px-3 py-1.5 text-sm text-washi placeholder:text-ai-500 focus:outline-none focus:border-sakura/60"
        />
        <button
          type="button"
          onClick={() => setKeyVisible((v) => !v)}
          className="text-xs text-ai-400 hover:text-washi"
        >
          {keyVisible ? "Hide" : "Show"}
        </button>
      </div>

      {/* Offline banner */}
      {offline && <OfflineBanner onRetry={fetchCampaigns} />}

      {/* Header */}
      <section className="grid gap-8 lg:grid-cols-[1fr_auto] lg:items-end">
        <div>
          <h1 className="font-display text-4xl font-extrabold leading-tight sm:text-5xl">
            Where should we launch next?
          </h1>
          <p className="mt-3 max-w-2xl text-lg text-ai-300">
            {CONCEPT} — {num(totalPledges)} total pledges across {campaigns.length} campaign
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

        {/* ── Left sidebar: campaign picker + sliders ── */}
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
                        <span>{num(c.pledgeCount)} pledges</span>
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
                <Slider
                  id="price"
                  label="Price"
                  value={sliders.price}
                  min={99}
                  max={2999}
                  step={50}
                  onChange={(v) => set({ price: v })}
                  display={inr(sliders.price)}
                  hint="Retail price per unit."
                />
                <Slider
                  id="royalty"
                  label="Royalty"
                  value={sliders.royaltyPct}
                  min={0.05}
                  max={0.5}
                  onChange={(v) => set({ royaltyPct: v })}
                  display={pct(sliders.royaltyPct)}
                  hint="Share of each sale paid to the rights holder."
                />
                <Slider
                  id="production"
                  label="Production cost"
                  value={sliders.productionCost}
                  min={0}
                  max={1000}
                  step={10}
                  onChange={(v) => set({ productionCost: v })}
                  display={inr(sliders.productionCost)}
                  hint="Cost to make one unit."
                />
                <Slider
                  id="gate"
                  label="Margin gate"
                  value={sliders.thresholdPct}
                  min={0.05}
                  max={0.5}
                  onChange={(v) => set({ thresholdPct: v })}
                  display={pct(sliders.thresholdPct)}
                  hint="Lowest margin the studio will accept."
                />
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
                <div className="mt-4 space-y-4">
                  {/* Status stamp — re-stamps on change via key */}
                  <div className="flex items-center gap-4">
                    <VerdictStamp verdict={gateResult.status} size="lg" />
                    {gateResult.reasons?.length > 0 && (
                      <ul className="flex flex-wrap gap-1.5">
                        {gateResult.reasons.map((r) => (
                          <li
                            key={r}
                            className="rounded-full border border-ai-600 bg-ai-800 px-2 py-0.5 text-xs text-ai-300"
                          >
                            {r.replace(/_/g, " ")}
                          </li>
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
                      sub={`pledges: ${num(selectedCampaign.pledgeCount)}`}
                    />
                    <StatCard
                      label="Progress to minRun"
                      value={`${selectedCampaign.progressPct}%`}
                      sub={`${num(selectedCampaign.pledgeCount)} / ${num(selectedCampaign.minRun)}`}
                    />
                  </div>
                </div>
              )}

              {/* Settle button + result */}
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
                    Runs the gate on current pledge count. Captures (GO) or releases (ADAPT / STOP) all preauthorised pledges.
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
                        <p>
                          {settleResult.gateVerdict.status === "GO"
                            ? `${num(settleResult.pledgesSettled)} pledge${settleResult.pledgesSettled !== 1 ? "s" : ""} captured — campaign is live.`
                            : `${num(settleResult.pledgesSettled)} pledge${settleResult.pledgesSettled !== 1 ? "s" : ""} released — no fans were charged.`}
                        </p>
                      </div>
                    </motion.div>
                  </AnimatePresence>
                )}
              </div>
            </section>
          )}

          {/* Segments table */}
          <section className="rounded-2xl border border-ai-700/70 bg-ai-900 p-5">
            <h2 className="font-display text-2xl font-bold">Demand segments</h2>
            <p className="mt-1 text-sm text-ai-300">
              {selectedCampaign ? `Pledges for "${selectedCampaign.title}" grouped by city × language × format.` : "Select a campaign above."}
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
                      <th className="px-4 py-3 text-right font-medium">Pledges</th>
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
                          {/* Mini score bar */}
                          <div className="ml-auto flex w-28 items-center gap-2">
                            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-ai-700">
                              <div
                                className="h-full rounded-full transition-all"
                                style={{
                                  width: `${s.demandScore}%`,
                                  background: VERDICT_COLORS[s.verdict],
                                }}
                              />
                            </div>
                            <span className="num w-7 text-right text-xs">{s.demandScore}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <VerdictStamp verdict={s.verdict} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* Campaigns table */}
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
                      <th className="px-4 py-2 text-right font-medium">Pledges</th>
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
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault()
                            setSelectedSlug(c.slug)
                          }
                        }}
                        aria-label={`Select ${c.title}`}
                        className={`cursor-pointer border-b border-ai-700/40 transition-colors last:border-0 hover:bg-ai-800/70 focus-visible:bg-ai-800 ${
                          c.slug === selectedSlug ? "bg-ai-800/50" : ""
                        }`}
                      >
                        <td className="px-4 py-2 font-medium">{c.title}</td>
                        <td className="px-4 py-2 text-ai-300">{c.format}</td>
                        <td className="num px-4 py-2 text-right">{inr(c.listPrice)}</td>
                        <td className="num px-4 py-2 text-right">{num(c.pledgeCount)}</td>
                        <td className="num px-4 py-2 text-right">{c.progressPct}%</td>
                        <td className="px-4 py-2">
                          <span className="rounded-full border border-ai-600 px-2 py-0.5 text-xs text-ai-300">
                            {c.status}
                          </span>
                        </td>
                        <td className="px-4 py-2">
                          <VerdictStamp verdict={c.gateVerdict?.status ?? "STOP"} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* Local opt-ins */}
          <section className="rounded-2xl border border-ai-700/70 bg-ai-900 p-5">
            <h2 className="font-display text-xl font-bold">Fan opt-ins on this device</h2>
            {optins.length === 0 ? (
              <p className="mt-2 text-ai-300">
                None yet. Open the{" "}
                <Link to="/join" className="text-sakura underline underline-offset-4">
                  vote page
                </Link>{" "}
                on your phone or in another tab, submit, then come back and refresh.
              </p>
            ) : (
              <>
                <p className="mt-2 text-ai-300">
                  <span className="num font-display text-2xl font-bold text-washi">{optins.length}</span>{" "}
                  collected from the fan form. Latest:
                </p>
                <ul className="mt-2 space-y-1 text-sm">
                  {optins.slice(0, 3).map((o) => (
                    <li key={o.id} className="text-ai-300">
                      {o.city}, {o.language} {o.format.toLowerCase()}, {o.priceBand}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>

          {/* AI — fan comment clusters */}
          {selectedCampaign && (
            <section className="rounded-2xl border border-ai-700/70 bg-ai-900 p-5">
              <div className="flex items-center justify-between gap-3">
                <h2 className="font-display text-2xl font-bold flex items-center gap-2">
                  <Sparkles size={20} className="text-sakura" aria-hidden="true" />
                  Fan comment clusters
                </h2>
                <button
                  onClick={fetchInsights}
                  disabled={insightsLoading}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-ai-700 px-3 py-1.5 text-sm text-ai-300 hover:text-washi disabled:opacity-50"
                >
                  <RefreshCw size={13} className={insightsLoading ? "animate-spin" : ""} aria-hidden="true" />
                  {insights ? "Re-run" : "Analyse"}
                </button>
              </div>
              <p className="mt-1 text-sm text-ai-300">
                Groups fan comments by topic using keyword heuristics. Click Analyse to run.
              </p>
              {insightsLoading && <div className="mt-4"><Spinner /></div>}
              {insightsError && <SectionError message={insightsError} />}
              {insights && !insightsLoading && (
                <div className="mt-4 space-y-3">
                  <p className="text-xs text-ai-400">
                    {insights.totalComments} comment{insights.totalComments !== 1 ? "s" : ""} · method: {insights.method}
                  </p>
                  {insights.clusters.length === 0 ? (
                    <p className="text-sm text-ai-300">No comments to cluster yet.</p>
                  ) : (
                    <div className="space-y-2">
                      {insights.clusters.map((c) => (
                        <div key={c.label} className="rounded-xl border border-ai-700/70 bg-ai-800 p-3">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-sm font-medium">{c.label}</span>
                            <span className="num rounded-full border border-ai-600 px-2 py-0.5 text-xs text-ai-300">
                              {c.count}
                            </span>
                          </div>
                          {c.samples.map((s, i) => (
                            <p key={i} className="mt-1 text-xs text-ai-400 italic">"{s}"</p>
                          ))}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </section>
          )}

          {/* AI — launch brief */}
          {selectedCampaign && (
            <section className="rounded-2xl border border-ai-700/70 bg-ai-900 p-5">
              <div className="flex items-center justify-between gap-3">
                <h2 className="font-display text-2xl font-bold flex items-center gap-2">
                  <Sparkles size={20} className="text-sakura" aria-hidden="true" />
                  Launch brief
                </h2>
                <button
                  onClick={fetchBrief}
                  disabled={briefLoading}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-ai-700 px-3 py-1.5 text-sm text-ai-300 hover:text-washi disabled:opacity-50"
                >
                  <RefreshCw size={13} className={briefLoading ? "animate-spin" : ""} aria-hidden="true" />
                  {brief ? "Regenerate" : "Generate brief"}
                </button>
              </div>
              <p className="mt-1 text-sm text-ai-300">
                {brief?.generatedBy === "llm"
                  ? "Generated by LLM. Cached until the gate verdict changes."
                  : "Set LLM_API_KEY in backend .env to use AI generation. Template shown below."}
              </p>
              {briefLoading && <div className="mt-4"><Spinner /></div>}
              {briefError && <SectionError message={briefError} />}
              {brief && !briefLoading && (
                <div className="mt-4 space-y-3">
                  <VerdictStamp verdict={brief.verdict} />
                  {brief.sections.map((s) => (
                    <div key={s.heading} className="rounded-xl border border-ai-700/70 bg-ai-800 p-3">
                      <p className="text-xs font-bold uppercase tracking-wide text-ai-300">{s.heading}</p>
                      <p className="mt-1 text-sm leading-relaxed">{s.body}</p>
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
