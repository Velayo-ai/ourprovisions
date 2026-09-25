# SPEC_auth_state_ui_gating.md
2026-09-24 · OurProvisions · Closes the "silent anon downgrade" design item; adds session-loss handling and PII scrub

## Field evidence (prod, 2026-09-24, RUM session 70ea2c1e…)
Founder's fresh sign-up via the beta landing page. Landed on `/sign-up?email_address=…&first_name=…&last_name=…#/browse`, created a password in the Clerk modal, and the app came up **signed-out** (SIGN IN / SIGN UP header) while still showing a household-shaped UI. `loadPlacements` returned **401** every ~2s for ~4 minutes (27 console errors). A manual restart brought the session in; then `checkPresence` fired a false "No longer a member of that place" (fixed separately, dev commit `143037f`).

Two facts from the code (Claude Code, Part B) reframe this:
1. **A fresh signed-out load cannot reach `loadPlacements`** — it needs a bootstrapped household, which needs a session. So the page *had* a live session, bootstrapped, loaded a household, then **lost the session in-page** without a reload. Why Clerk dropped it is not answerable from code (see §Open).
2. Nothing in the app resets on sign-out. `supabaseRef`, `householdRef` and `household` state survive; the fetch wrapper omits `Authorization` on a null token and sends `apikey` only, so PostgREST sees **`anon`** (`supabaseClient.js:31-38`). The pollers keep running against a signed-out page forever.

## Decisions
- **D1 — Never query as `anon`.** The fetch wrapper **refuses** (throws a typed `AuthTokenMissing`) when `getToken()` returns null. It never downgrades. The signed-out branch of Effect 1 (seed catalog + category averages, `useProvisions.js:466-520`) is deleted under D4, so no code path sends `apikey`-only requests.
- **D2 — Auth state is a first-class app state, not an inference.** One `authPhase` derived from Clerk (`isLoaded`, `isSignedIn`) plus token presence drives what renders and what polls. Data hooks gate on it; no hook gates on `household?.id` alone.
- **D3 — Session loss in-page is a designed moment.** Losing the session is not a crash and not a silent state. Clear household state, stop every poller, show a signed-out sheet, and emit a RUM span so the next occurrence explains itself.
- **D4 — Home is the signed-out surface, and the default landing.** Signed out, the app shows Home in a welcome variant (wordmark, one line of what this is, SIGN IN / SIGN UP). Nav taps on Plan / Shop / Browse open the sign-in modal rather than rendering a household shell. The anon storefront preview on Browse is **retired**, and with it the signed-out branch of Effect 1 — after this spec the app makes **zero** anon queries (see D1).
- **D4a — Smart landing.** A load with no route decides where to land from state: signed in with unbought items on the list → **Shop**; otherwise → **Home**. A deep link (any hash present — invite links, a bookmarked tab) always wins. See §Landing.
- **D5 — PII leaves the URL the moment it's read.** Pre-fill params are consumed once, then stripped by `replaceState` — path normalised to `/` as well, so `/sign-up` never persists. RUM scrubs the query string from every URL attribute as defense in depth.

## Behavior (truth table)
| `authPhase` | Clerk | Token | Renders | Data activity |
| --- | --- | --- | --- | --- |
| `booting` | `!isLoaded` | — | Splash / skeleton, wordmark **Provisions** | None |
| `signed_out` | loaded, `!isSignedIn` | — | Home (welcome variant); header SIGN IN / SIGN UP; nav taps open sign-in | **None.** No Effect 1, no Effect 2, no meal poll, no household context |
| `signed_in_no_token` | `isSignedIn` | null (transient) | Last good UI, held; connectivity pill "reconnecting" | **Hold.** Pollers skip ticks (no fetch, no anon). After 3 consecutive null tokens (~6s) → treat as `session_lost` |
| `bootstrapping` | `isSignedIn` | present | Skeleton for signed-in surfaces | `bootstrap_new_user` → household context adopts (Part A fix) |
| `ready` | `isSignedIn` | present | Full app | Effect 2 + meal poll as today |
| `session_lost` | was `ready`, now `!isSignedIn` (no reload) | — | Signed-out sheet: "You've been signed out — sign in to pick up where you left off" + SignInButton. Underneath: `signed_out` rendering | **Everything stops** (§Sign-out reset). RUM `auth.session-lost` span emitted once |

