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


## Amendment 2026-09-27 — a failed first request is never terminal

**Routes to:** merge into `docs/specs/active/SPEC_auth_state_ui_gating.md` as "Amendment 2026-09-27", after Amendment 2026-09-24.
**Scope:** OurProvisions · web client · dev first. **No migrations. No RLS or RPC changes.**
**Supersedes:** the 2026-09-25 design-chat draft of `SPEC_auth_state_ui_gating.md` (the "Canada" spec). Its diagnosis — a silent anonymous downgrade — does not apply to this build: the wrapper already refuses a null token. Do not build from that draft. Its useful parts (loading is never empty, the account-switch walks, the phantom-household check) are carried here.
**Gates:** the single `dev→main` promotion of this spec. The promotion now waits for this amendment and its walks.

---

## Why

Reproduced on dev (`ed24e8e`, iPhone PWA) on 2026-09-27, and consistent with the 09-25 Canada report (a phone just off a plane):

1. DT signed in, Airplane Mode for 3+ minutes, off, app reopened → toast *"Could not load meals: TypeError: Load failed"*. No Reconnecting… pill.
2. Same tab, on LTE, sign out DT, sign in DH → toast *"Bootstrap failed: TypeError: Load failed"*. Home shows the greeting only; Plan shows its title only; Browse has no catalog; the Places sheet lists every place but shows an **empty Members zone with Invite aboard and Leave place visible**; the wordmark reads "Provisions".
3. Tapping around for minutes, and switching back to wifi: **no heal**.
4. Force-quit and reopen: healed, but DH landed in **o11y Test House**, not Madbury.

Root cause (Claude Code trace, read-only, 2026-09-27):

- **WebKit's transport error is misclassified.** iOS reports a request that never reached the server as `TypeError: Load failed`; postgrest-js hands it back as a nameless error object. `classifyFetchError` knows Chrome's `Failed to fetch` but not WebKit's phrase, and its TypeError fallback needs `err.name` — so every such failure is `'real'`, which toasts instead of going to the pill. `classifyTokenFailure` in `authHealth.js` already lists `Load failed`; the two lists drifted.
- **Bootstrap is terminal.** `bootstrap_new_user` runs once, in Effect 1 of `useProvisions`. On any error it toasts and stops: no classification, no retry, no online listener; its deps (`userId, clerkId, email, sessionId`) don't change while the session lives. Every household-scoped load (Effect 2 and everything after it) waits on it. Effect 2's household fetch has the same terminal exit.
- **The connectivity store never learns it was offline.** A suspended PWA runs no JavaScript during Airplane Mode, so the `offline` event is missed; the store trusts events over a live `navigator.onLine`, the poll gate stays open, and the first ticks fire before the radio is up.
- **Not-loaded renders as empty.** Members and catalog have no loaded flag; the Members zone, Invite aboard and Leave place render off an empty array. `isHouseholdCreator` derives from members, so with members unloaded even the owner sees Leave place.
- **The active place is per browser, not per user.** `localStorage.activeHouseholdId` survives sign-out by design, so DH inherited DT's Madbury. On the cold start the context's first `get_my_households` also failed; the adopt effect then persisted bootstrap's own pick (most recently joined) — o11y Test House.

**Prod has the same bootstrap and classifier gap today** (`main` `421a4a8`: identical throw / catch / toast, identical phrase list). This is not a regression from the eleven commits. It means Helen and Elly are exposed now, and the fix belongs in the same promotion.

**Checked and ruled out:** a failed or zero-row bootstrap cannot create a household (the RPC's create step runs only after it finds no live membership; a fetch that never reached the server creates nothing; the client's auto-create in `resolveAfterHouseholdLoss` holds on any fetch error).

## Decisions

**A1 — One transient vocabulary.** `Load failed` (WebKit) and `Failed to fetch` (Chrome) are transient on every path. The classifier recognises a nameless object whose message starts `TypeError:`. `classifyFetchError` and `classifyTokenFailure` read **one shared phrase list**, so they cannot drift again. This also closes NEXT "Offline poll failures route to the connectivity pill, never a toast" (2026-09-12).

**A2 — Bootstrap is never terminal on a transient failure.** A transient bootstrap failure is a hold, not an error: report to the pill ("Reconnecting…"), no toast, and retry — bounded backoff (1, 2, 4, 8, 16, then every 30 s) **plus** an immediate attempt on `online` and on `visibilitychange` → visible. Mechanism is the builder's call; a `bootstrapAttempt` counter in Effect 1's deps is the suggested shape. A non-transient (`'real'`) bootstrap failure keeps today's toast.

