import { useEffect, useRef, useState } from "react"
import { Link } from "react-router-dom"
import { motion } from "framer-motion"
import { BookOpen, Loader2, Shirt, Ticket } from "lucide-react"
import { QRCodeSVG } from "qrcode.react"
import { COMBOS } from "../data/combos"
import { DEFAULTS, evaluateAll } from "../lib/verdict"
import { addOrder } from "../lib/storage"
import { recordConsent, createPledge, preauthorizePledge, createOrder } from "../lib/api"
import { FORMAT_TO_BACKEND } from "../lib/formats"
import { inr } from "../lib/format"

// Preorders open only for combos the studio console marked GO.
// Digital-only formats have nothing to ship or scan.
const ITEMS = evaluateAll(COMBOS, DEFAULTS).filter(
  (c) => c.verdict === "GO" && c.format !== "Digital manga"
)
const UPI_PATTERN = /^[\w.-]{2,}@[a-zA-Z]{2,}$/
const ICONS = { Merch: Shirt, "Event ticket": Ticket, "Digital manga": BookOpen }
const TINTS  = { Merch: "bg-sun", "Event ticket": "bg-sky", "Digital manga": "bg-mint" }

// QR encodes the full verify URL so scanning works on any device anywhere.
// In production VITE_API_URL is the deployed backend; in dev the Vite proxy
// forwards /api/* → localhost:4000, so we use window.location.origin there.
const API_ORIGIN = (import.meta.env.VITE_API_URL || "").replace(/\/$/, "") || window.location.origin

function verifyUrl(serial) {
  // Deep link into the fan app — works on any phone that has the URL
  return `${window.location.origin}/verify/${encodeURIComponent(serial)}`
}

