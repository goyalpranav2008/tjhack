/**
 * ConsentBlock — shared DPDP-compliant consent widget.
 *
 * Used in Vote (final step) and Preorder.
 *
 * Props:
 *   form        object   { consent, isMinor, guardianConsent }
 *   onChange    fn(patch) called with partial updates
 */
export default function ConsentBlock({ form, onChange }) {
  return (
    <div className="space-y-3">
      {/* Plain-language notice */}
      <div className="rounded-2xl border-2 border-ink/20 bg-sun/20 p-4 text-sm leading-relaxed">
        <p className="font-bold">What we collect and why</p>
        <ul className="mt-2 list-inside list-disc space-y-1 text-ink/80">
          <li>Your city, preferred language, format, and price range</li>
          <li>An anonymous ID (no name or phone number is ever stored)</li>
          <li>Shared with the rights holder to decide where to launch</li>
        </ul>
        <p className="mt-2 text-ink/70">
          You can withdraw your data any time from the{" "}
          <a href="/privacy" className="font-bold underline underline-offset-4">
            Privacy page
          </a>
          .
        </p>
      </div>

      {/* Age gate — radio-style */}
      <fieldset className="card-pop p-4">
        <legend className="font-bold text-base">Your age</legend>
        <div className="mt-3 space-y-2">
          <label className="flex cursor-pointer items-start gap-3">
            <input
              type="radio"
              name="age-gate"
              checked={!form.isMinor}
              onChange={() => onChange({ isMinor: false, guardianConsent: false })}
              className="mt-0.5 h-5 w-5 shrink-0 accent-bubble"
            />
            <span>I am 18 or older</span>
          </label>
          <label className="flex cursor-pointer items-start gap-3">
            <input
              type="radio"
              name="age-gate"
              checked={form.isMinor}
              onChange={() => onChange({ isMinor: true })}
              className="mt-0.5 h-5 w-5 shrink-0 accent-bubble"
            />
            <span>A parent or guardian agrees on my behalf</span>
          </label>
        </div>

        {form.isMinor && (
          <label className="mt-3 flex cursor-pointer items-start gap-3 rounded-xl border border-ink/20 bg-sun/30 p-3 text-sm">
            <input
              type="checkbox"
              checked={form.guardianConsent}
              onChange={(e) => onChange({ guardianConsent: e.target.checked })}
              className="mt-0.5 h-5 w-5 shrink-0 accent-bubble"
            />
            <span>
              A parent or guardian has consented and agrees to this data being shared
              anonymously with the studio.
            </span>
          </label>
        )}
      </fieldset>

      {/* Consent tick */}
      <label className="card-pop flex cursor-pointer items-start gap-3 p-4 text-base">
        <input
          type="checkbox"
          checked={form.consent}
          onChange={(e) => onChange({ consent: e.target.checked })}
          className="mt-0.5 h-6 w-6 shrink-0 accent-bubble"
        />
        <span>
          I agree to share this vote anonymously with the studio. My name and phone
          number are not saved.
        </span>
      </label>
    </div>
  )
}
