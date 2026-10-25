import { useEffect, useRef, useState } from "react"
import { Link } from "react-router-dom"
import { AnimatePresence, motion } from "framer-motion"
import { ArrowLeft, AlertCircle, Check, Loader2 } from "lucide-react"
import {
  CITIES,
  LANGUAGES,
  FORMAT_LABELS,
  PRICE_BANDS,
  FORMAT_TO_BACKEND,
  PRICE_BAND_TO_AMOUNT,
  PLATFORM_OPTIONS,
  DEFAULT_CAMPAIGN_SLUG,
} from "../lib/formats"
import { addOptIn, getDeviceId } from "../lib/storage"
import { recordConsent, createPledge } from "../lib/api"
import ConsentBlock from "../components/ConsentBlock"
import GoalProgress from "../components/GoalProgress"
import { getCampaign } from "../lib/api"

const EMPTY = {
  city: "", language: "", format: "", priceBand: "", platforms: [],
  comment: "", consent: false, isMinor: false, guardianConsent: false,
}

const QUESTIONS = [
  { key: "city",      title: "Which city are you in?",            options: CITIES        },
  { key: "language",  title: "Which language do you want it in?", options: LANGUAGES     },
  { key: "format",    title: "What would you buy?",               options: FORMAT_LABELS },
  { key: "priceBand", title: "What would you pay?",               options: PRICE_BANDS   },
]
const LAST = QUESTIONS.length // index of final step (platforms + comment + consent)

