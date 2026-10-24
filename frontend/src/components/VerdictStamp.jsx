import { motion } from "framer-motion"

const COLORS = {
  GO: "text-jade border-jade bg-jade/10",
  ADAPT: "text-marigold border-marigold bg-marigold/10",
  STOP: "text-vermilion border-vermilion bg-vermilion/10",
}

// A hanko-style stamp. It re-stamps (pops in) whenever the verdict changes.
export default function VerdictStamp({ verdict, label, size = "sm" }) {
  const big = size === "lg"
  return (
    <motion.span
      key={verdict}
      initial={{ scale: 1.6, opacity: 0, rotate: -14 }}
      animate={{ scale: 1, opacity: 1, rotate: -3 }}
      transition={{ type: "spring", stiffness: 520, damping: 24 }}
      className={`inline-block select-none whitespace-nowrap rounded-md border-2 font-display font-extrabold ${COLORS[verdict]} ${
        big ? "px-5 py-2 text-3xl" : "px-2.5 py-0.5 text-sm"
      }`}
      style={{ boxShadow: "inset 0 0 0 3px #0e1633, inset 0 0 0 4px currentColor" }}
    >
      {label || verdict}
    </motion.span>
  )
}
