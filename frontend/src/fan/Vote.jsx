import { useEffect, useRef, useState } from "react"
import { Link } from "react-router-dom"
import { AnimatePresence, motion } from "framer-motion"
import { ArrowLeft, AlertCircle, Check, Loader2 } from "lucide-react"
import { CONCEPT } from "../data/combos"
import {
  CITIES,
  LANGUAGES,
  FORMAT_LABELS,
  PRICE_BANDS,
  FORMAT_TO_BACKEND,
  PRICE_BAND_TO_AMOUNT,
} from "../lib/formats"
import { addOptIn } from "../lib/storage"
import { recordConsent, createPledge } from "../lib/api"

const EMPTY = { city: "", language: "", format: "", priceBand: "", comment: "", consent: false, ageConfirmed: false, isMinor: false, guardianConsent: false }

const QUESTIONS = [
  { key: "city",      title: "Which city are you in?",           options: CITIES        },
  { key: "language",  title: "Which language do you want it in?", options: LANGUAGES     },
  { key: "format",    title: "What would you buy?",              options: FORMAT_LABELS },
  { key: "priceBand", title: "What would you pay?",              options: PRICE_BANDS   },
]
const LAST = QUESTIONS.length // index of the final step (comment + consent)

export default function Vote() {
  const [step, setStep] = useState(0)
  const [form, setForm] = useState(EMPTY)
  const [done, setDone] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  // null = no error, string = show error, "retry" = show retry button
  const [apiError, setApiError] = useState(null)
  const [dir, setDir] = useState(1)
  const timer = useRef(null)
  const heading = useRef(null)

  useEffect(() => () => clearTimeout(timer.current), [])
  useEffect(() => { heading.current?.focus({ preventScroll: true }) }, [step, done])

  const go = (n) => {
    setDir(n > step ? 1 : -1)
    setStep(n)
  }

  const pick = (key, value) => {
    setForm((f) => ({ ...f, [key]: value }))
    clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      setDir(1)
      setStep((s) => s + 1)
    }, 220)
  }

  const sendToBackend = async (localOptin) => {
    const backendFormat = FORMAT_TO_BACKEND[localOptin.format] ?? "TEE"
    const pricePaid = PRICE_BAND_TO_AMOUNT[localOptin.priceBand] ?? 299

    const { pseudonymousId, consentId } = await recordConsent({
      identifier: localOptin.id, // random anon ID — never stored raw by the backend
      purpose: "fan-demand-signal",
      noticeVersion: "v1",
      ageConfirmed: !localOptin.isMinor,           // true if they ticked "18 or over"
      guardianConsent: localOptin.isMinor ? localOptin.guardianConsent : false,
    })

    await createPledge({
      campaignSlug: "skyblade-chronicles",
      consentId,
      pseudonymousId,
      city: localOptin.city,
      language: localOptin.language,
      format: backendFormat,
      pricePaid,
      comment: localOptin.comment || undefined,
    })
  }

  const submit = async (e) => {
    e.preventDefault()
    if (!form.consent) return

    setSubmitting(true)
    setApiError(null)

    // Always persist locally first so the vote is never lost
    const localOptin = {
      id: `anon-${Math.random().toString(36).slice(2, 10)}`,
      concept: CONCEPT,
      city: form.city,
      language: form.language,
      format: form.format,
      priceBand: form.priceBand,
      comment: form.comment.trim(),
      consent: true,
      isMinor: form.isMinor,
      guardianConsent: form.guardianConsent,
    }
    addOptIn(localOptin)

    try {
      await sendToBackend(localOptin)
      setDone(true)
    } catch (err) {
      // Vote is already saved locally. Show a clear error with a retry option
      // so the fan knows what happened and can try again.
      console.error("Backend vote sync failed:", err)
      setApiError(err?.message ?? "Could not reach the server. Check your connection.")
    } finally {
      setSubmitting(false)
    }
  }

  const retry = async () => {
    setSubmitting(true)
    setApiError(null)
    // Reconstruct localOptin from current form state (already in localStorage)
    const localOptin = {
      id: `anon-${Math.random().toString(36).slice(2, 10)}`,
      concept: CONCEPT,
      city: form.city,
      language: form.language,
      format: form.format,
      priceBand: form.priceBand,
      comment: form.comment.trim(),
      consent: true,
    }
    try {
      await sendToBackend(localOptin)
      setDone(true)
    } catch (err) {
      setApiError(err?.message ?? "Still could not reach the server.")
    } finally {
      setSubmitting(false)
    }
  }

  if (done) {
    return (
      <div className="py-6 text-center">
        <motion.div
          initial={{ scale: 0.4, rotate: -20, opacity: 0 }}
          animate={{ scale: 1, rotate: -4, opacity: 1 }}
          transition={{ type: "spring", stiffness: 380, damping: 16 }}
          className="mx-auto grid h-28 w-28 place-items-center rounded-full border-2 border-ink bg-mint shadow-pop"
        >
          <Check size={56} strokeWidth={3} aria-hidden="true" />
        </motion.div>
        <h1 ref={heading} tabIndex={-1} className="mt-8 font-pop text-4xl outline-none">Vote counted</h1>
        <p className="mx-auto mt-3 max-w-sm text-lg">
          The studio will see a {form.format.toLowerCase()} vote from {form.city}. If your city gets
          the go-ahead, you can preorder.
        </p>
        <div className="mx-auto mt-8 flex max-w-xs flex-col gap-3">
          <Link to="/preorder" className="btn-pop">Preorder an item</Link>
          <button
            className="btn-pop light"
            onClick={() => {
              setForm(EMPTY)
              setStep(0)
              setDone(false)
              setApiError(null)
            }}
          >
            Vote again
          </button>
        </div>
      </div>
    )
  }

  const q = QUESTIONS[step]

  return (
    <div>
      <div className="flex items-center gap-3">
        <button
          onClick={() => go(step - 1)}
          disabled={step === 0}
          aria-label="Previous question"
          className="grid h-11 w-11 shrink-0 place-items-center rounded-full border-2 border-ink bg-white disabled:opacity-30"
        >
          <ArrowLeft size={20} aria-hidden="true" />
        </button>
        <div
          role="progressbar"
          aria-valuemin={1}
          aria-valuemax={LAST + 1}
          aria-valuenow={step + 1}
          aria-label={`Question ${step + 1} of ${LAST + 1}`}
          className="flex flex-1 gap-1.5"
        >
          {Array.from({ length: LAST + 1 }).map((_, i) => (
            <span
              key={i}
              className={`h-3 flex-1 rounded-full border-2 border-ink ${i <= step ? "bg-bubble" : "bg-white"}`}
            />
          ))}
        </div>
      </div>

      <AnimatePresence mode="wait" custom={dir}>
        <motion.div
          key={step}
          custom={dir}
          initial={{ opacity: 0, x: 40 * dir }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -40 * dir }}
          transition={{ duration: 0.18 }}
          className="mt-8"
        >
          {q ? (
            <fieldset>
              <legend
                ref={heading}
                tabIndex={-1}
                className="font-pop text-3xl leading-tight outline-none sm:text-4xl"
              >
                {q.title}
              </legend>
              <div className="mt-6 grid grid-cols-2 gap-3">
                {q.options.map((o) => {
                  const on = form[q.key] === o
                  return (
                    <label
                      key={o}
                      className={`flex min-h-[3.75rem] cursor-pointer items-center justify-center rounded-2xl border-2 border-ink px-3 py-3 text-center text-lg font-bold has-[:focus-visible]:outline-[3px] has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ink ${
                        on
                          ? "bg-bubble shadow-none translate-x-[2px] translate-y-[2px]"
                          : "bg-white shadow-pop-sm"
                      }`}
                    >
                      <input
                        type="radio"
                        name={q.key}
                        value={o}
                        checked={on}
                        onChange={() => pick(q.key, o)}
                        className="sr-only"
                      />
                      {o}
                    </label>
                  )
                })}
              </div>
              {form[q.key] && (
                <button type="button" onClick={() => go(step + 1)} className="btn-pop mt-6 w-full">
                  Next
                </button>
              )}
            </fieldset>
          ) : (
            <form onSubmit={submit}>
              <h1
                ref={heading}
                tabIndex={-1}
                className="font-pop text-3xl leading-tight outline-none sm:text-4xl"
              >
                Anything else the studio should know?
              </h1>
              <label htmlFor="comment" className="mt-5 block font-bold">
                What would make you buy this?{" "}
                <span className="font-normal text-ink/70">(optional, any language)</span>
              </label>
              <textarea
                id="comment"
                rows={3}
                maxLength={280}
                value={form.comment}
                onChange={(e) => setForm((f) => ({ ...f, comment: e.target.value }))}
                placeholder="A Hindi dub, official merch, a lower price"
                className="mt-2 w-full rounded-2xl border-2 border-ink bg-white p-4 text-lg placeholder:text-ink/50"
              />

              <label className="card-pop mt-6 flex cursor-pointer items-start gap-3 p-4 text-base">
                <input
                  type="checkbox"
                  checked={form.consent}
                  onChange={(e) => setForm((f) => ({ ...f, consent: e.target.checked }))}
                  className="mt-0.5 h-6 w-6 shrink-0 accent-bubble"
                />
                <span>
                  I agree to share this vote anonymously with the studio. My name and phone number
                  are not saved.
                </span>
              </label>

              {/* Age confirmation — required by DPDPA */}
              <div className="card-pop mt-3 space-y-3 p-4 text-base">
                <label className="flex cursor-pointer items-start gap-3">
                  <input
                    type="checkbox"
                    checked={!form.isMinor}
                    onChange={(e) => setForm((f) => ({
                      ...f,
                      isMinor: !e.target.checked,
                      guardianConsent: false,
                    }))}
                    className="mt-0.5 h-6 w-6 shrink-0 accent-bubble"
                  />
                  <span>I am 18 years old or above.</span>
                </label>
                {form.isMinor && (
                  <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-ink/20 bg-sun/30 p-3 text-sm">
                    <input
                      type="checkbox"
                      checked={form.guardianConsent}
                      onChange={(e) => setForm((f) => ({ ...f, guardianConsent: e.target.checked }))}
                      className="mt-0.5 h-5 w-5 shrink-0 accent-bubble"
                    />
                    <span>
                      A parent or guardian has consented on my behalf and agrees to this data being
                      shared anonymously with the studio.
                    </span>
                  </label>
                )}
              </div>

              {/* API error banner — shown when backend returns an error */}
              {apiError && (
                <div
                  role="alert"
                  className="mt-4 flex items-start gap-3 rounded-2xl border-2 border-[#B3123F] bg-[#fdf2f4] p-4"
                >
                  <AlertCircle
                    size={20}
                    className="mt-0.5 shrink-0 text-[#B3123F]"
                    aria-hidden="true"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-[#B3123F]">Could not send your vote</p>
                    <p className="mt-1 text-sm text-[#B3123F]/80">{apiError}</p>
                    <p className="mt-1 text-sm text-ink/70">
                      Your vote has been saved on this device. You can retry now or come back later.
                    </p>
                  </div>
                </div>
              )}

              <div className="mt-6 flex flex-col gap-3">
                {apiError ? (
                  <>
                    <button
                      type="button"
                      onClick={retry}
                      disabled={submitting}
                      className="btn-pop w-full"
                    >
                      {submitting ? (
                        <>
                          <Loader2 size={20} className="animate-spin" aria-hidden="true" />
                          Retrying…
                        </>
                      ) : (
                        "Retry sending"
                      )}
                    </button>
                    <button
                      type="button"
                      className="btn-pop light w-full"
                      onClick={() => {
                        setDone(true)
                        setApiError(null)
                      }}
                    >
                      Continue anyway
                    </button>
                  </>
                ) : (
                  <button
                    type="submit"
                    disabled={!form.consent || submitting || (form.isMinor && !form.guardianConsent)}
                    className="btn-pop w-full"
                  >
                    {submitting ? (
                      <>
                        <Loader2 size={20} className="animate-spin" aria-hidden="true" />
                        Sending…
                      </>
                    ) : (
                      "Send my vote"
                    )}
                  </button>
                )}
              </div>
              {!form.consent && !apiError && (
                <p className="mt-3 text-center text-sm text-ink/70">
                  Tick the boxes above to send your vote.
                </p>
              )}
            </form>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  )
}
