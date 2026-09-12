# SPEC: Gate identity-requiring actions on real Clerk sign-in state

## Status
Ready to execute. Anchors below are grep-verified against current `App.js` / `useProvisions.js`
content pulled 2026-09-03, but line numbers WILL have drifted by build time — re-grep each one,
per this project's own convention (see `SPEC_places_rename.md` §"re-grep the current string as
the anchor").

## Background
Andrew (beta tester) hit two separate-looking failures in the same session: Ask AI returned
*"Could not authenticate that request. Try again"* and creating a second place silently failed.
Both turned out to be the same root cause — he was not signed in, and the app gave him no
indication of that. Catalog browsing kept working (reads degrade to anon access silently), so
nothing *looked* broken until he tried an action that specifically required his identity.

Diagnostic exchange, verbatim from the tester thread:
> "Did you sign in?" → "Both features work now that I logged on."

This is a design defect against this project's own governing principle: **surfaces must
self-identify state.** The connectivity pill (`ConnectivityPill.js` / `ConnectivityContext.js`)
already does this for network reachability. Auth state deserves the same treatment — it is
exactly the same shape of problem: a background condition invisible to the user, that silently
breaks only some actions.

Dan's directive, verbatim: **"He should not have been able to use the feature and if he was the
error message should be really clear."** Prevention first, honest fallback second — not just a
better error message alone.

## Design — two layers

### Layer 1: prevent the attempt (primary fix)
`App.js` already destructures `isSignedIn` and `isLoaded` from Clerk's `useUser()` at the top of
`ProvisionsApp()`, and already branches on `isSignedIn` elsewhere (the profile-button vs.
sign-in-button swap near the header, and the splash-ready check: `ready={isLoaded &&
(!isSignedIn || !loading)}`). This is a reactive client-side flag — no network round trip needed
to check it, so it can gate render/enable state directly, before any request is ever attempted.

Apply the same `isSignedIn` gate to every UI entry point that leads to an identity-requiring
write. Two are confirmed in scope; **Cody must grep for a full list — do not assume these are
the only two:**

- **Ask AI** (the button that calls `requestMealSuggestion`, in the New Meal flow / AI meal
  suggestion UI in `App.js`)
- **Create new place** (the button that calls `createHousehold`, in the household/place
  management sheet in `App.js`)

Grep both `createHousehold(` and `requestMealSuggestion(` in `App.js` to find every call site,
then grep the JSX around each for the triggering button. For each:
- If `!isSignedIn`, the button must not render as a live, clickable control that leads to a
  request. Two acceptable patterns, pick whichever fits the surrounding UI more naturally per
  surface — consistency across the two is not required:
  - Replace the button with a "Sign in to continue" prompt in its place, or
  - Keep the button visible but disabled, with adjacent copy explaining why (mirrors the
    existing `!isLoaded` disabled-button pattern already used for the header sign-in buttons —
    same dimensions live vs. disabled, only cursor + opacity differ, so there's no layout
    shift to replicate).
- **Do not** silently hide the button with no explanation — an absent button with no context is
  its own small instance of the same "state isn't visible" problem this spec exists to fix.

### Layer 2: honest fallback for the case Layer 1 can't catch
Layer 1 only helps when Clerk's own `isSignedIn` flag is accurate. There's a harder case this
project's own notes already flagged as a live hypothesis: Clerk's client state can say
`isSignedIn: true` while the underlying token fetch still fails silently — e.g. a session that
Clerk believes is valid but whose refresh is blocked (third-party cookie restrictions were the
working theory, though Andrew's actual case turned out to be simpler: he genuinely wasn't signed
in). Layer 1 cannot catch that case, because Clerk itself is the thing that's wrong.

For that fallback, fix the message at the point of actual failure. Confirmed anchor —
`useProvisions.js`, inside `requestMealSuggestion`:

```js
if (!getToken) { setError("You need to be signed in to ask for a suggestion."); return null; }
try {
  const token = await getToken({ template: "supabase" });
  if (!token) { setError("Could not authenticate that request. Try again."); return null; }
```

Note the first branch (`!getToken`) already has a clear, honest message — it's specifically the
second branch (`!token`, i.e. Clerk attempted and failed) that has the generic, unhelpful one.
Replace it with something explicit and actionable, matching the tone of the first branch:

```js
if (!token) { setError("Your session has expired. Please sign in again."); return null; }
```

**Grep for the same generic-message pattern at the `createHousehold` call site and any other
identity-requiring write** — this exact phrase or similarly generic ones may exist in more than
one place. Do not assume `requestMealSuggestion` is the only occurrence.

If feasible without disproportionate effort, prefer a fallback that offers a direct sign-in
action (button/link in the toast) over plain text — but a clear, honest message alone is an
acceptable minimum if wiring a direct action into the toast component is a bigger lift than this
spec's scope warrants. Use judgment; flag the tradeoff back to design chat if it's a bigger
change than expected.

## Explicitly out of scope for this spec
- Proactive background detection of a dropped session (checking on app focus/resume, polling,
  etc.) — this spec is the reactive/preventive pair described above, not a session-health
  monitor. Could be a future enhancement if Layer 1 + Layer 2 prove insufficient in practice.
- Any change to `createSupabaseClient`'s underlying anon-fallback behavior itself — that's the
  separate, already-logged SESSION_LOG design item (silent downgrade on null token). This spec
  addresses the *symptom* at the UI layer; the fallback behavior itself is a distinct decision
  not being made here.

## Verification
- [ ] Full list of identity-requiring action buttons confirmed via grep (`createHousehold(`,
      `requestMealSuggestion(`, and any others found)
- [ ] Each gated button correctly reflects `isSignedIn` — test by opening dev preview signed
      out, confirming the gated state renders instead of a live/clickable button
- [ ] Sign in on dev preview, confirm gated buttons return to normal live state, no layout shift
- [ ] Force the Layer 2 fallback path (hardest to test cleanly — may require a stale/expired
      token scenario or temporarily stubbing `getToken` to resolve null) and confirm the new
      message renders instead of the old generic one
- [ ] CI=true build clean, no new ESLint warnings

## Scope note
OurProvisions product code (`App.js`, `useProvisions.js`). Normal dev-preview verification and
dev→main promotion path applies — not a Velayo OS/infra change.