Rule: every transition **out of** `ready` runs the sign-out reset before anything else renders.

## Landing (route chosen on load)
Today a no-hash load is written as `#/browse` by the mirror effect (`App.js:3470-3474`). Replace with a one-shot landing decision:

| Load has a hash? | `authPhase` | Unbought items on active list | Lands on |
| --- | --- | --- | --- |
| Yes (deep link, invite, bookmark) | any | any | That hash. Signed out: Home welcome, hash kept as `pendingRoute`, restored after sign-in |
| No | `signed_out` | — | Home (welcome) |
| No | `ready` | 0 | Home |
| No | `ready` | ≥ 1 | Shop |
| No | `bootstrapping` | unknown | **Hold** — no hash written yet; the splash covers it. First `list_items` result decides. If `ready` arrives without list data before the splash ends → Home, and **stay** (never bounce a user off a tab after it has rendered) |

"Unbought items" = rows on the active cycle with no bought event — the same count the Shop badge (if any) would show. Decide once per load; after that the user's taps own the route. Signing in from the Home welcome runs the same rule once (`pendingRoute` first, then the table).

Rationale: Home is the front door for someone with nothing in motion; a list with things on it is the one state where the user almost certainly opened the app to shop. Plan-has-meals-but-list-empty is a possible third rule — parked until the board (Library → Board → List → Done) settles.

