import { Bar, BarChart, Cell, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import { inr, num } from "../lib/format"
import { VERDICT_COLORS } from "../lib/theme"

const SHORT = { "Digital manga": "Manga", "Event ticket": "Event", Merch: "Merch" }
const labelOf = (r) => `${r.city} ${SHORT[r.format]}`

const tick = { fill: "#a3b2dc", fontSize: 12 }
const tooltipStyle = {
  background: "#131d40",
  border: "1px solid #2a3866",
  borderRadius: 8,
  color: "#eef1fa",
}

function Card({ title, caption, children }) {
  return (
    <section className="rounded-2xl border border-ai-700/70 bg-ai-900 p-5">
      <h2 className="font-display text-xl font-bold">{title}</h2>
      <p className="mb-3 text-sm text-ai-300">{caption}</p>
      <div className="h-[400px]">{children}</div>
    </section>
  )
}

export default function Charts({ rows }) {
  const contribution = rows.map((r) => ({ name: labelOf(r), value: Math.round(r.contribution), verdict: r.verdict }))
  const orders = rows.map((r) => ({
    name: labelOf(r),
    expected: r.expectedOrders,
    breakEven: Number.isFinite(r.breakEven) ? r.breakEven : null,
  }))

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card title="Contribution per order" caption="What each sale earns after royalty, fees and costs. Colour shows the verdict.">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={contribution} layout="vertical" margin={{ left: 8, right: 16 }}>
            <CartesianGrid stroke="#2a3866" strokeOpacity={0.5} horizontal={false} />
            <XAxis type="number" tick={tick} tickFormatter={(v) => inr(v)} stroke="#2a3866" />
            <YAxis type="category" dataKey="name" tick={tick} width={118} stroke="#2a3866" />
            <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "rgba(255,255,255,0.05)" }} formatter={(v) => [inr(v), "Contribution"]} />
            <Bar dataKey="value" radius={[0, 4, 4, 0]}>
              {contribution.map((d) => (
                <Cell key={d.name} fill={VERDICT_COLORS[d.verdict]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </Card>
      <Card title="Expected orders against break-even" caption="A combo needs the pink bar to pass the blue one.">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={orders} layout="vertical" margin={{ left: 8, right: 16 }}>
            <CartesianGrid stroke="#2a3866" strokeOpacity={0.5} horizontal={false} />
            <XAxis type="number" tick={tick} tickFormatter={(v) => num(v)} stroke="#2a3866" />
            <YAxis type="category" dataKey="name" tick={tick} width={118} stroke="#2a3866" />
            <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "rgba(255,255,255,0.05)" }} formatter={(v, name) => [num(v), name]} />
            <Legend wrapperStyle={{ color: "#a3b2dc", fontSize: 13 }} />
            <Bar dataKey="expected" name="Expected orders" fill="#f6a5c5" radius={[0, 4, 4, 0]} />
            <Bar dataKey="breakEven" name="Break-even orders" fill="#7f90c4" radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </Card>
    </div>
  )
}