**A3 — Effect 2's household fetch gets the same treatment.** Its early return on error is the second terminal exit; it holds and retries exactly as A2.

**A4 — Resume re-reads the world.** `isPollingOpen` consults `navigator.onLine` live, and the store resyncs `online` on `visibilitychange`. `navigator.onLine` is a hint only — it can read true before the radio is up — so the A2 backoff, not the flag, is what guarantees recovery.

**A5 — Not loaded is never drawn as empty.** Add `membersLoaded` (per active household) and `catalogLoaded`. Until `membersLoaded`: the Members zone shows the quiet placeholder; **Invite aboard and Leave place do not render**; `isHouseholdCreator` is not evaluated off an empty list; the wordmark stays neutral. Until `catalogLoaded`: Browse shows the quiet placeholder, not an empty catalog. Home and Plan already gate correctly (`homeReady`, `mealsLoadedFor`) and are unchanged. No new visuals — reuse the existing placeholder; a considered loading treatment needs its own mockup pass.

**A6 — Each person returns to their own last place.** The remembered active place is keyed per user: `activeHouseholdId:<clerkId>`. On sign-in, use that user's key if they're still a member; else fall back as today. Legacy key: adopt it once only if the user is a member, write the per-user key, delete the legacy key. DT's place never leaks to DH; DH comes back to Madbury.

**A7 — A failed first read is not "no place".** `ActiveHouseholdContext`'s initial `get_my_households` retries on a transient error (A2's backoff) before setting `loadingHouseholds` false. The adopt effect (`App.js` ~4220) must not persist bootstrap's fallback household while the context's read has errored rather than returned. The persisted place changes only by the person's own switch or by a real, successful membership read.

## Build order — one commit per slice, one tested change before the next

1. **A1** classifier + shared phrase list. Extend the authHealth Node check: nameless `{message: "TypeError: Load failed"}` → transient; `Failed to fetch` → transient; a `42501` → real.
2. **A2 + A3** bootstrap and household-fetch hold + retry.
3. **A4** connectivity resync on resume.
4. **A6 + A7** per-user remembered place; context initial-read retry; adopt-effect guard.
5. **A5** `membersLoaded` / `catalogLoaded` and the Places-sheet / Browse gates. Add any new selector to the RUM allow-list only if it is chrome.

## Verification — deployed dev preview, iPhone PWA on cellular unless noted

- **V8 (tonight's repro).** DT signed in, Airplane Mode 3+ min, off, **wifi off**, reopen, sign out, sign in as DH. Expect: no toast; "Reconnecting…" while the radio settles; Home cards, members and catalog arrive **without any tap** once the network is up; DH lands in **Madbury** (their own last place). Members zone never shows empty with Invite / Leave.
- **V9.** Same airplane cycle, no account switch. No "Could not load meals" toast; pill only; board and list arrive unaided.
- **V10.** Reverse switch DH → DT in one tab. DT lands in DT's own last place, never DH's. Then DT → DH: back to Madbury.
- **V11 (desktop Chrome, dev preview).** Block `*supabase.co*` in DevTools, sign in, unblock after ~10 s. Bootstrap completes within one backoff step of unblocking, no toast; the Places sheet shows a loading Members zone with no Invite / Leave until members arrive.
- **V12.** Wifi return heals: repeat V8 but turn wifi back on while held — recovery on the `online` event, not only on the timer.
- **Regression:** re-walk V1–V7 and the pill check from 2026-09-24.
- **Phantom check (dev):** confirm no household was created for DH around 2026-09-25 12:00–15:00 UTC or tonight 20:00–20:15 local (join `household_members` → `users` on `users.id`, filter by DH's `clerk_id`; verify column names first). Record the result; delete nothing.

## Promotion

This amendment rides the **same single `dev→main` merge** as the rest of the spec (the 2026-09-24 no-cherry-pick rule stands). Promotion Done-when gains: **V8–V12 pass on dev**, and one hour of prod RUM shows no `Bootstrap failed` toasts alongside `auth.session-lost` = 0 and `auth.activation-stuck` = 0.

## Out of scope — logged, not fixed here

- Other one-shot reads with no retry: `refreshMembers` (invite / remove flows only), `fetchLeftoverCutoff`, `loadSessions`, and the reads inside Effect 2 that ignore their errors (members, profiles, hidden items, staples, sessions). A5 and A3 cover the user-visible cases; the rest → NEXT: "one-shot reads adopt the hold-and-retry pattern."
- The watchdog treating a **successful** empty `get_my_households` as a real removal — correct by design; unchanged.
- The 2026-09-25 two-minute self-heal: most likely an iOS page eviction and reload on return (a cold start in disguise). Not chased.
