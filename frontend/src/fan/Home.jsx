import { useEffect, useState } from "react"
import { Link } from "react-router-dom"
import { motion } from "framer-motion"
import { BadgeCheck, ChevronRight, ShoppingBag } from "lucide-react"
import { getCampaign } from "../lib/api"
import { DEFAULT_CAMPAIGN_SLUG } from "../lib/formats"
import { num } from "../lib/format"
import GoalProgress from "../components/GoalProgress"

export default function Home() {
  const [campaign, setCampaign] = useState(null)

  useEffect(() => {
    getCampaign(DEFAULT_CAMPAIGN_SLUG)
      .then(setCampaign)
      .catch(() => {})
  }, [])

  const title = campaign?.title ?? "Monsoon Samurai"
  const optInCount = campaign?.optInCount ?? 0
  const committedCount = campaign?.committedCount ?? 0
  const minRun = campaign?.minRun ?? 100

  return (
    <div className="space-y-8">
      <motion.section
        initial={{ opacity: 0, y: 16, rotate: -1 }}
        animate={{ opacity: 1, y: 0, rotate: 0 }}
        transition={{ type: "spring", stiffness: 260, damping: 22 }}
        className="card-pop overflow-hidden"
      >
        <div className="halftone relative border-b-2 border-ink px-6 pb-12 pt-8">
          <span className="inline-block -rotate-3 rounded-md border-2 border-ink bg-sun px-3 py-1 text-sm font-bold shadow-pop-sm">
            Fan demand test
          </span>
          <h1 className="mt-4 font-pop text-[2.1rem] leading-[1.1] sm:text-6xl">
            {title} is not in India yet.
          </h1>
        </div>
        <div className="relative px-6 pb-7 pt-8">
          <p className="absolute -top-5 right-5 rotate-2 rounded-2xl border-2 border-ink bg-white px-4 py-2 text-lg font-bold shadow-pop-sm">
            Want it here?
          </p>
          <p className="max-w-md text-lg">
            Studios launch where fans show up. Vote in under a minute and tell them your city, your
            language and what you would buy.
          </p>

          {/* Goal progress bar */}
          {campaign && (
            <div className="mt-5">
              <GoalProgress committedCount={committedCount} minRun={minRun} size="lg" />
            </div>
          )}

          <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-3">
            <Link to="/join" className="btn-pop">Vote now</Link>
            <p className="text-sm">
              <motion.span
                key={optInCount}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                className="num font-bold"
              >
                {num(optInCount)}
              </motion.span>{" "}
              fans have voted so far
            </p>
          </div>
        </div>
      </motion.section>

      <section aria-label="More things to do" className="space-y-4">
        <Link to="/preorder" className="card-pop flex items-center gap-4 p-4 hover:bg-sun/30">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full border-2 border-ink bg-sun">
            <ShoppingBag size={22} aria-hidden="true" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-lg font-bold">Preorder an official item</span>
            <span className="block text-sm text-ink/75">Open only in cities where fans voted it through.</span>
          </span>
          <ChevronRight aria-hidden="true" />
        </Link>
        <Link to="/verify" className="card-pop flex items-center gap-4 p-4 hover:bg-mint/30">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full border-2 border-ink bg-mint">
            <BadgeCheck size={22} aria-hidden="true" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-lg font-bold">Check if an item is official</span>
            <span className="block text-sm text-ink/75">Scan the QR code or type the code under it.</span>
          </span>
          <ChevronRight aria-hidden="true" />
        </Link>
      </section>

      <p className="text-center text-sm text-ink/70">
        Monsoon Samurai. Votes are anonymous: no name or phone number is saved.{" "}
        <Link to="/privacy" className="font-bold underline underline-offset-4">Privacy</Link>
      </p>
    </div>
  )
}
