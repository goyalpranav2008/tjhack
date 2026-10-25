import { useEffect, useRef, useState } from "react"
import { Link } from "react-router-dom"
import { motion } from "framer-motion"
import { BookOpen, ChevronDown, ChevronUp, Loader2, RefreshCw, Shirt, Ticket, Package } from "lucide-react"
import { QRCodeSVG } from "qrcode.react"
import {
  getCampaigns,
  recordConsent,
  createPledge,
  preauthorizePledge,
  getPledgeOrder,
} from "../lib/api"
import { FORMAT_TO_BACKEND } from "../lib/formats"
import { inr } from "../lib/format"
import {
  getDeviceId,
  getPseudonymousId,
  setPseudonymousId,
  addReservation,
  getReservations,
} from "../lib/storage"
import ConsentBlock from "../components/ConsentBlock"
import GoalProgress from "../components/GoalProgress"

const ICONS = { TEE: Shirt, EVENT: Ticket, CHAPTER: BookOpen, POSTER: Package }
const TINTS  = { TEE: "bg-sun", EVENT: "bg-sky", CHAPTER: "bg-mint", POSTER: "bg-bubble" }

function verifyUrl(serial) {
  return `${window.location.origin}/verify/${encodeURIComponent(serial)}`
}

const dateOf = (iso) =>
  new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })

