export default function Slider({ id, label, value, min, max, step = 0.01, onChange, display, hint }) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="text-sm font-medium">
          {label}
        </label>
        <output htmlFor={id} className="num font-display text-xl font-bold">
          {display}
        </output>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="mt-2 w-full accent-sakura"
      />
      <p className="mt-1 text-sm text-ai-300">{hint}</p>
    </div>
  )
}
