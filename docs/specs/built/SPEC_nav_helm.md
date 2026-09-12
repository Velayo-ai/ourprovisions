# SPEC — The Helm: nav moves to a floating bottom pill

**Scope:** OurProvisions · frontend only · no DB, no RLS/RPC surface
**Status:** Design decided 2026-09-11 (chat). Ready to build.
**Closes:** ROADMAP "Nav / affordances design decision" (July field testing: header tabs
not read as tabs; nav unreachable after a long scroll).
**Mockups:** `docs/mockups/mockup_nav_helm.html` (three postures)

---

## Why

Field testing said the espresso-header tabs don't read as tabs and can't be reached
from the bottom of a long list. Both are geometry problems: nav is at the top, the
thumb is at the bottom. Moving nav into a pill at the bottom edge fixes both without
touching what the tabs *do*.

The pill also gives the header one job — household identity (OurBanner) — instead of
identity *and* nav stacked in one strip.

## Decisions (record these)

| # | Decision | Rationale |
|---|---|---|
| D1 | Nav is a **floating pill** at the bottom edge, not an edge-to-edge bar. | Content scrolls under it; reads as an object, matches the fleet "helm" idea. Cost is bottom padding + safe-area handling, accepted. |
| D2 | Doors are **icon + label**. Labels never drop in the navigational posture. | Plan/Browse/Shop aren't universal glyphs. Icon-only pills (Mercury) are a beta-household risk. |
| D3 | The pill has **two postures**: *navigational* (labels) and *session* (icons only, plus the trip's two actions riding in the pill: **+** and **Wrap up**). | The app has two modes — browsing/planning vs. a shopping trip. The pill's shape tells you which you're in. **A trip's actions live at the helm** — nothing floats over rows where swipe gestures happen. |
| D3a | The floating **+** (`.shop-fab`, live on prod since 2026-09-11) **moves into the pill** in session posture. It is not lifted above the pill and not sent back to the header row. | The + and the pill occupy the same corner at the same z-index today; two floating objects in the thumb corner is the clutter the pill exists to remove, and the header row gives up thumb reach. |
| D4 | **Wrap up leaves the Shop header row.** Shop header becomes `[count] [Aisles \| A–Z]` + progress bar. | Amends the 09-09 Shop surface contract in ARCHITECTURE (`[count] [Aisles \| A–Z] [Wrap up]`). One home for Wrap up, not two. |
| D5 | Past **700px** wide the pill unmounts and the same doors render as a **left rail**. | Rail is right where width is cheap and thumb reach doesn't apply (galley iPad, laptop). Vertical nav on a phone is rejected: thumb geometry, iOS back-swipe / swipe-to-delete collision, 14% of row width. |
| D6 | Doors are **one shared array**, two renderers. | Icons, order, and names cannot drift between pill and rail. Same array becomes the fleet nav grammar for other Our___ apps. |
| D7 | **Four doors from day one** (Home · Plan · Browse · Shop). Home routes to a placeholder that states what it will become, the same way Plan shipped ahead of its content. | The pill's shape is what households learn; adding a fourth door later shifts every other door under the thumb. A placeholder that names the promise ("Tonight's meal and what's happening in Madbury will live here") teaches the app instead of apologizing. |
| D8 | Posture change animates (~200ms) on a person's action; **no animation on first load**. | Motion answers a tap. |
| D9 | **The helm's left side is constant; its right side is the context slot.** The four doors never change. The context slot holds at most **two** actions for whatever the person is actively doing — shopping today (+, Wrap up); cooking or an event later. | Navigation stays familiar while the app changes around the task. A cap of two keeps the pill a pill. Nothing task-contextual goes back into the header. |
| D10 | **Wrap up answers the trip, not the screen.** It renders muted (outlined, sand) while nothing is in the cart and fills amber on the first check. It is **tappable in both states**. | The helm should respond to the shopping journey. But a person whose store had nothing still needs the exit — emphasis changes, availability never does. |

## Current state (anchors — grep before every edit)

- Tabs render inside the OurBanner region wrapper in `App.js` as `<button className="tab …">` driven by `view` state: Plan → `view === "plan"`, Browse → `view === "input"`, Shop → `view === "list"`. Verify the exact Plan value in-file.
- Tab color/opacity is photo-aware (`bannerHasPhoto`, `CHROME_SHADOW`). **This styling dies with the strip** — the pill is espresso on cream regardless of banner.
- Shop tab carries `<span className="badge">{totalItems}</span>`.
- Wrap up: `<button className="wrapup">` in `.list-header` on Shop, pre-selects pending items into `wrapUpRollItems` and opens `showWrapUpModal`. A second "Wrap Up Trip →" button lives in the `.all-done` row when `checkedCount === totalItems`.
- Shop lens: `<ShopLensSegment lens={shopLens} onChange={setShopLens} />` in the same header row.
- Floating +: `<button className="shop-fab" onClick={openAddSheet}>` rendered on Shop, hidden while `showWrapUpModal || addSheetOpen`; CSS `position: fixed; right: 18px; bottom: 24px; z-index: 900`. `.shop-list-tail` (88px) reserves clearance for it.

## Change

### 1. `NAV_DOORS` — one source of truth
Add near the top of `App.js` (or `src/nav.js` if Claude Code prefers a file):

```js
const NAV_DOORS = [
  { key: "home",   label: "Home",   view: "home",  Icon: HomeIcon },
  { key: "plan",   label: "Plan",   view: "plan",  Icon: PlanIcon },
  { key: "browse", label: "Browse", view: "input", Icon: BrowseIcon },
  { key: "shop",   label: "Shop",   view: "list",  Icon: ShopIcon, badge: true },
];
```
Icons: lift the existing tab SVGs into small components. Same paths, `currentColor`.
`HomeIcon` is new (house outline, 1.6 stroke — see mockup). Add a `view === "home"`
branch that renders `<HomePlaceholder />`: cream page, the household greeting, and one line
— *"Tonight's meal and what's happening in {household} will live here."* Nothing else.
Home is the **default view** for new sessions only if the placeholder is in place; until then
leave the current default untouched.

### 2. `<Helm />` — the pill
Rendered once, outside the scrolling content, `position: fixed`.

Props: `view`, `onChange`, `posture` (`"nav" | "session"`), `badgeCount`, `onAdd`, `onWrapUp`, `canWrapUp`, `wrapUpEmphasized` (= `checkedCount > 0`).

- Navigational posture: 64px tall, `left/right: 16px`, `bottom: calc(18px + env(safe-area-inset-bottom))`, `border-radius: 32px`, background `rgba(44,26,14,0.94)` with `backdrop-filter: blur(10px)` and a solid `#2C1A0E` fallback. Doors flex equally; icon 20px over a 0.62rem uppercase label, sand (`#C9A97A`); active door cream (`#FAF4EC`) on `rgba(201,169,122,0.10)` with a 26px radius — the cream icon carries the state; the capsule is a hint, not a block.
- Session posture: 48px tall, labels hidden (`font-size:0` — keep them in the DOM for screen readers), icons 18px. After the doors: a 1px sand hairline at 18% opacity, then a round **+** (36px, cream `#FAF4EC` on espresso, `aria-label="Add something"`, `onClick={onAdd}`), then the **Wrap up** chip: 0.72rem uppercase, `border-radius: 20px`, `onClick={onWrapUp}`, rendered only when `canWrapUp`. Two visual states (D10): **muted** while `checkedCount === 0` — transparent fill, 1px sand border, sand text; **full** once `checkedCount > 0` — amber `#c8973a` fill, espresso text. Both states are enabled buttons; the transition is the same 200ms. Doors keep `flex: 1`; + and Wrap up are `flex: 0 0 auto`.
- Transition: `height`, `border-radius` and the label opacity at 200ms; Wrap up slides in from the right. Skip transitions on mount (a `mounted` ref or a `no-anim` class removed after first paint).
- Badge: reuse the existing `.badge` on the Shop door.

**Posture rule for v1:** `posture = view === "list" ? "session" : "nav"`. On Shop the pill is always slim and always carries **+** (an empty list still needs a way to add — today's + shows on empty Shop too). `canWrapUp = totalItems > 0`. (Tying posture to `activeSession` instead is a later refinement; sessions start on first in-store action, so the trip would open with no exit.)

### 3. `<Rail />` — wide posture
Same `NAV_DOORS`, rendered as an 84px espresso column on the left: Provisions mark at top, doors as 64×60 tiles with 14px radius (same active treatment), spacer, member avatar at the bottom. Household identity moves into the body header on wide. Media query at `min-width: 700px`: mount `<Rail />`, unmount `<Helm />`. A `useMediaQuery` hook or a CSS-only show/hide are both fine; pick one and note it in the handoff.

### 4. Remove the strip
Delete the three `<button className="tab">` elements and the `.tabs` container from the OurBanner region. Remove `bannerHasPhoto`-driven tab styling and any `.tab*` CSS that has no other consumer (grep `.tab` before deleting — `.tab-content` and `.badge` may be shared).

### 5. Shop header amendment (D4)
Remove `<button className="wrapup">` from `.list-header`; the row is now `[count] [ShopLensSegment]` then the progress bar. Move the pre-select logic into a `openWrapUp()` function called by both the helm's Wrap up chip and the existing `.all-done` "Wrap Up Trip →" button (keep that one — at 100% it's the celebratory path).

### 5b. Retire `.shop-fab`
Delete the `.shop-fab` button, its CSS, and `.shop-list-tail` (the general scroll padding in §6 replaces it). `openAddSheet` is unchanged and becomes the helm's `onAdd`. Keep the existing hide-while-sheet-open behavior implicitly: sheets sit above the pill (§7).

### 6. Scroll padding
Every scrolling root gets `padding-bottom: calc(110px + env(safe-area-inset-bottom))` so the last row clears the pill. Add a cream fade above the pill:
`linear-gradient(to bottom, rgba(250,244,236,0), rgba(250,244,236,0.85) 55%, #FAF4EC)`, 110px tall, `pointer-events: none`, fixed above the pill. On wide, neither applies.

### 7. Sheets and modals
Bottom sheets (Add sheet, Profile sheet, Wrap up modal) already overlay at `zIndex: 1000`. The helm sits at `zIndex: 900` — under sheets, over content. Confirm nothing else claims 900–999.

## Not in this change
- HOME v1 content — the placeholder is a stub, not a design.
- Session posture driven by `activeSession` (revisit once in-store capture is verified).
- Any change to Plan's internals — the single-surface PLAN layout is a separate amendment to `SPEC_meal_planning_v1.md`.
- Fleet extraction of `NAV_DOORS` into Velayo-ai.

## Verification (deployed dev preview, phone + wide)

**Phone (≤ 699px)**
1. Strip gone from the header; OurBanner shows identity only, photo or not.
2. Pill shows Home · Plan · Browse · Shop with labels; Home opens the placeholder with the correct household name; active door is cream; tapping switches `view` exactly as the strip did.
3. Shop badge count appears on the Shop door and matches the old badge.
4. On Shop with ≥1 item: pill slims, labels hidden, **+** and **Wrap up** present; **+** opens the Add sheet exactly as the old floating + did (catalog hit adds unchecked with "added here"; hidden-item reveal; create under Other); **Wrap up** opens the wrap-up modal with pending items pre-selected — identical to the old header button.
5. On Shop with 0 items: pill is slim with **+** and no Wrap up; + opens the Add sheet from the empty state.
5b. No `.shop-fab` anywhere; nothing floats over the list on Shop.
5c. Shop with items and 0 in cart: Wrap up is outlined sand and **still opens the modal**. Check one item: Wrap up fills amber. Uncheck it: back to outlined.
6. Shop header row is `[count] [Aisles | A–Z]` + progress; no Wrap up in the row.
7. At 100% checked, the "Wrap Up Trip →" all-done button still works.
8. Last row of a long Browse and a long Shop list is fully readable above the pill (padding + fade). Scroll to the bottom on each: nothing hidden.
9. Open the Add sheet and Profile sheet: they cover the pill, not the reverse. Close: pill returns.
10. iOS Safari / PWA: pill clears the home indicator (safe-area inset honored).
11. Switching Home→Shop animates the posture change; a hard refresh on Shop shows the slim pill with no animation.

**Wide (≥ 700px)**
12. Pill gone; left rail with the same four doors, same order, same icons; active treatment matches.
13. Household name renders in the body header.
14. Resize across 700px both ways: exactly one of pill/rail is mounted at any width.

**Done when:** 1–14 pass on the deployed dev preview; then promote dev → main and re-run 2, 4, 8, 10 on `ourprovisions.velayo.ai`.

## Handoff notes
- Update the Shop surface contract line in ARCHITECTURE to `[count] [Aisles | A–Z]` → progress bar; Wrap up lives in the helm.
- ROADMAP: move "Nav / affordances design decision" to DONE; note under HOME v1 that the door and placeholder exist — HOME builds into `view === "home"`; add "Helm session posture ← activeSession" to NEXT (small).
- DECISIONS LOG: D1, D3, D5, D6, D9, D10 from the table above.
- **Future (HOME v1, not this build) — decided 2026-09-11:** default landing view moves Browse → Home only once HOME v1 is finished and approved. Exception: land on **Shop when a shopping session is open** (trip in progress, 8h expiry) — not when the list is merely non-empty, since the list is non-empty most of the week and Home would never be seen. **No default-view change ships in this build.**

---

# v2 — 2026-09-12 — One pill, answers your scroll

**Status:** Supersedes D3, D3a, and the session-slot half of D9. Decided after the v1 build
was walked on a phone (dev, commits 5026c07…f59a209). Mockup of record:
`docs/mockups/mockup_nav_helm_v2.html`.

## Why we moved

v1 reshaped the pill on entering and leaving Shop. On the phone that meant every tab tap into
or out of Shop was an event — glancing at the list to see what's on it made the nav
announce a trip, and tapping Browse mid-look made it announce the trip was over. Tying the
posture to `activeSession` would have fixed the tab tap but still changed the nav's shape
for a reason the person can't see. The fix is to give the pill exactly one trigger the person
controls with their own hand: scrolling.

## Decisions (v2)

| # | Decision | Rationale |
|---|---|---|
| D3′ | **The pill is identical on every door.** No posture change on navigation, ever. | Navigation must never surprise. A tab tap is the most ordinary act in the app. |
| D9′ | **The pill is compact exactly when the door's header controls are off-screen.** Position-based, not direction-based: compact once the door's control row (Shop: the `[count] [lens] [+] [Wrap up]` row; Browse: the search + chips block; Plan: the lens row) has scrolled ~8px past hidden; full again once it is ~8px back into view. No direction tracking. *(Amended 2026-09-12 after the phone walk: the v2 direction rule let a small upward scroll restore the full pill mid-list, leaving no + on screen while the header row was still out of sight.)* | The pill's + and the header's + are the same control changing places; a position rule guarantees one of them is always visible. Labels return at the top, where they'd be read; D12 already gives the teaching job to Home. |
| D11 | **The + does the door's add.** In the compact state a cream **+** appears at the pill's right end and opens the current door's add: Shop → Add sheet (add-from-the-aisle, "added here"); Browse → the same Add sheet; Plan → New meal (when built). Home → no +. At rest, no + on the pill. | One button, one gesture, meaning follows the door. It appears exactly when the header's own controls have scrolled away — thumb reach without a floating object. Plan's other add (put a meal on the board) stays on the library row; the + never becomes a menu. |
| D12 | **Home never compacts.** The helm stays full — labels, 56px — on Home regardless of scroll. | Home is the foyer: where a person learns what the four doors are. The helm compacts where you're working; it stays full where you're orienting. Corollary for HOME v1: Home never puts an action in the pill; anything Home wants you to do is a card in the body. |
| D4′ | **Wrap up and + return to the Shop header row:** `[count] [Aisles \| A–Z] [+] [Wrap up]`, then the progress bar. The row scrolls away with the list. | The trip's controls are part of the list; the pill is chrome. At rest the controls are in the row; scrolled, the + is at the thumb — they hand off, and the person never hunts in either direction. |
| D10 | Unchanged in substance: Wrap up is muted (outlined sand) at 0 in cart and amber once one item is checked; tappable in both states. Now on the header chip. | — |
| D1, D2, D5, D6, D7, D8 | Unchanged. | — |

## Sizing

- At rest: 56px tall, `left/right: 24px`, `border-radius: 28px`, icons 18px over 0.58rem labels, active capsule `rgba(201,169,122,0.10)`.
- Compact: 44px tall, `left/right: 52px`, `border-radius: 22px`, icons 17px, labels `font-size: 0` (kept in DOM), trailing 1px sand hairline then a 32px cream **+** (`aria-label` = the door's add), `flex: 0 0 auto`.
- Fade above the pill: 90px.
- Transitions: `height`, `left`, `right`, `border-radius`, label opacity, + opacity — 200ms. None on mount.
- Rail (≥700px): no compact state, no +. The rail carries the trip's controls as v1 built them (stacked above the avatar) only if the Shop header row is off-screen on wide; otherwise the header row is enough. Cody: prefer the header row and remove the rail context slot unless a laptop can't reach it.

## Change (from the v1 build)

1. Remove the session posture: `posture`, `onAdd`, `onWrapUp`, `canWrapUp`, `wrapUpEmphasized` props and the context-slot markup in `<Helm />`. Remove the `activeSession` posture item from NEXT.
2. Restore `<button className="wrapup">` and add a round `+` (`openAddSheet`) to `.list-header` on Shop, after `<ShopLensSegment />`. Both `openWrapUp()` and the all-done "Wrap Up Trip →" are unchanged.
3. Add a `useScrollCompact(scrollRootRef, controlsRef)` hook: rAF-throttled scroll listener on the scrolling root; `compact = controls row bottom < 0 - 8px` (leave), `compact = false` once `bottom > +8px` (return); no direction tracking; ignores negative offsets (iOS overscroll). Each door passes a ref to its control row; Home passes none and is never compact. `<Helm compact={compact} onPlus={doorAdd} />`.
4. `doorAdd` map: `{ list: openAddSheet, input: openAddSheet, plan: openCreateMeal /* when built; until then undefined → no + */ }`. `home` absent. Render the + only when the map has an entry for the current view.
5. Resize the pill per Sizing.
6. ARCHITECTURE: rewrite the Helm section to v2; Shop surface contract back to `[count] [Aisles | A–Z] [+] [Wrap up]` → progress. DECISIONS LOG: D3′, D9′, D11, D12, D4′; mark D3/D3a/D9 superseded with the "why we moved" line.

## Verification (phone, dev preview)

1. Pill identical on Home, Plan, Browse, Shop at rest: same size, labels, position. Tab taps never change its shape.
2. On Browse: scroll until the search + chips block is off-screen → pill compacts and a + appears at its right, in one 200ms motion. Scroll up a few px mid-list → **stays compact** (the block is still hidden). Scroll until the block reappears → returns to full, + gone. Repeat on Shop (threshold = header control row) and Plan (lens row).
2b. At no scroll position on Shop, Browse, or Plan is there zero + visible: either the header's + or the pill's + is on screen.
3. On Home: scroll to the bottom of whatever is there → pill stays full. No +.
4. Compact + on Shop opens the Add sheet with the in-store paths ("added here", hidden reveal, create under Other). Compact + on Browse opens the same sheet without "added here". On Plan: no + until New meal is wired (or + opens New meal if it is).
5. Shop header row at the top: `[count] [Aisles | A–Z] [+] [Wrap up]` then progress. Header + opens the Add sheet. Wrap up outlined at 0 in cart and still opens the modal; amber after one check; back to outlined on uncheck.
6. Scroll Shop down: header row scrolls away with the list; the compact pill's + is now the only +. Scroll up: row returns, pill +, gone.
7. Hard refresh mid-list: pill renders in the correct state with no animation.
8. Sheets (Add, Profile, Wrap up) cover the pill in both states; on close the pill is in the state the scroll position implies.
9. iOS: rubber-band at the top does not flicker the pill; safe-area margin intact in both states.
10. Wide (≥700px): rail unchanged in size on scroll; Shop header row carries + and Wrap up; no duplicate + on the rail unless the row is unreachable.

**Done when:** 1–10 pass on dev; promote; re-run 1, 2, 5, 6 on prod.