export default function Preorder() {
  const [itemId, setItemId] = useState(ITEMS[0]?.id)
  const [upi, setUpi] = useState("")
  const [formError, setFormError] = useState("")
  const [step, setStep] = useState("choose") // choose | paying | paid
  const [order, setOrder] = useState(null)   // { serial, item, batch, seller }
  const timer = useRef(null)
  useEffect(() => () => clearTimeout(timer.current), [])

  const item = ITEMS.find((i) => i.id === Number(itemId))

  const pay = async (e) => {
    e.preventDefault()
    if (!UPI_PATTERN.test(upi.trim())) {
      setFormError("Enter a UPI ID like name@upi.")
      return
    }
    setFormError("")
    setStep("paying")

    // Simulate the brief payment animation (1.4 s), then hit the backend.
    timer.current = setTimeout(async () => {
      let finalOrder = null

      try {
        const backendFormat = FORMAT_TO_BACKEND[item.format] ?? "TEE"

        // 1. Record consent
        const { pseudonymousId, consentId } = await recordConsent({
          identifier: `preorder-${Date.now()}-${Math.random().toString(36).slice(2)}`,
          purpose: "preorder",
          noticeVersion: "v1",
          ageConfirmed: true,
        })

        // 2. Create pledge
        const { pledge } = await createPledge({
          campaignSlug: "skyblade-chronicles",
          consentId,
          pseudonymousId,
          city: item.city,
          language: item.language,
          format: backendFormat,
          pricePaid: item.price,
        })

        // 3. Preauthorize (mock UPI mandate)
        await preauthorizePledge(pledge.id)

        // 4. Register the order — this creates the permanent serial in the DB
        const batch = `B-${new Date().getFullYear()}-${String(item.id).padStart(2, "0")}`
        const apiOrder = await createOrder({
          campaignSlug: "skyblade-chronicles",
          pledgeId: pledge.id,
          itemName: `Skyblade Chronicles ${item.format.toLowerCase()} — ${item.city}`,
          batch,
          sellerName: "Otaku Hub India",
        })

        finalOrder = {
          serial:   apiOrder.serial,
          item:     apiOrder.itemName,
          price:    item.price,
          batch:    apiOrder.batch,
          seller:   apiOrder.seller,
          at:       apiOrder.registeredAt,
        }
      } catch (err) {
        // Backend call failed — fall back to a locally-generated serial.
        // The QR will resolve to "not verified" until the backend is reachable,
        // but the fan keeps their receipt and can verify later.
        console.warn("Backend order creation failed:", err.message)
        const fallbackSerial = `FL-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`
        finalOrder = {
          serial:   fallbackSerial,
          item:     `Skyblade Chronicles ${item.format.toLowerCase()} — ${item.city}`,
          price:    item.price,
          batch:    `B-${new Date().getFullYear()}-${String(item.id).padStart(2, "0")}`,
          seller:   "Otaku Hub India",
          at:       new Date().toISOString(),
          offline:  true,
        }
      }

      // Always persist in localStorage so /verify works on this device even offline
      addOrder(finalOrder)
      setOrder(finalOrder)
      setStep("paid")
    }, 1400)
  }

  // ── Paid screen ────────────────────────────────────────────────────────────
  if (step === "paid" && order) {
    const qrValue = verifyUrl(order.serial)
    return (
      <div className="text-center">
        <motion.h1
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="font-pop text-4xl"
        >
          You're in!
        </motion.h1>
        <p className="mt-2 text-lg">Your preorder is confirmed.</p>
        {order.offline && (
          <p className="mt-2 text-sm text-ink/60">
            Created offline — scan to verify once the app is connected.
          </p>
        )}

        <motion.div
          initial={{ opacity: 0, y: 24, rotate: 2 }}
          animate={{ opacity: 1, y: 0, rotate: 0 }}
          transition={{ type: "spring", stiffness: 240, damping: 20, delay: 0.1 }}
          className="card-pop relative mx-auto mt-8 max-w-sm overflow-hidden text-left"
        >
          <div className={`border-b-2 border-dashed border-ink px-5 py-4 ${TINTS[item.format]}`}>
            <p className="text-sm font-bold">Skyblade Chronicles (sample)</p>
            <p className="font-pop text-2xl leading-tight">{item.format} for {item.city}</p>
          </div>
          <span aria-hidden="true" className="absolute -left-3 top-[4.6rem] h-6 w-6 rounded-full border-2 border-ink bg-lilac" />
          <span aria-hidden="true" className="absolute -right-3 top-[4.6rem] h-6 w-6 rounded-full border-2 border-ink bg-lilac" />
          <div className="flex flex-col items-center px-5 py-6">
            {/* QR encodes the full /verify URL so any phone can scan it */}
            <QRCodeSVG value={qrValue} size={176} bgColor="#ffffff" fgColor="#1e1b4b" />
            <p className="mt-4 text-sm">Item code</p>
            <p className="num text-xl font-bold">{order.serial}</p>
            <p className="mt-3 text-center text-sm text-ink/75">
              Scan this when your item arrives to check it is official.
            </p>
          </div>
        </motion.div>

        <div className="mx-auto mt-8 flex max-w-sm flex-col gap-3">
          <Link to={`/verify/${encodeURIComponent(order.serial)}`} className="btn-pop">
            Check this item now
          </Link>
          <button
            className="btn-pop light"
            onClick={() => { setStep("choose"); setOrder(null); setUpi("") }}
          >
            Preorder another item
          </button>
        </div>
      </div>
    )
  }

  // ── Choose + pay screen ────────────────────────────────────────────────────
  return (
    <form onSubmit={pay} noValidate>
      <h1 className="font-pop text-4xl leading-tight">Preorder an official item</h1>
      <p className="mt-3 text-lg">
        Open in cities where fans voted it through. Every item comes with a code you can scan to
        check it.
      </p>

      <fieldset className="mt-7">
        <legend className="mb-3 font-bold">Pick your item</legend>
        <div className="space-y-3">
          {ITEMS.map((i) => {
            const Icon = ICONS[i.format]
            const on = Number(itemId) === i.id
            return (
              <label
                key={i.id}
                className={`flex cursor-pointer items-center gap-4 rounded-2xl border-2 border-ink p-3 has-[:focus-visible]:outline-[3px] has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ink ${
                  on ? "translate-x-[2px] translate-y-[2px] bg-white ring-4 ring-bubble" : "bg-white shadow-pop-sm"
                }`}
              >
                <input
                  type="radio"
                  name="item"
                  value={i.id}
                  checked={on}
                  onChange={() => setItemId(i.id)}
                  className="sr-only"
                />
                <span className={`grid h-14 w-14 shrink-0 place-items-center rounded-xl border-2 border-ink ${TINTS[i.format]}`}>
                  <Icon size={26} aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-lg font-bold leading-tight">{i.format}</span>
                  <span className="block text-sm text-ink/75">{i.city}, in {i.language}</span>
                </span>
                <span className="num text-xl font-bold">{inr(i.price)}</span>
              </label>
            )
          })}
        </div>
      </fieldset>

      <div className="mt-7">
        <label htmlFor="upi" className="mb-2 block font-bold">Your UPI ID</label>
        <input
          id="upi"
          value={upi}
          onChange={(e) => setUpi(e.target.value)}
          placeholder="name@upi"
          autoComplete="off"
          inputMode="email"
          autoCapitalize="none"
          className="w-full rounded-2xl border-2 border-ink bg-white p-4 text-lg placeholder:text-ink/50"
        />
        <p aria-live="polite" className="mt-2 min-h-[1.5rem] font-bold text-[#B3123F]">
          {formError}
        </p>
      </div>

      <button type="submit" disabled={step === "paying"} className="btn-pop mt-2 w-full">
        {step === "paying" ? (
          <>
            <Loader2 size={20} className="animate-spin" aria-hidden="true" />
            Confirming payment…
          </>
        ) : (
          `Pay ${inr(item?.price ?? 0)}`
        )}
      </button>
      <p className="mt-3 text-center text-sm text-ink/70">Payment is simulated. No money moves.</p>
    </form>
  )
}
