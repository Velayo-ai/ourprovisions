# SPEC — iOS Install Coach-Mark ("land an icon on the home screen")

**Scope:** OurProvisions · Beat 0 · top ExD priority
**Status:** Design locked (2026-07-06). Ready to build.
**Owner:** Claude Code (merge authority)

---

## Why this exists

Dan was manually walking beta users through "Add to Home Screen" over the phone
— an unnatural, high-friction step. The reframe: **the goal is not the icon, it
is removing Dan from the install loop.** The app should guide the user itself.

Platform reality that drives the whole design:
- **Android / Chrome** surfaces a native install prompt automatically once a
  valid manifest + `display: standalone` + HTTPS exist (all present). No custom
  code needed — leave it to Chrome.
- **iOS / Safari** provides **no install prompt and no programmatic trigger.**
  The only path is user-driven: Share → "Add to Home Screen." Apple designed it
  this way. So iOS is the entire job — and the job is a tasteful, self-serve
  in-app hint, not automation (automation is impossible here).

## Scope of this change

- iOS Safari **only**. Do not build a custom Android button — Chrome's default
  prompt is explicitly accepted.
- A dismissible in-app coach-mark component that points the user at the Safari
  Share control and the "Add to Home Screen" action.

## Detection — show ONLY when ALL are true

1. Device is iOS (iPhone/iPad) — user-agent sniff.
2. Browser is Safari (not an in-app webview, not Chrome-on-iOS).
3. `window.navigator.standalone === false` — i.e. NOT already launched from the
   home screen. **This is the critical gotcha:** if `standalone === true` the
   user already installed and opened from the icon and must NEVER see the hint.
4. localStorage dismissal count < 2 (see ladder).

## Behavior — dismissal ladder

Counter persisted in **localStorage** (per-device by design). A "visit" = a
**fresh open of the app** (new session / fresh page load), not a re-render.

- **Fresh open 1:** show the hint (standard copy).
- User dismisses → increment count to 1.
- **Next fresh open, still not installed:** show once more with softer,
  acknowledging "last call" copy.
- User dismisses again → increment to 2 → **never show again.**

Timing within a visit: show on first open **right away** (Dan's call — not
gated behind the aha). Note this diverges from the usual "earn it first"
instinct; Dan chose immediacy to maximize install capture for a known,
already-warm audience.

## Copy (maritime voice, placeholder — refine at build)

- First show: *"Keep OurProvisions one tap away — tap ⎋ Share, then 'Add to
  Home Screen.'"* with an arrow toward the Safari share control (bottom on
  iPhone).
- Second show: *"Last call — want OurProvisions one tap away? Tap ⎋ Share →
  'Add to Home Screen.'"*

## Persistence tradeoff (accepted, not a bug)

localStorage is per-device-per-browser. Clearing Safari data or opening on a new
device resets the counter and re-offers the hint. This is **correct** for a
home-screen nudge — a new device is a new place they might want the icon. A
Supabase-backed counter was considered and rejected as over-engineering for a
cosmetic nudge (KISS / "wait until people complain").

## Presentation

- Dismissible bottom sheet or small anchored card — **not** a blocking modal
  (must not violate the "first three minutes feel finished" bar).
- One-tap dismiss.

## Verification checklist (must pass on a PHYSICAL iPhone)

- [ ] Hint appears on first fresh open in iOS Safari, not installed.
- [ ] Following the steps lands the correct icon (uses `apple-touch-icon`
      180×180) on the home screen, full-screen, no browser chrome.
- [ ] Opening FROM the home-screen icon (`standalone === true`) never shows the
      hint.
- [ ] Dismiss → next fresh open shows the softer second copy.
- [ ] Second dismiss → never shows again (until localStorage cleared).
- [ ] Android/Chrome still gets its native prompt, untouched.
- [ ] Non-Safari iOS browsers and desktop never see the hint.

## Supporting assets to confirm at build

- `manifest.json` with name, icons, `display: standalone`, theme colors, start
  URL.
- `apple-touch-icon` (180×180) in the HTML head — iOS partly ignores the
  manifest and reads this. Derive from `ourprovisions1024dark.png`.
