/**
 * Component smoke-tests.
 * Tests rendering, accessibility attributes, and text content.
 * Framer Motion is shimmed so animations don't block jsdom.
 */
import { describe, it, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"

// ── Shim framer-motion so tests don't hang on animation ───────────────────
// motion.div renders as a plain div; AnimatePresence renders its children.
vi.mock("framer-motion", () => ({
  motion: new Proxy({}, {
    get: (_t, tag) => {
      const { forwardRef, createElement } = require("react")
      return forwardRef(({ children, ...props }, ref) => {
        // Strip framer-specific props before passing to DOM element
        const clean = Object.fromEntries(
          Object.entries(props).filter(([k]) =>
            !["initial","animate","exit","transition","variants","whileHover","whileTap","custom","layoutId"].includes(k)
          )
        )
        return createElement(tag, { ...clean, ref }, children)
      })
    }
  }),
  AnimatePresence: ({ children }) => children,
  useAnimation: () => ({ start: vi.fn() }),
  useMotionValue: (v) => ({ get: () => v, set: vi.fn() }),
}))

import GoalProgress from "../components/GoalProgress"
import VerdictStamp from "../components/VerdictStamp"
import ConsentBlock from "../components/ConsentBlock"

// ── GoalProgress ──────────────────────────────────────────────────────────

describe("GoalProgress", () => {
  it("renders a progressbar with correct aria values", () => {
    render(<GoalProgress committedCount={62} minRun={100} />)
    const bar = screen.getByRole("progressbar")
    expect(bar).toHaveAttribute("aria-valuenow", "62")
    expect(bar).toHaveAttribute("aria-valuemax", "100")
    expect(bar).toHaveAttribute("aria-valuemin", "0")
  })

  it("shows the count text", () => {
    render(<GoalProgress committedCount={62} minRun={100} />)
    expect(screen.getByText(/62/)).toBeInTheDocument()
    expect(screen.getByText(/100/)).toBeInTheDocument()
    expect(screen.getByText(/fans needed/i)).toBeInTheDocument()
  })

  it('shows "Not enough yet" when below 70%', () => {
    render(<GoalProgress committedCount={50} minRun={100} />)
    expect(screen.getByText("Not enough yet")).toBeInTheDocument()
  })

  it('shows "Almost there" at 70–99%', () => {
    render(<GoalProgress committedCount={80} minRun={100} />)
    expect(screen.getByText("Almost there")).toBeInTheDocument()
  })

  it('shows "Goal reached!" at 100%', () => {
    render(<GoalProgress committedCount={100} minRun={100} />)
    expect(screen.getByText("Goal reached!")).toBeInTheDocument()
  })

  it('shows "Goal reached!" when over 100%', () => {
    render(<GoalProgress committedCount={150} minRun={100} />)
    expect(screen.getByText("Goal reached!")).toBeInTheDocument()
  })

  it("handles minRun=0 without crashing", () => {
    render(<GoalProgress committedCount={0} minRun={0} />)
    // Should render without throwing; aria-valuenow=0
    expect(screen.getByRole("progressbar")).toBeInTheDocument()
  })

  it("uses default props (0 committed, 0 minRun)", () => {
    render(<GoalProgress />)
    expect(screen.getByRole("progressbar")).toBeInTheDocument()
  })
})

// ── VerdictStamp ──────────────────────────────────────────────────────────

describe("VerdictStamp", () => {
  it("renders GO text", () => {
    render(<VerdictStamp verdict="GO" />)
    expect(screen.getByText("GO")).toBeInTheDocument()
  })

  it("renders ADAPT text", () => {
    render(<VerdictStamp verdict="ADAPT" />)
    expect(screen.getByText("ADAPT")).toBeInTheDocument()
  })

  it("renders STOP text", () => {
    render(<VerdictStamp verdict="STOP" />)
    expect(screen.getByText("STOP")).toBeInTheDocument()
  })

  it("renders a custom label when provided", () => {
    render(<VerdictStamp verdict="GO" label="Approved" />)
    expect(screen.getByText("Approved")).toBeInTheDocument()
    expect(screen.queryByText("GO")).not.toBeInTheDocument()
  })
})

// ── ConsentBlock ──────────────────────────────────────────────────────────

describe("ConsentBlock", () => {
  const defaultForm = { consent: false, isMinor: false, guardianConsent: false }
  const noop = vi.fn()

  it("renders the consent checkbox", () => {
    render(<ConsentBlock form={defaultForm} onChange={noop} />)
    // The consent checkbox text should be visible
    expect(screen.getByText(/agree to share this vote anonymously/i)).toBeInTheDocument()
  })

  it("renders age gate radio buttons", () => {
    render(<ConsentBlock form={defaultForm} onChange={noop} />)
    expect(screen.getByText(/I am 18 or older/i)).toBeInTheDocument()
    expect(screen.getByText(/parent or guardian/i)).toBeInTheDocument()
  })

  it("shows guardian consent checkbox when isMinor=true", () => {
    render(<ConsentBlock form={{ ...defaultForm, isMinor: true }} onChange={noop} />)
    expect(screen.getByText(/A parent or guardian has consented/i)).toBeInTheDocument()
  })

  it("does NOT show guardian consent checkbox when isMinor=false", () => {
    render(<ConsentBlock form={defaultForm} onChange={noop} />)
    expect(screen.queryByText(/A parent or guardian has consented/i)).not.toBeInTheDocument()
  })

  it("contains a link to the Privacy page", () => {
    render(
      <MemoryRouter>
        <ConsentBlock form={defaultForm} onChange={noop} />
      </MemoryRouter>
    )
    expect(screen.getByRole("link", { name: /privacy page/i })).toBeInTheDocument()
  })

  it("consent checkbox is unchecked when form.consent=false", () => {
    render(<ConsentBlock form={defaultForm} onChange={noop} />)
    const checkboxes = screen.getAllByRole("checkbox")
    // The consent tick is the last checkbox
    const consentBox = checkboxes[checkboxes.length - 1]
    expect(consentBox).not.toBeChecked()
  })

  it("consent checkbox is checked when form.consent=true", () => {
    render(<ConsentBlock form={{ ...defaultForm, consent: true }} onChange={noop} />)
    const checkboxes = screen.getAllByRole("checkbox")
    const consentBox = checkboxes[checkboxes.length - 1]
    expect(consentBox).toBeChecked()
  })
})
