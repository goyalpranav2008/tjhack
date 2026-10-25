import { useState } from "react"
import { Link } from "react-router-dom"
import { motion } from "framer-motion"
import { Check, Loader2, ShieldCheck } from "lucide-react"
import { withdrawConsent } from "../lib/api"
import { getPseudonymousId } from "../lib/storage"

export default function Privacy() {
  const [withdrawing, setWithdrawing] = useState(false)
  const [withdrawn, setWithdrawn] = useState(false)
  const [error, setError] = useState("")

  const handleWithdraw = async () => {
    const pid = getPseudonymousId()
    if (!pid) {
      setError("No vote data found on this device.")
      return
    }
    setWithdrawing(true)
    setError("")
    try {
      await withdrawConsent(pid)
      setWithdrawn(true)
    } catch (err) {
      setError(err?.message ?? "Could not process your request. Please try again.")
    } finally {
      setWithdrawing(false)
    }
  }

  return (
    <div className="space-y-8">
      <div className="card-pop p-6">
        <div className="flex items-center gap-3">
          <ShieldCheck size={32} aria-hidden="true" />
          <h1 className="font-pop text-3xl">Privacy & your data</h1>
        </div>

        <section className="mt-6 space-y-4 text-base leading-relaxed">
          <div>
            <h2 className="font-bold">What we collect</h2>
            <ul className="mt-2 list-inside list-disc space-y-1 text-ink/80">
              <li>Your city, preferred language, format, and price range</li>
              <li>An anonymous ID derived from your device (no name or phone number)</li>
              <li>An optional comment about what you would want from the studio</li>
            </ul>
          </div>

          <div>
            <h2 className="font-bold">Why we collect it</h2>
            <p className="mt-1 text-ink/80">
              Your vote tells the studio where fans in India want to see this title launched. It
              is shared in aggregate — your individual vote is anonymised before any report is sent.
            </p>
          </div>

          <div>
            <h2 className="font-bold">Your rights (DPDPA 2023)</h2>
            <p className="mt-1 text-ink/80">
              Under India's Digital Personal Data Protection Act you can withdraw your consent at
              any time. Your vote will be removed from our active counts.
            </p>
          </div>
        </section>
      </div>

      {/* Withdraw section */}
      <div className="card-pop p-6">
        <h2 className="font-pop text-2xl">Withdraw my data</h2>
        <p className="mt-2 text-base text-ink/80">
          This removes your votes from our counts. It cannot be undone.
        </p>

        {withdrawn ? (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-5 flex items-center gap-3 rounded-2xl border-2 border-ink bg-mint p-4"
          >
            <Check size={24} aria-hidden="true" />
            <p className="font-bold">Done. Your data has been removed from our active counts.</p>
          </motion.div>
        ) : (
          <div className="mt-5 space-y-4">
            {error && (
              <p role="alert" className="font-bold text-[#B3123F]">{error}</p>
            )}
            <button
              onClick={handleWithdraw}
              disabled={withdrawing}
              className="btn-pop w-full"
            >
              {withdrawing ? (
                <><Loader2 size={20} className="animate-spin" aria-hidden="true" />Withdrawing…</>
              ) : (
                "Withdraw my data"
              )}
            </button>
            <p className="text-sm text-ink/70">
              If you voted on multiple devices, you'll need to withdraw on each one.
            </p>
          </div>
        )}
      </div>

      <p className="text-center text-sm text-ink/70">
        <Link to="/" className="font-bold underline underline-offset-4">← Back to home</Link>
      </p>
    </div>
  )
}