export default function Vote() {
  const [step, setStep] = useState(0)
  const [form, setForm] = useState(EMPTY)
  const [done, setDone] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [apiError, setApiError] = useState(null)
  const [alreadyVoted, setAlreadyVoted] = useState(false)
  const [dir, setDir] = useState(1)
  const timer = useRef(null)
  const heading = useRef(null)
  // Keep one stable localOptin so retry preserves isMinor / guardianConsent
  const localOptinRef = useRef(null)
  // Campaign for GoalProgress
  const [campaign, setCampaign] = useState(null)

  useEffect(() => {
    getCampaign(DEFAULT_CAMPAIGN_SLUG)
      .then(setCampaign)
      .catch(() => {})
  }, [])

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

  const togglePlatform = (val) => {
    setForm((f) => ({
      ...f,
      platforms: f.platforms.includes(val)
        ? f.platforms.filter((p) => p !== val)
        : [...f.platforms, val],
    }))
  }

  const sendToBackend = async (lo) => {
    const backendFormat = FORMAT_TO_BACKEND[lo.format] ?? "TEE"
    const pricePaid = PRICE_BAND_TO_AMOUNT[lo.priceBand] ?? 299

    // Read ?ref= from sessionStorage (set by FanLayout)
    const source = sessionStorage.getItem("fandomloop_ref") || undefined

    const { pseudonymousId, consentId } = await recordConsent({
      identifier: lo.id,
      purpose: "fan-demand-signal",
      noticeVersion: "v1",
      ageConfirmed: !lo.isMinor,
      guardianConsent: lo.isMinor ? lo.guardianConsent : false,
    })

    await createPledge({
      campaignSlug: DEFAULT_CAMPAIGN_SLUG,
      consentId,
      pseudonymousId,
      city: lo.city,
      language: lo.language,
      format: backendFormat,
      pricePaid,
      comment: lo.comment || undefined,
      source,
      platforms: lo.platforms?.length ? lo.platforms : undefined,
    })
  }

  const submit = async (e) => {
    e.preventDefault()
    if (!form.consent) return

    setSubmitting(true)
    setApiError(null)
    setAlreadyVoted(false)

    // Build and cache the localOptin so retry reuses it unchanged
    if (!localOptinRef.current) {
      localOptinRef.current = {
        id: getDeviceId(),
        concept: "Monsoon Samurai",
        city: form.city,
        language: form.language,
        format: form.format,
        priceBand: form.priceBand,
        platforms: form.platforms,
        comment: form.comment.trim(),
        consent: true,
        isMinor: form.isMinor,
        guardianConsent: form.guardianConsent,
      }
    }
    addOptIn(localOptinRef.current)

    try {
      await sendToBackend(localOptinRef.current)
      setDone(true)
    } catch (err) {
      if (err.status === 409) {
        // Already voted — treat as success, not an error
        setAlreadyVoted(true)
        setDone(true)
        return
      }
      console.error("Backend vote sync failed:", err)
      setApiError(err?.message ?? "Could not reach the server. Check your connection.")
    } finally {
      setSubmitting(false)
    }
  }

  const retry = async () => {
    setSubmitting(true)
    setApiError(null)
    // Reuse cached localOptin — isMinor / guardianConsent are preserved
    try {
      await sendToBackend(localOptinRef.current)
      setDone(true)
    } catch (err) {
      if (err.status === 409) {
        setAlreadyVoted(true)
        setDone(true)
        return
      }
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
        <h1 ref={heading} tabIndex={-1} className="mt-8 font-pop text-4xl outline-none">
          Vote counted
        </h1>
        {alreadyVoted ? (
          <p className="mx-auto mt-3 max-w-sm text-lg">
            You've already voted on this drop. Your first vote still counts. 🙌
          </p>
        ) : (
          <p className="mx-auto mt-3 max-w-sm text-lg">
            The studio will see a {form.format.toLowerCase()} vote from {form.city}. If your
            city gets the go-ahead, you can preorder.
          </p>
        )}

        {/* GoalProgress on the done screen */}
        {campaign && (
          <div className="mx-auto mt-6 max-w-sm">
            <GoalProgress
              committedCount={campaign.committedCount ?? 0}
              minRun={campaign.minRun ?? 100}
              size="lg"
            />
          </div>
        )}

        <div className="mx-auto mt-8 flex max-w-xs flex-col gap-3">
          <Link to="/preorder" className="btn-pop">Preorder an item</Link>
          <button
            className="btn-pop light"
            onClick={() => {
              setForm(EMPTY)
              setStep(0)
              setDone(false)
              setApiError(null)
              setAlreadyVoted(false)
              localOptinRef.current = null
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
                Last step
              </h1>

              {/* Platform multi-select */}
              <fieldset className="mt-5">
                <legend className="font-bold">Where do you watch anime? <span className="font-normal text-ink/70">(optional)</span></legend>
                <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {PLATFORM_OPTIONS.map(({ value, label }) => {
                    const on = form.platforms.includes(value)
                    return (
                      <label
                        key={value}
                        className={`flex cursor-pointer items-center gap-2 rounded-xl border-2 border-ink px-3 py-2.5 text-sm font-bold has-[:focus-visible]:outline-[3px] has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ink ${
                          on ? "bg-bubble" : "bg-white shadow-pop-sm"
                        }`}
                      >
                        <input
                          type="checkbox"
                          value={value}
                          checked={on}
                          onChange={() => togglePlatform(value)}
                          className="sr-only"
                        />
                        <span
                          className={`h-4 w-4 shrink-0 rounded border-2 border-ink ${on ? "bg-ink" : "bg-white"}`}
                          aria-hidden="true"
                        />
                        {label}
                      </label>
                    )
                  })}
                </div>
              </fieldset>

              {/* Comment */}
              <label htmlFor="comment" className="mt-6 block font-bold">
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

              {/* Consent block */}
              <div className="mt-6">
                <ConsentBlock
                  form={form}
                  onChange={(patch) => setForm((f) => ({ ...f, ...patch }))}
                />
              </div>

              {/* API error banner */}
              {apiError && (
                <div
                  role="alert"
                  className="mt-4 flex items-start gap-3 rounded-2xl border-2 border-[#B3123F] bg-[#fdf2f4] p-4"
                >
                  <AlertCircle size={20} className="mt-0.5 shrink-0 text-[#B3123F]" aria-hidden="true" />
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
                        <><Loader2 size={20} className="animate-spin" aria-hidden="true" />Retrying…</>
                      ) : (
                        "Retry sending"
                      )}
                    </button>
                    <button
                      type="button"
                      className="btn-pop light w-full"
                      onClick={() => { setDone(true); setApiError(null) }}
                    >
                      Continue anyway
                    </button>
                  </>
                ) : (
                  <button
                    type="submit"
                    disabled={
                      !form.consent ||
                      submitting ||
                      (form.isMinor && !form.guardianConsent)
                    }
                    className="btn-pop w-full"
                  >
                    {submitting ? (
                      <><Loader2 size={20} className="animate-spin" aria-hidden="true" />Sending…</>
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
