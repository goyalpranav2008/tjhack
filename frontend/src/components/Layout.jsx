import { NavLink, Outlet } from "react-router-dom"

const links = [{ to: "/studio", label: "Studio console", end: true }]

export default function Layout() {
  return (
    <div className="studio">
      <header className="border-b border-ai-700/60">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-x-8 gap-y-3 px-5 py-4">
          <NavLink to="/studio" className="flex items-center gap-3">
            <span aria-hidden="true" className="grid h-9 w-9 place-items-center rounded-xl border border-ai-700 bg-ai-900">
              <span className="h-4 w-4 rounded-full border-[3px] border-sakura" />
            </span>
            <span className="font-display text-xl font-bold">
              FandomLoop <span className="font-medium text-ai-300">India</span>
            </span>
          </NavLink>
          <nav aria-label="Main" className="-mx-1 flex gap-1 overflow-x-auto">
            {links.map((l) => (
              <NavLink
                key={l.to}
                to={l.to}
                end={l.end}
                className={({ isActive }) =>
                  `whitespace-nowrap rounded-lg px-3 py-2 text-sm transition-colors ${
                    isActive ? "bg-ai-800 text-washi" : "text-ai-300 hover:text-washi"
                  }`
                }
              >
                {l.label}
              </NavLink>
            ))}
            <NavLink to="/" className="whitespace-nowrap rounded-lg px-3 py-2 text-sm text-ai-300 hover:text-washi">
              Open the fan app
            </NavLink>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-5 py-8">
        <Outlet />
      </main>
      <footer className="mx-auto max-w-7xl px-5 pb-10 text-sm text-ai-400">
        Demo data is illustrative. Payments are simulated and no money moves.
      </footer>
    </div>
  )
}
