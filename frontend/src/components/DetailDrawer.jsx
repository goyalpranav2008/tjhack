import { useEffect, useRef } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { X } from "lucide-react"
import VerdictStamp from "./VerdictStamp"
import { inr, num } from "../lib/format"
import { CONCEPT } from "../data/combos"

const FOCUSABLE = 'a[href],button:not([disabled]),input,textarea,select,[tabindex]:not([tabindex="-1"])'

function Line({ label, value, strong }) {
  return (
    <div className={`flex justify-between gap-4 py-2 ${strong ? "border-t border-ai-700 font-bold" : ""}`}>
      <dt className={strong ? "" : "text-ai-300"}>{label}</dt>
      <dd className="num">{value}</dd>
    </div>
  )
}

export default function DetailDrawer({ row, onClose }) {
  const panelRef = useRef(null)
  const closeRef = useRef(null)
  const open = Boolean(row)

  useEffect(() => {
    if (!open) return
    const onKey = (e) => {
      if (e.key === "Escape") {
        onClose()
        return
      }
      // Focus trap: keep Tab inside the panel
      if (e.key === "Tab" && panelRef.current) {
        const focusable = Array.from(panelRef.current.querySelectorAll(FOCUSABLE))
        if (!focusable.length) return
        const first = focusable[0]
        const last = focusable[focusable.length - 1]
        if (e.shiftKey) {
          if (document.activeElement === first) { e.preventDefault(); last.focus() }
        } else {
          if (document.activeElement === last) { e.preventDefault(); first.focus() }
        }
      }
    }
    window.addEventListener("keydown", onKey)
    // Delay focus until animation frame so the panel is in the DOM
    const raf = requestAnimationFrame(() => closeRef.current?.focus())
    return () => {
      window.removeEventListener("keydown", onKey)
      cancelAnimationFrame(raf)
    }
  }, [open, onClose])

  const progress = row && Number.isFinite(row.breakEven) ? Math.min(100, Math.round((row.expectedOrders / row.breakEven) * 100)) : 0

  return (
    <AnimatePresence>
      {row && (
        <motion.div
          key="scrim"
          className="fixed inset-0 z-40 bg-black/55"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        />
      )}
      {row && (
        <motion.aside
          key="panel"
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-label={`${row.city}, ${row.language}, ${row.format}`}
          className="fixed right-0 top-0 z-50 h-full w-full max-w-md overflow-y-auto border-l border-ai-700 bg-ai-900 p-6"
          initial={{ x: "100%" }}
          animate={{ x: 0 }}
          exit={{ x: "100%" }}
          transition={{ type: "tween", duration: 0.25 }}
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="font-display text-2xl font-extrabold">{row.city}</h2>
              <p className="text-ai-300">
                {row.language} {row.format.toLowerCase()}
              </p>
            </div>
            <button
              ref={closeRef}
              onClick={onClose}
              aria-label="Close details"
              className="rounded-lg border border-ai-700 p-2 text-ai-300 hover:text-washi"
            >
              <X size={18} />
            </button>
          </div>

          <div className="mt-6">
            <VerdictStamp verdict={row.verdict} size="lg" />
          </div>
          <p className="mt-5 text-lg leading-snug">{row.reason}</p>

          <h3 className="mt-8 font-display text-lg font-bold">Where each sale goes</h3>
          <dl className="mt-1 text-sm">
            <Line label="Price" value={inr(row.breakdown.price)} />
            <Line label="Royalty to rights holder" value={`-${inr(row.breakdown.royaltyCost)}`} />
            <Line label="Payment fee" value={`-${inr(row.breakdown.feeCost)}`} />
            <Line label="Production" value={`-${inr(row.breakdown.production)}`} />
            <Line label="Logistics and packing" value={`-${inr(row.breakdown.logistics)}`} />
            <Line label="Contribution per order" value={inr(row.contribution)} strong />
          </dl>

          <h3 className="mt-8 font-display text-lg font-bold">Break-even</h3>
          <p className="mt-1 text-sm text-ai-300">
            {num(row.expectedOrders)} expected orders against {Number.isFinite(row.breakEven) ? num(row.breakEven) : "no"} needed to cover the {inr(row.setup)} setup cost.
          </p>
          <div
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progress}
            aria-label="Expected orders as a share of break-even"
            className="mt-3 h-3 overflow-hidden rounded-full bg-ai-800"
          >
            <div className="h-full rounded-full bg-sakura transition-all" style={{ width: `${progress}%` }} />
          </div>

          <h3 className="mt-8 font-display text-lg font-bold">Suggested next step</h3>
          <p className="mt-1">{row.next}</p>

          <h3 className="mt-8 font-display text-lg font-bold">Launch brief</h3>
          {row.brief ? (
            <div className="mt-2 space-y-2">
              {row.brief.sections?.map((s) => (
                <div key={s.heading} className="rounded-xl border border-ai-700/70 bg-ai-800 p-3 text-sm">
                  <p className="text-xs font-bold uppercase tracking-wide text-ai-300">{s.heading}</p>
                  <p className="mt-1 leading-relaxed">{s.body}</p>
                </div>
              ))}
              {row.brief.generatedBy === "template" && (
                <p className="text-xs text-ai-500 italic">
                  Template brief — add LLM_API_KEY to backend .env for AI-generated content.
                </p>
              )}
            </div>
          ) : (
            <div className="mt-2 rounded-xl border border-ai-700 bg-ai-800 p-4 text-sm leading-relaxed">
              {CONCEPT}: {row.format?.toLowerCase()} for {row.language}-speaking fans in {row.city}.{" "}
              {row.reason} {row.next}
              <p className="mt-2 text-ai-400 text-xs">
                Click "Generate brief" in the AI panel to replace this with a structured brief.
              </p>
            </div>
          )}
        </motion.aside>
      )}
    </AnimatePresence>
  )
}