## Sign-out reset (the missing half)
On `ready → signed_out | session_lost`, in one place (a `useEffect` on `isSignedIn` in `useProvisions`, mirrored by `ActiveHouseholdContext`):
- `supabaseRef.current = null`, `householdRef.current = null`, `setHousehold(null)`, `setBootstrapped(false)`; clear list/cycle/meals/placements state.
- `ActiveHouseholdContext`: `dbRef = null`, `myHouseholds = []`, `activeHouseholdId = null`; the 30s watchdog early-returns on `!clerkId` (already does) — verify it also can't fire on a stale `dbRef`.
- `localStorage.activeHouseholdId` **stays** (it's a per-browser convenience; validated on next sign-in).
- `setHousehold(null)` for RUM (already the effect's null branch).

## Polling discipline
| Poller | Today | Change |
| --- | --- | --- |
| Effect 2 list/cycle (2s), catalog (20s) `useProvisions.js:895-896` | gated on `userId, clerkId, bootstrapped` | + `authPhase === 'ready'`; on `AuthTokenMissing` skip the tick; on HTTP **401/403** stop the interval and raise `session_lost` |
| Plan/Home meal poll (2s) `App.js:3119-3122` | gated on `view && household?.id` | + `authPhase === 'ready'`. Same 401/403 → stop rule. |
| `loadPlacements` `useProvisions.js:2996-3001` | logs and returns, no backoff | Distinguish error class: auth (401/403) → propagate to the stop rule; other → exponential backoff 2s→4s→8s→30s cap, reset on success |
| `checkPresence` (30s) | as fixed in `143037f` | + early-return on `authPhase !== 'ready'` |

Backoff is for network/5xx. Auth errors never retry — they end the loop and change state.

## PII scrub
1. **Source.** `App.js:2735` — right after `signUpInitialValues` is read: `window.history.replaceState(null, '', '/' + (window.location.hash || '#/browse'))`. Params gone, path normalised. `openSignUp` still receives the values (they're already in the memo).
2. **RUM.** `rum.js` `SplunkOtelWeb.init` → add `exporter.onAttributesSerializing` that rewrites `location.href`, `http.url`, `document.referrer` (and any attribute ending in `.url`) through a scrubber that drops the query string for `ourprovisions.velayo.ai` origins. Keep the hash (it's the route). Supabase REST URLs keep their query (it's the filter, not PII) — scope the scrub to our own origin.
3. **Session replay** records `location.href` in its own meta events; the exporter hook does not cover it. Item 1 is what protects replay — it fires before the first `routeChange` after mount. Verify in §V4.
4. **Landing page (ourprovisions.app, separate repo).** Stop passing `email_address` in the link at all; `first_name`/`last_name` are fine. Clerk's modal can take the email from the user. Logged here, fixed there.

## Instrumentation (so the next session-loss explains itself)
Emit `auth.session-lost` once per transition with: `clerk.client_status`, `clerk.session_status` (Clerk 5.x can report `pending`), `auth.signed_in_age_seconds`, `auth.last_token_age_seconds`, `auth.null_token_streak`, `view`, `household.id`. Also a lightweight `auth.phase-change` span on every `authPhase` transition (from → to). Attributes only; no PII.

## Clerk dashboard checks (prod instance, no code)
- **Paths.** Sign-in / sign-up / after-sign-up / after-sign-in URLs. The app is modal-only with hash routing; anything pointing at an application-hosted `/sign-up` or `/sign-in` has no component behind it. Set after-sign-up and after-sign-in to `https://ourprovisions.velayo.ai/#/plan`. Record what they were.
- **Email verification** setting for sign-up (code vs link vs none). A verification *link* returns to an application path — see above.
- **Session lifetime / inactivity timeout.** Record values; the loss happened ~2–3 min after sign-up.
- Remove the unused `@clerk/react` 6.x from `package.json` (`@clerk/clerk-react` 5.x is the one imported). Two Clerk packages is a footgun waiting for the next `npm i`.

## Out of scope
- Moving Clerk off modal mode / adopting `<SignIn>` routes.
- Solo-start welcome sheet design (separate session).
- The landing-page repo change (logged in §PII scrub 4).

## Verification (dev preview, deployed — not localhost; DevTools Network + Splunk RUM env=dev)
- **V1 Fresh sign-up via the beta link** (`+alias` address, code `424242` on dev): password → app is signed in with no restart; URL is `/#/plan` (or `/#/browse`) with **no query string** within 1s of load.
- **V2 Signed-out load of `/#/plan`** → Home welcome; Network shows **zero** requests to `*.supabase.co` of any kind. Sign in → lands on `#/plan` (pendingRoute honoured).
- **V2a Landing rule.** Signed in, empty list, load `/` → Home. Add one item, reload `/` → Shop. Buy it, reload → Home. Load `/#/browse` with items on the list → Browse (deep link wins). No visible tab switch after first paint in any case.
- **V3 Forced session loss.** Signed in on Plan → in DevTools, delete the Clerk `__session`/`__client` cookies and wait ≤ 10s → signed-out sheet appears; all polling stops (Network goes quiet); one `auth.session-lost` span in RUM with populated attributes; **no 401s**.
- **V4 RUM scrub.** Load `/?email_address=x%40y.z#/browse` while signed in → in Splunk, the session's spans show `location.href` without the query; session replay's URL for the session has no query.
- **V5 Backoff.** Throttle to offline mid-session for 20s → placements retries at 2/4/8/… not every 2s; recovers on reconnect with no state loss.
- **V6 Part A regression** (`143037f`): fresh sign-up, name the place, wait 60s → no notice, no `id=eq.null` 400.
- **V7 Existing users unaffected.** Helen/Elly-style path: sign in with an existing household → `ready` in one pass, no flash of the sign-in panel on Plan.

## Open
- **Why the session dropped in-page.** Not answerable from code. §Instrumentation plus §Clerk dashboard checks are the path; do not guess a fix for it in this spec.
- Home welcome variant copy and layout — one line of pitch plus the two buttons is enough to ship; a designed version is a Home session, not this spec.

## Resolved
- **Q3 — the activation that never reached React (2026-09-24, `1bcd8ae`).** clerk-js 5.128.0 `setActive`: set session/user to `undefined` and emit → `await navigate(afterSignInUrl)` inside a beforeunload tracker → RETURN before `setAccessors`/emit if the tracker fired. With no `routerPush`/`routerReplace` on `ClerkProvider`, `navigate()` falls to `windowNavigate`, which dispatches `clerk:beforeunload` (the tracker listens for it) and then assigns `location.href`. The modal's default redirect is the CURRENT URL (`RedirectUrls`, mode `modal` → `window.location.href`), and this app always carries a hash, so that assignment is a fragment navigation: nothing unloads, the tracker has already fired, React is stranded with `user === undefined` (`useUser` → `isLoaded: false`) while `window.Clerk.client` holds the active session and `lastActiveSessionId` — the console readings of the 2eafad0 walk exactly. Fix: `ClerkProvider` carries both router functions; same-origin Clerk navigations go through `history`. Verified by Dan on the dev domain: modal sign-in → avatar, Plan, `Clerk.session.status === "active"`, no reload. 3h (`3440d24`) remains as the safety net. Q1 (both gates read `useUser`; the welcome gate's `isLoaded &&` is what turned a stranded tree into a signed-in shell — see ROADMAP LATER, the `booting` skeleton), Q2 (one clerk-js, one clerk-react; `@clerk/react` 6.x was never in the bundle and is now removed) and Q4 (`openSignIn` and the header's `SignInButton` are the same call) closed the same night.

## Why a spec
Changes what signed-out and mid-session-loss users see on prod; changes the default landing route; introduces an app-wide auth state and a stop rule for every poller; removes the app's last anon data path; removes PII from two telemetry paths; carries two truth tables and a verification plan a future session must be able to re-run.


## Amendment 2026-09-24 — offline is not auth loss

The truth table's `signed_in_no_token` row said "after 3 consecutive null tokens → session_lost". Wrong. Replace with:

- `session_lost` fires on exactly one signal: Clerk itself reports no session (`clerk.session === null` / `isSignedIn === false`) while no deliberate sign-out is in flight. Never from token-fetch failures alone.
- A token that can't be fetched while Clerk still holds an active session is `signed_in_no_token`: HOLD. No reset, no sheet. Pollers skip ticks. Connectivity pill reads "Reconnecting…". Indefinitely — a user in a store with no signal stays signed in and keeps their list on screen.
- Classify getToken failures: network (TypeError / "Failed to fetch", `navigator.onLine === false`) vs Clerk-reported. Only the latter can contribute to session_lost. A rejecting getToken (the V3 note) is caught by the wrapper and classified the same way.
- While `navigator.onLine === false`, all pollers pause; resume on the `online` event with one immediate tick. (Tonight they kept firing every 2s into the void.)
- Rationale: the app's core moment is a grocery aisle with one bar, or a boat between marina wifi and nothing. Losing the network must never look like losing the account.

Field evidence: V5 on dev, 2026-09-24 — DevTools Offline ~20s on Plan produced the "You've been signed out" sheet while `Clerk.session` stayed active the whole time; the `…/tokens/supabase` refresh failed offline and three null tokens tripped the old streak rule.

**Implementation note (Claude Code, 2026-09-24).** Landed in `authHealth.js` (the polling gate `isPollingOpen`, token-failure classes, `online`), the fetch wrapper (a rejecting `getToken` is caught and classified), both poll loops and the household watchdog (tick passes the gate; `online` → one immediate tick), and the `authPhase` derivation (`holding` → `signed_in_no_token`; `session_lost` only from Clerk's `isSignedIn`). §Polling discipline's "401/403 → stop the interval and raise `session_lost`" is reconciled with this amendment as follows: a poller refused with a token attached HOLDS for 10s (`REJECTED_HOLD_MS`), then tries once more; whether the session is gone is left to Clerk's own client refresh, which is the one signal above. Neither token-failure class raises `session_lost`; both ride on the `auth.session-lost` span (`auth.clerk_fail_streak`, `auth.last_fail_class`, `net.online`) so a future incident can be read rather than reconstructed. The connectivity pill gets ONE transient report per hold episode (three would flip it to "Offline — showing last saved"), and clears on the next successful read.
