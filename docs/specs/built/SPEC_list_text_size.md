# SPEC — List Text Size (device-local preference)

**Scope:** OurProvisions
**Type:** New preference + CSS scaling across Browse and My List
**Risk:** Low. No schema, no RLS, no prod DB. Pure client + localStorage.
**Surface:** `src/App.js` only.

---

## What & why

Lists are often read at arm's length — sunlit cockpit tablet, deck, motion. Users need
to make list text bigger or smaller. This adds a 5-step text-size control to the existing
**Preferences** section of the profile sheet.

**Two decisions locked:**
1. **Device-local, not account-synced.** Text size is about the *screen and the light*,
   not the person. The boat tablet wants XXL; a phone may not. Stored in `localStorage`,
   never Supabase. No migration. The helper copy says "on this device" so the user isn't
   surprised it doesn't follow them.
2. **Control lives in Preferences, not on the list screen.** Text size is set ~once per
   device, not fiddled with. A permanent on-list button is chrome that doesn't earn its
   place (Ive cut). It sits next to the existing "Show prices & budget" row.

Governs **both** Browse and My List via one shared CSS variable, so the setting is one
coherent choice across tabs.

---

## The scale

Five steps. Gaps widen as they climb because perceived size is proportional, not absolute —
a flat step feels big at the bottom, invisible at the top.

| Index | Label   | scale |
|-------|---------|-------|
| 0     | Compact | 0.9   |
| 1     | Default | 1.0   |  ← default
| 2     | Large   | 1.2   |
| 3     | XL      | 1.45  |
| 4     | XXL     | 1.75  |

Persist the **index** (0–4), not the scale, under localStorage key `op_list_text_size`.

---

## Implementation

### 1. State + persistence (near other useState in the component, ~line 387 area)

```js
const TEXT_STEPS = [0.9, 1.0, 1.2, 1.45, 1.75];
const TEXT_LABELS = ["Compact", "Default", "Large", "XL", "XXL"];

const [textSizeIdx, setTextSizeIdx] = useState(() => {
  const saved = parseInt(localStorage.getItem("op_list_text_size"), 10);
  return Number.isInteger(saved) && saved >= 0 && saved < TEXT_STEPS.length ? saved : 1;
});
```

### 2. Apply to the CSS variable + persist (effect)

> **Why an effect, not inline:** the variable must be set on a stable root the list CSS
> can see, and re-applied whenever the index changes. Set it on `document.documentElement`.
> A future session: the variable lives on `:root`; the scaled classes read it via `calc()`.

```js
useEffect(() => {
  document.documentElement.style.setProperty("--op-list-scale", TEXT_STEPS[textSizeIdx]);
  localStorage.setItem("op_list_text_size", String(textSizeIdx));
}, [textSizeIdx]);
```

### 3. Declare the variable default in the `<style>` block

Add to `:root` (or `body`) so it always resolves even before the effect runs (prevents a
flash of unstyled scale on first paint):

```css
:root { --op-list-scale: 1; }
```

### 4. Scale the six content classes — `calc(<existing> * var(--op-list-scale))`

**GREP BEFORE EDITING — line numbers below are from this session and WILL drift.**

| Class            | Current (approx line) | Change font-size to |
|------------------|-----------------------|---------------------|
| `.item-name`     | 961  (Browse)         | `calc(0.88rem * var(--op-list-scale))` |
| `.price-display` | 968  (Browse)         | `calc(0.78rem * var(--op-list-scale))` |
| `.item-subtotal` | 972  (Browse)         | `calc(0.75rem * var(--op-list-scale))` |
| `.li-name`       | 989  (My List)        | `calc(0.95rem * var(--op-list-scale))` |
| `.li-qty`        | 991  (My List)        | `calc(0.75rem * var(--op-list-scale))` |
| `.li-subtotal`   | 992  (My List)        | `calc(0.95rem * var(--op-list-scale))` |

Leave ALL chrome unscaled: `.list-progress`, `.list-cat-title`, `.cat-title`, budget/tab/
header classes. Only the six row-content classes above change.

### 5. Let rows wrap so big sizes don't break layout

`.list-item` (~line 983): add `flex-wrap: wrap;`. At XL/XXL the qty+subtotal drop to a
second line under the name instead of being pushed off the right edge. Without this, XXL
looks broken. Confirm Browse's row container has equivalent wrap tolerance; if Browse uses
a different row class, apply the same there.

### 6. The control — new row in Preferences

Insert a sibling row after the "Show prices & budget" row (~line 2662, inside the
`{/* Preferences */}` block). Match the existing row shape: label + 11px helper on the
left, control on the right. The prices row uses a toggle; this uses a −/+ stepper because
there are 5 values.

- Label: **List text size**
- Helper: **Bigger text for the list, on this device**
- Control: stepper — `A` (small) / readout / `A` (large)
  - minus disabled at index 0, plus disabled at index 4
  - readout shows `TEXT_LABELS[textSizeIdx]`
  - onClick: `setTextSizeIdx(i => Math.max(0, i-1))` / `Math.min(4, i+1)`

Stepper styling tokens (match mockup): border `#E8D5B7`, radius 7px, bg `#fff`,
`A` glyphs Playfair 700 in `#A0724A` (minus 0.78rem, plus 1.05rem), readout 10px Lato
uppercase letter-spacing 1.5px in `#A0724A`, disabled glyph `#d8c8aa`.

> **Optional, recommended:** a small live "Preview" row beneath the stepper that scales in
> real time, since the control is now in a sheet away from the list. Lets the user set by
> feel without dismissing. Not required for first ship — defer if tight.

---

## Verify (deployed dev preview, not localhost)

1. Open Preferences → step the control 0→4. Both Browse and My List text grows/shrinks.
2. Chrome (category titles, progress label, budget header, tabs) does **not** move.
3. At XXL, a long item name wraps; qty/subtotal stay visible (drop to 2nd line, not off-edge).
4. Reload the page → size persists (localStorage).
5. Open on a second device / different browser → size is independent (device-local proven).
6. No flash of wrong size on first paint (the `:root` default covers it).

---

## Out of scope / explicitly NOT doing

- No `users.text_scale` column. No migration. No Supabase touch.
- No cross-device sync. This is deliberate, not a gap.
- No on-list-screen control. Lives in Preferences only.
