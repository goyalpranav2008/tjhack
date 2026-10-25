import { NavLink, Outlet, useLocation } from "react-router-dom"
import { useEffect } from "react"
import { BadgeCheck, Home, ShoppingBag, ThumbsUp } from "lucide-react"
import { SOURCE_RE } from "../lib/formats"

const tabs = [
  { to: "/", label: "Home", Icon: Home, end: true },
  { to: "/join", label: "Vote", Icon: ThumbsUp },
  { to: "/preorder", label: "Preorder", Icon: ShoppingBag },
  { to: "/verify", label: "Verify", Icon: BadgeCheck },
]

function Logo() {
  return (
    <NavLink to="/" className="flex items-center gap-2.5" aria-label="FandomLoop home">
      <span aria-hidden="true" className="grid h-9 w-9 place-items-center rounded-full border-2 border-ink bg-bubble shadow-pop-sm">
        <span className="h-3.5 w-3.5 rounded-full border-[3px] border-ink" />
      </span>
      <span className="font-pop text-xl leading-none">FandomLoop</span>
    </NavLink>
  )
}

export default function FanLayout() {
  const { pathname, search } = useLocation()

  // Capture ?ref= once per session and store in sessionStorage
  useEffect(() => {
    const params = new URLSearchParams(search)
    const ref = params.get("ref")
    if (ref && SOURCE_RE.test(ref)) {
      sessionStorage.setItem("fandomloop_ref", ref)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps — only on mount

  useEffect(() => { window.scrollTo(0, 0) }, [pathname])

  return (
    <div className="fan">
      <header className="mx-auto flex max-w-2xl items-center justify-between gap-4 px-5 pb-2 pt-5">
        <Logo />
        <nav aria-label="Main" className="hidden gap-1 md:flex">
          {tabs.map(({ to, label, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `rounded-full px-4 py-2 text-sm font-bold ${isActive ? "bg-ink text-white" : "hover:bg-white"}`
              }
            >
              {label}
            </NavLink>
          ))}
        </nav>
      </header>

      <main className="mx-auto max-w-2xl px-5 pb-32 pt-4 md:pb-16">
        <Outlet />
      </main>

      <footer className="mx-auto max-w-2xl px-5 pb-28 text-sm text-ink/70 md:pb-10">
        <p>Monsoon Samurai. Payments are simulated and no money moves.</p>
        <div className="mt-2 flex gap-4">
          <NavLink to="/studio" className="font-bold underline underline-offset-4">
            Studio? Open the console
          </NavLink>
          <NavLink to="/privacy" className="font-bold underline underline-offset-4">
            Privacy & withdraw
          </NavLink>
        </div>
      </footer>

      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-20 border-t-2 border-ink bg-white md:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      >
        <ul className="mx-auto grid max-w-md grid-cols-4">
          {tabs.map(({ to, label, Icon, end }) => (
            <li key={to}>
              <NavLink
                to={to}
                end={end}
                className={({ isActive }) =>
                  `flex flex-col items-center gap-0.5 py-2.5 text-xs font-bold ${isActive ? "text-ink" : "text-ink/60"}`
                }
              >
                {({ isActive }) => (
                  <>
                    <span className={`grid h-8 w-14 place-items-center rounded-full ${isActive ? "bg-sun border-2 border-ink" : "border-2 border-transparent"}`}>
                      <Icon size={20} aria-hidden="true" />
                    </span>
                    {label}
                  </>
                )}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  )
}
