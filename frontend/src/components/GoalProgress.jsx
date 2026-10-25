import { motion } from "framer-motion"
import { num } from "../lib/format"

/**
 * GoalProgress — shows committed fans vs minRun goal.
 *
 * Props:
 *   committedCount  number  fans who have preauthorized
 *   minRun          number  minimum needed to proceed
 *   size            "sm" | "lg"  (default "sm")
 */
export default function GoalProgress({ committedCount = 0, minRun = 0, size = "sm" }) {
  const pct = minRun > 0 ? Math.min(100, Math.round((committedCount / minRun) * 100)) : 0
  const label =
    pct >= 100 ? "Goal reached!" : pct >= 70 ? "Almost there" : "Not enough yet"

  const barH = size === "lg" ? "h-4" : "h-2.5"
  const textSz = size === "lg" ? "text-base" : "text-sm"

  return (
    <div aria-label={`${committedCount} of ${minRun} fans committed`}>
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={minRun}
        aria-valuenow={committedCount}
        aria-label={`${committedCount} of ${minRun} fans committed`}
        className={`w-full overflow-hidden rounded-full border-2 border-ink bg-white ${barH}`}
      >
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ type: "spring", stiffness: 160, damping: 22 }}
          className={`h-full rounded-full ${pct >= 100 ? "bg-mint" : pct >= 70 ? "bg-sun" : "bg-bubble"}`}
        />
      </div>
      <div className={`mt-1.5 flex items-center justify-between gap-2 ${textSz}`}>
        <span>
          <span className="num font-bold">{num(committedCount)}</span>
          {" of "}
          <span className="num font-bold">{num(minRun)}</span>
          {" fans needed"}
        </span>
        <span className="font-bold">{label}</span>
      </div>
    </div>
  )
}
