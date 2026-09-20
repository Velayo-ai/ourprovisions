# SPEC_rum_dxa_exposure.md

**Scope:** Platform · `src/rum.js` + one nav decision in `App.js` · dev first, then prod
**Status:** ACTIVE — build-ready; all decisions closed
**Authored:** 2026-09-16 (design chat)
**Supersedes nothing.** Extends `SPEC_rum_session_replay_masking.md`; its dev/prod split and the Clerk exclusion floor are unchanged and restated here as invariants.

---

## Why

Splunk Digital Experience Analytics (DXA) turns RUM data into user journeys, funnels and segments. It runs on the same agent we already ship, but reads three things `rum.js` does not expose today: a persistent anonymous user ID, click-event text under an explicit privacy policy, and page views. The first two are config; the third is a product decision because OurProvisions never changes its URL.

Source of truth: Splunk "Set up Digital Experience Analytics" (help.splunk.com, updated 2026-03-13) and the `@splunk/otel-web` v2.x changelog. Anything below that contradicts those at build time — the docs win; note it in the handoff.

---

## Decisions

| # | decision | rationale |
|---|---|---|
| D1 | **Agent floor is `@splunk/otel-web` ≥ 2.0.0** (recorder to its matching major). Step 0 of the build is `npm ls @splunk/otel-web`; upgrade if below. | DXA rejects older agents. v2.0 also flipped `user.trackingMode` default to anonymous — we want that, and we want it *stated*, not inherited from a default that could flip again. |
| D2 | **Anonymous tracking, stated explicitly.** `user: { trackingMode: 'anonymousTracking' }`, `cookieDomain: window.location.hostname`. No identified tracking yet. | Beta users have not been told they are tracked by identity. Anonymous ID gives cross-session journeys without a Clerk id or email leaving the app. `cookieDomain` pinned to hostname keeps dev and prod IDs separate — a shared `velayo.ai` cookie would merge Dan's dev sessions into prod journeys. |
| D3 | **Page identity → hash routes.** Helm/Rail navigation writes `location.hash` (`#/home`, `#/plan`, `#/browse`, `#/shop`); sheets/modals do not. The RUM agent's built-in route-change instrumentation turns these into page views with no custom-event code. | DXA journeys are page-view sequences. Today the app is one URL, so the funnel Dan wants (open → Plan → Lock in → Shop → Wrap up) is invisible. Hash routes are the smallest change that makes the four doors first-class pages, and they survive reload/back gracefully. **Decided 2026-09-16:** Wrap up gets its own hash (`#/shop/wrap-up`) so the funnel's last step is a page view; the Add Items sheet and other modals do not. |
| D4 | **Click-text privacy mirrors the replay split, with a tighter prod allow-list.** `privacy` block on `SplunkOtelWeb.init`: dev `maskAllText: false`; prod `maskAllText: true` + `unmask` for app chrome only (helm/rail labels, sort toggle, Wrap up / Add / Lock in / Dismiss buttons) + the Clerk `exclude` floor in both. Item names, meal names, household name, and any `<input>` stay masked on prod. | DXA analyses by "clicked text" are what make the funnel readable ("Wrap up" vs `[Button]`). App chrome carries no household data; item and meal names do. The replay policy already draws this line — D4 reuses it rather than inventing a second one. |
| D5 | **Household as a segment dimension.** `globalAttributes: { 'household.id': <uuid> }` set via `SplunkRum.setGlobalAttributes()` once the active household resolves (from `ActiveHouseholdContext`), cleared on household switch. No user id, no email, no household name. | Journeys per household is the product question (does *a crew* plan → shop → wrap, not does a browser). A uuid is pseudonymous and already lives in every RPC call. Name is text; text is masked; keep it that way. |
| D6 | **Frustration signals on in both envs.** `instrumentations.frustrationSignals: { deadClick: true, errorClick: true }` (agent ≥ 2.5). | The "Could not wrap up" toast on 09-14 would have surfaced as an error click before a guest found it. Cheap, and it feeds DXA directly. |

**Deferred, on purpose:** identified tracking (Clerk id → RUM user), session-replay sampling, DXA event definitions and funnels themselves (built in the Splunk UI after data lands, not in code).

---

## Invariants carried forward (do not "clean up")

- `isProd` split stays; `deployEnv === 'production'` is the exact Vercel value.
- Clerk `exclude` rules (`[class*="cl-"]`, `#clerk-components`) are unconditional in **both** the recorder and the new `privacy` block.
- On prod an `unmask` rule beats `maskAllText`; the prod unmask list must be an explicit allow-list of chrome selectors, never `body`.
- No init when `REACT_APP_RUM_TOKEN` is absent.

---

## Change shape (for Claude Code; not the diff)

`rum.js`
- Add `user`, `cookieDomain`, `privacy`, `instrumentations.frustrationSignals` to `SplunkOtelWeb.init`. `privacy.sensitivityRules` is built from the same `isProd` conditional as the recorder's, with the prod branch holding the chrome allow-list instead of `unmask body`.
- Export a small `setHousehold(id)` helper wrapping `SplunkRum.setGlobalAttributes` (no-op when RUM did not init).

`nav.js` / `App.js`
- Helm and Rail write `location.hash` on door change; a `hashchange` listener sets `view` so reload/back land on the right door. `view` values stay as-is (`input`, `list`, …) — the hash is display grammar, not state rename.
- `ActiveHouseholdContext` (or its consumer in `App.js`) calls `setHousehold` on change.

Chrome selectors for the prod allow-list: Claude Code identifies them from `nav.js` and the Shop header; add a stable class (`op-chrome`) if none exists rather than unmasking by tag.

---

## Verification

Dev first, prod only after dev reads clean.

1. `npm ls @splunk/otel-web @splunk/otel-web-session-recorder` — both at the floor or above.
2. Load dev: `_splunk_rum_user_anonymousId` cookie present, scoped to the dev hostname only.
3. Tap each door: Splunk RUM shows four distinct page views with the hash URLs; a reload on `#/plan` opens Plan.
4. Click an item row on **prod-masked** config (flip `isProd` locally to test): the click span reads `[Button]`/`[div]`; click Wrap up: reads `Wrap up`. Click inside Clerk: no span text at all.
5. Switch household: `household.id` attribute changes on subsequent spans.
6. Splunk → Digital Experience → Overview: OurProvisions listed under Available applications, with dev and production environments separate.

Done when 1–6 pass on dev, the prod deploy repeats 2, 4, 6, and one end-to-end journey (open → Plan → Lock in → Shop → Wrap up) is visible as a page sequence in DXA for a single anonymous user.

---

## Risks

- **Hash routing touches every `view ===` branch by implication.** It must be additive (hash mirrors state) not a rewrite. If Claude Code finds it wants to rename `view` values, stop — that is a different spec.
- **Prod unmask list drift.** Any future chrome that renders household text (e.g. a household-name pill in the helm) must not inherit the `op-chrome` class. Note in `nav.js` header.
- **Agent upgrade may change span names.** Existing RUM dashboards/detectors get a read-back after upgrade.