// ── My Reservations ────────────────────────────────────────────────────────
function ReservationCard({ reservation }) {
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getPledgeOrder(reservation.pledgeId, reservation.pseudonymousId)
      .then(setResult)
      .catch(() => setResult({ status: "unknown" }))
      .finally(() => setLoading(false))
  }, [reservation.pledgeId, reservation.pseudonymousId])

  const label = loading ? "Checking…"
    : result?.order ? "Confirmed"
    : result?.status === "RELEASED" ? "Released"
    : "Waiting"

  const tint = result?.order ? "bg-mint" : result?.status === "RELEASED" ? "bg-bubble" : "bg-sun/40"

  return (
    <div className={`card-pop overflow-hidden`}>
      <div className={`border-b-2 border-ink px-4 py-3 ${tint}`}>
        <div className="flex items-center justify-between gap-3">
          <p className="font-bold">{reservation.campaignSlug}</p>
          {loading
            ? <Loader2 size={16} className="animate-spin" aria-hidden="true" />
            : <span className="rounded-full border-2 border-ink bg-white px-2 py-0.5 text-xs font-bold">{label}</span>
          }
        </div>
      </div>
      <div className="px-4 py-4 text-sm">
        {loading && <p className="text-ink/60">Loading order status…</p>}

        {!loading && result?.status === "RELEASED" && (
          <p>This campaign didn't reach its goal. No charge was made.</p>
        )}

        {!loading && !result?.order && result?.status !== "RELEASED" && (
          <p className="text-ink/70">
            Not enough fans yet. You'll be charged only if the goal is reached.
          </p>
        )}

        {!loading && result?.order && (
          <div className="flex flex-col items-center gap-3">
            <QRCodeSVG
              value={verifyUrl(result.order.serial)}
              size={144}
              bgColor="#ffffff"
              fgColor="#1e1b4b"
            />
            <p className="num text-lg font-bold">{result.order.serial}</p>
            <p className="text-center text-xs text-ink/70">
              Scan when your item arrives to check it's official.
            </p>
            <Link
              to={`/verify/${encodeURIComponent(result.order.serial)}`}
              className="btn-pop w-full text-center"
            >
              Check now
            </Link>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────

export default function Preorder() {
  // campaigns from backend — only TESTING status
  const [campaigns, setCampaigns] = useState([])
  const [campaignsLoading, setCampaignsLoading] = useState(true)
  const [selectedSlug, setSelectedSlug] = useState(null)

  // form state
  const [form, setForm] = useState({ consent: false, isMinor: false, guardianConsent: false })
  const [step, setStep] = useState("choose") // choose | paying | paid
  const [order, setOrder] = useState(null)
  const [error, setError] = useState("")
  const timer = useRef(null)

  // my reservations
  const [reservations, setReservations] = useState(() => getReservations())
  const [showReservations, setShowReservations] = useState(reservations.length > 0)

  useEffect(() => () => clearTimeout(timer.current), [])

  useEffect(() => {
    setCampaignsLoading(true)
    getCampaigns()
      .then((data) => {
        const testing = data.filter((c) => c.status === "TESTING")
        setCampaigns(testing)
        if (testing.length > 0 && !selectedSlug) {
          setSelectedSlug(testing[0].slug)
        }
      })
      .catch(() => {})
      .finally(() => setCampaignsLoading(false))
  }, [])

  const selectedCampaign = campaigns.find((c) => c.slug === selectedSlug)

  const pay = async (e) => {
    e.preventDefault()
    if (!form.consent) return
    if (!selectedCampaign) return
    if (form.isMinor && !form.guardianConsent) return

    setError("")
    setStep("paying")

    // Brief payment animation, then backend calls
    timer.current = setTimeout(async () => {
      try {
        const source = sessionStorage.getItem("fandomloop_ref") || undefined

        // 1. Record consent using stable device ID
        const deviceId = getDeviceId()
        const { pseudonymousId, consentId } = await recordConsent({
          identifier: deviceId,
          purpose: "preorder",
          noticeVersion: "v1",
          ageConfirmed: !form.isMinor,
          guardianConsent: form.isMinor ? form.guardianConsent : false,
        })
        setPseudonymousId(pseudonymousId)

        // 2. Create pledge
        const { pledge } = await createPledge({
          campaignSlug: selectedCampaign.slug,
          consentId,
          pseudonymousId,
          city: "Other city",  // preorder doesn't ask city again
          language: "Other language",
          format: selectedCampaign.format,
          pricePaid: selectedCampaign.listPrice,
          source,
        })

        // 3. Preauthorize (mock UPI mandate)
        await preauthorizePledge(pledge.id)

        // 4. Save reservation — serial arrives only after settle
        const res = { pledgeId: pledge.id, pseudonymousId, campaignSlug: selectedCampaign.slug }
        const updated = addReservation(res)
        setReservations(updated)

        setOrder({ campaignSlug: selectedCampaign.slug, pledgeId: pledge.id, pseudonymousId })
        setStep("paid")
      } catch (err) {
        if (err.status === 409) {
          // Already pledged this campaign
          setError("You've already reserved this drop. Check 'My reservations' below.")
          setStep("choose")
          return
        }
        setError(err?.message ?? "Something went wrong. Please try again.")
        setStep("choose")
      }
    }, 1400)
  }

  // ── Paid screen ──────────────────────────────────────────────────────────
  if (step === "paid" && order) {
    return (
      <div className="text-center">
        <motion.h1
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="font-pop text-4xl"
        >
          Reserved!
        </motion.h1>
        <p className="mt-2 text-lg">
          You are not charged unless the goal is reached.
        </p>

        {selectedCampaign && (
          <div className="mx-auto mt-6 max-w-sm">
            <GoalProgress
              committedCount={selectedCampaign.committedCount ?? 0}
              minRun={selectedCampaign.minRun ?? 100}
              size="lg"
            />
          </div>
        )}

        <motion.div
          initial={{ opacity: 0, y: 24, rotate: 2 }}
          animate={{ opacity: 1, y: 0, rotate: 0 }}
          transition={{ type: "spring", stiffness: 240, damping: 20, delay: 0.1 }}
          className="card-pop mx-auto mt-8 max-w-sm p-5 text-left"
        >
          <p className="font-bold">{selectedCampaign?.title ?? order.campaignSlug}</p>
          <p className="mt-2 text-sm text-ink/70">
            Your serial will appear in <strong>My reservations</strong> once the campaign is settled.
            We'll charge your UPI only if the studio decides to go ahead.
          </p>
        </motion.div>

        <div className="mx-auto mt-8 flex max-w-sm flex-col gap-3">
          <button
            className="btn-pop"
            onClick={() => {
              setShowReservations(true)
              window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" })
            }}
          >
            View my reservations
          </button>
          <button
            className="btn-pop light"
            onClick={() => { setStep("choose"); setOrder(null); setForm({ consent: false, isMinor: false, guardianConsent: false }) }}
          >
            Reserve another item
          </button>
        </div>
      </div>
    )
  }

  // ── Choose + pay screen ──────────────────────────────────────────────────
  return (
    <div>
      <h1 className="font-pop text-4xl leading-tight">Preorder an official item</h1>
      <p className="mt-3 text-lg">
        Each item comes with a code you can scan to check it. You are only charged if the studio
        goes ahead.
      </p>

      {campaignsLoading && (
        <div className="mt-8 flex items-center gap-2 text-ink/60">
          <RefreshCw size={16} className="animate-spin" aria-hidden="true" />
          Loading available items…
        </div>
      )}

      {!campaignsLoading && campaigns.length === 0 && (
        <p className="mt-8 rounded-2xl border-2 border-ink/20 bg-sun/20 p-5 text-ink/70">
          No items are open for preorder right now. Vote first and come back when your city
          gets the go-ahead!
        </p>
      )}

      {campaigns.length > 0 && (
        <form onSubmit={pay} noValidate>
          <fieldset className="mt-7">
            <legend className="mb-3 font-bold">Pick your item</legend>
            <div className="space-y-3">
              {campaigns.map((c) => {
                const Icon = ICONS[c.format] ?? Shirt
                const on = c.slug === selectedSlug
                return (
                  <label
                    key={c.slug}
                    className={`flex cursor-pointer items-center gap-4 rounded-2xl border-2 border-ink p-3 has-[:focus-visible]:outline-[3px] has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ink ${
                      on ? "translate-x-[2px] translate-y-[2px] bg-white ring-4 ring-bubble" : "bg-white shadow-pop-sm"
                    }`}
                  >
                    <input
                      type="radio"
                      name="campaign"
                      value={c.slug}
                      checked={on}
                      onChange={() => setSelectedSlug(c.slug)}
                      className="sr-only"
                    />
                    <span className={`grid h-14 w-14 shrink-0 place-items-center rounded-xl border-2 border-ink ${TINTS[c.format] ?? "bg-sun"}`}>
                      <Icon size={26} aria-hidden="true" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-lg font-bold leading-tight">{c.title}</span>
                      <span className="block text-sm text-ink/75">{c.format}</span>
                      {/* Goal progress inline */}
                      <div className="mt-1">
                        <GoalProgress
                          committedCount={c.committedCount ?? 0}
                          minRun={c.minRun ?? 100}
                        />
                      </div>
                    </span>
                    <span className="num text-xl font-bold">{inr(c.listPrice)}</span>
                  </label>
                )
              })}
            </div>
          </fieldset>

          {/* Consent */}
          <div className="mt-7">
            <ConsentBlock
              form={form}
              onChange={(patch) => setForm((f) => ({ ...f, ...patch }))}
            />
          </div>

          {error && (
            <p role="alert" className="mt-4 font-bold text-[#B3123F]">{error}</p>
          )}

          <button
            type="submit"
            disabled={
              step === "paying" ||
              !form.consent ||
              (form.isMinor && !form.guardianConsent) ||
              !selectedCampaign
            }
            className="btn-pop mt-6 w-full"
          >
            {step === "paying" ? (
              <><Loader2 size={20} className="animate-spin" aria-hidden="true" />Confirming…</>
            ) : (
              `Reserve ${selectedCampaign ? inr(selectedCampaign.listPrice) : ""}`
            )}
          </button>
          <p className="mt-3 text-center text-sm text-ink/70">
            Payment is simulated. No money moves until the goal is reached.
          </p>
        </form>
      )}

      {/* My reservations */}
      {reservations.length > 0 && (
        <section className="mt-10">
          <button
            className="flex w-full items-center justify-between gap-3 rounded-2xl border-2 border-ink bg-white px-5 py-4 font-bold shadow-pop-sm"
            onClick={() => setShowReservations((v) => !v)}
            aria-expanded={showReservations}
          >
            <span>My reservations ({reservations.length})</span>
            {showReservations ? <ChevronUp size={20} aria-hidden="true" /> : <ChevronDown size={20} aria-hidden="true" />}
          </button>
          {showReservations && (
            <div className="mt-4 space-y-4">
              {reservations.map((r) => (
                <ReservationCard key={r.pledgeId} reservation={r} />
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  )
}
