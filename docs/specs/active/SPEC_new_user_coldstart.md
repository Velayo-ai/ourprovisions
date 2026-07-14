# SPEC — New-User Cold-Start Walk + Signup-Email Flip Gate

**Scope:** OurProvisions · Beat 0 · launch-readiness gate
**Status:** Design locked (2026-07-06). This is a test-and-fix cycle + a gate,
not a feature build.
**Owner:** Claude Code (execution) — findings drive fixes.

---

## Why this exists

The front door for the beta is: velayo.ai / ourprovisions.app → email captured
in Mailchimp → within-the-hour personal email → link into the app. Dan wants to
flip that email to a **self-serve "come aboard" link**. That's only honest if a
true zero-state user can actually onboard cleanly — otherwise the automation
points at a dead end and multiplies confusion silently.

Cold-start household creation **already exists** (a no-invite user can create
their own household). So this is **verify-and-wire, not build-from-scratch.**
This walk is the gate between "personal invite" (safe default) and "automated
self-serve" (the goal).

## The three-minute clock — segments

The onboarding arc has four segments; Beat 0's mechanics (join-activation fix +
Clerk) own the middle. This walk covers the whole arc for a NO-INVITE user:
1. Email → app (the link in the signup email).
2. Clerk sign-up from zero state.
3. First 60 seconds inside — create own household, non-blank first screen.
4. First contribution — add an item, see it persist. That's the aha = onboarded.

## The walk (timed, on a device/identity that has NEVER touched the app)

Run with a fresh Clerk identity (e.g. a `+testN` Gmail alias), incognito, ideally
a real phone. Put a literal timer on it. Every friction point = a fix.

Must prove:
- [ ] Fresh Clerk identity signs up without confusion.
- [ ] User creates their own household with no invite — flow is clear, not a
      dead end.
- [ ] First screen is a warm, maritime empty-state ("your crew's list starts
      here — add your first item"), NOT a blank void.
- [ ] Add-first-item path is obvious to someone who's never seen the UI.
- [ ] Item persists; Realtime/sync does nothing weird for a solo brand-new
      household (no ghost rows, no stale flicker).
- [ ] Total time to first item is reasonable.

## The gate (the actual decision this spec exists to force)

- **All green →** flip the within-the-hour signup email to the self-serve
  "come aboard" variant (link straight into the app). True rolling-thunder
  automation achieved.
- **Any red →** signup email stays the **personal** variant ("you're in — I'll
  get you set up this week") until the red is fixed. Rough is fine; broken or
  embarrassing is not — a genuinely broken cold-start is P0 and blocks launch.

## Scoping note (protect the cadence)

Beat 0 bar = onboarding **works** and takes a **reasonable** time (no dead ends,
no wrong-household, non-blank first screen). A *tight, delightful 3-minute*
experience is a Beat 1 goal shipped as a visible "we made getting started
smoother" beat — do NOT stall Beat 0 on onboarding polish.

## Two email variants to have ready

- **Self-serve** ("come aboard" + direct app link) — use if gate is green.
- **Personal** ("you're in, I'll set you up this week") — fallback if red.
Both in Dan's voice; keep the two-door/one-Mailchimp-list architecture intact
(velayo.ai = brand/journey, ourprovisions.app = product, one audience).

## Dependencies / watch-outs

- Clerk identity everywhere via `auth.jwt()->>'sub'`, never `auth.uid()`.
- Verify on **deployed dev** first, never localhost; promote to prod after green.
- Join-activation fix (P0, existing addendum spec) must land first — the walk's
  invite-path cousin. A no-invite walk can proceed in parallel, but the beta
  can't launch until the invite path is also green.
