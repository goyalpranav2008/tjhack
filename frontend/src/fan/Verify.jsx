import { useEffect, useState } from "react"
import { Link, useNavigate, useParams } from "react-router-dom"
import { motion } from "framer-motion"
import { Award, BadgeCheck, Loader2, Search, ShieldAlert, AlertTriangle } from "lucide-react"
import { verifySerial } from "../lib/api"

const dateOf = (iso) =>
  new Date(iso).toLocaleDateString("en-IN", {
    day: "numeric", month: "short", year: "numeric",
  })

function Row({ label, children }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b-2 border-dashed border-ink/25 py-3 last:border-0">
      <dt className="text-sm text-ink/75">{label}</dt>
      <dd className="text-right font-bold">{children}</dd>
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────

export default function Verify() {
  const { serial } = useParams()
  const navigate = useNavigate()
  const [query, setQuery] = useState(serial || "")

  // result: null (not yet fetched) | { verified, ...fields } | "loading" | "error"
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [fetchError, setFetchError] = useState("")

  // Keep the input in sync when navigating directly to /verify/:serial
  useEffect(() => { setQuery(serial || "") }, [serial])

  // Fetch whenever the URL serial changes
  useEffect(() => {
    if (!serial) {
      setResult(null)
      setFetchError("")
      return
    }

    let cancelled = false
    setLoading(true)
    setFetchError("")
    setResult(null)

    verifySerial(decodeURIComponent(serial))
      .then((data) => { if (!cancelled) setResult(data) })
      .catch((err) => {
        if (!cancelled) {
          setFetchError(err.message ?? "Could not reach the server.")
          setResult(null)
        }
      })
      .finally(() => { if (!cancelled) setLoading(false) })

    return () => { cancelled = true }
  }, [serial])

  const submit = (e) => {
    e.preventDefault()
    const q = query.trim()
    navigate(q ? `/verify/${encodeURIComponent(q)}` : "/verify")
  }

  const code = serial ? decodeURIComponent(serial) : null

  return (
    <div>
      <h1 className="font-pop text-4xl leading-tight">Is this item official?</h1>
      <p className="mt-3 text-lg">Scan the QR code on the item, or type the code printed under it.</p>

      <form onSubmit={submit} className="mt-6">
        <label htmlFor="serial" className="mb-2 block font-bold">Item code</label>
        <div className="flex gap-3">
          <input
            id="serial"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="FL-2026-1234"
            autoCapitalize="characters"
            autoComplete="off"
            className="min-w-0 flex-1 rounded-2xl border-2 border-ink bg-white p-4 text-lg placeholder:text-ink/50"
          />
          <button className="btn-pop shrink-0 px-5" aria-label="Check item">
            <Search size={22} aria-hidden="true" />
            <span className="hidden sm:inline">Check</span>
          </button>
        </div>
        <p className="mt-2 text-sm text-ink/70">No code at hand? Try FL-DEMO-0001.</p>
      </form>

      {/* Loading spinner */}
      {loading && (
        <div className="mt-10 flex justify-center">
          <Loader2 size={32} className="animate-spin text-ink/40" aria-label="Checking…" />
        </div>
      )}

      {/* Network / API error */}
      {fetchError && !loading && (
        <div
          role="alert"
          className="mt-8 flex items-start gap-3 rounded-2xl border-2 border-[#B3123F]/40 bg-[#fdf2f4] p-5"
        >
          <AlertTriangle size={20} className="mt-0.5 shrink-0 text-[#B3123F]" aria-hidden="true" />
          <div>
            <p className="font-bold text-[#B3123F]">Could not check this code</p>
            <p className="mt-1 text-sm text-[#B3123F]/80">{fetchError}</p>
            <p className="mt-2 text-sm text-ink/70">
              Check your connection and{" "}
              <button
                onClick={submit}
                className="font-bold underline underline-offset-4"
              >
                try again
              </button>
              .
            </p>
          </div>
        </div>
      )}

      {/* ── Verified ── */}
      {!loading && result?.verified && (
        <motion.section
          key={code}
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          aria-live="polite"
          className="card-pop mt-8 overflow-hidden"
        >
          <div className="flex items-center gap-4 border-b-2 border-ink bg-mint px-5 py-5">
            <motion.span
              initial={{ scale: 1.8, rotate: -25, opacity: 0 }}
              animate={{ scale: 1, rotate: -6, opacity: 1 }}
              transition={{ type: "spring", stiffness: 420, damping: 16 }}
              className="grid h-16 w-16 shrink-0 place-items-center rounded-full border-2 border-ink bg-white"
            >
              <BadgeCheck size={36} aria-hidden="true" />
            </motion.span>
            <div>
              <h2 className="font-pop text-2xl leading-tight">Verified official</h2>
              <p className="text-sm">This item is registered with the studio.</p>
            </div>
          </div>

          <dl className="px-5 py-2">
            <Row label="Item">{result.item}</Row>
            <Row label="Campaign">{result.campaign}</Row>
            <Row label="Batch"><span className="num">{result.batch}</span></Row>
            <Row label="Authorized seller">{result.seller}</Row>
            <Row label="Item code"><span className="num">{result.serial}</span></Row>
            <Row label="Registered on">{dateOf(result.registeredAt)}</Row>
          </dl>

          {/* Warn if the seller on the order is not authorized */}
          {!result.authorized && (
            <div className="mx-5 mb-3 flex items-start gap-3 rounded-2xl border-2 border-[#B3123F] bg-[#fdf2f4] p-4">
              <AlertTriangle size={20} className="mt-0.5 shrink-0 text-[#B3123F]" aria-hidden="true" />
              <div>
                <p className="font-bold text-[#B3123F]">Seller not authorized</p>
                <p className="text-sm text-[#B3123F]/80">
                  "{result.seller}" is not on the studio's authorized seller list. The item code is
                  registered but may be a grey-market copy. Report the seller to the studio.
                </p>
              </div>
            </div>
          )}

          {result.authorized && (
            <div className="mx-5 mb-5 flex items-center gap-4 rounded-2xl border-2 border-ink bg-sun p-4">
              <Award size={32} className="shrink-0" aria-hidden="true" />
              <div>
                <p className="font-bold">Founding fan badge unlocked</p>
                <p className="text-sm">Earn more badges by joining events and sharing official finds.</p>
              </div>
            </div>
          )}
        </motion.section>
      )}

      {/* ── Not verified ── */}
      {!loading && result && !result.verified && (
        <motion.section
          key={code}
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          aria-live="polite"
          className="card-pop mt-8 overflow-hidden"
        >
          <div className="flex items-center gap-4 border-b-2 border-ink bg-bubble px-5 py-5">
            <span className="grid h-16 w-16 shrink-0 place-items-center rounded-full border-2 border-ink bg-white">
              <ShieldAlert size={34} aria-hidden="true" />
            </span>
            <div>
              <h2 className="font-pop text-2xl leading-tight">Doesn't check out</h2>
              <p className="text-sm">No registered item matches this code.</p>
            </div>
          </div>
          <div className="space-y-3 px-5 py-5">
            <p>
              We found nothing for{" "}
              <span className="num break-all font-bold">{code}</span>.
              Check the code under the QR for typos.
            </p>
            <p>If it still fails, treat the item as unverified and report the seller.</p>
            <p className="text-sm text-ink/75">
              Want a verified item?{" "}
              <Link to="/preorder" className="font-bold underline underline-offset-4">
                Make a preorder
              </Link>{" "}
              here, or try the demo code FL-DEMO-0001.
            </p>
          </div>
        </motion.section>
      )}
    </div>
  )
}
