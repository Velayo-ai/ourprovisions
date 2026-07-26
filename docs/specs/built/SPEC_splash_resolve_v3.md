# SPEC — Splash: Resolve-in-Place (v3)

**Scope:** OurProvisions
**File:** `src/App.js` — `SplashScreen` component (currently headed
`// Splash scene — Vessel Identity (SPEC_splash_vessel_identity_v2).`, ~line 173)
**Supersedes:** `SPEC_splash_vessel_identity_v2` (the 3-act "horizon → vessel →
house" reveal). Retire that spec on merge.
**Type:** Motion redesign + geometry + timing constants. No schema, no DB, no RLS.
**Verify:** dev preview, real browser (not the in-app viewer), before prod.

---

## Why (decision trail — read before editing)

The v2 splash reveals in **three sequential motions with beats between them**
(horizon settles ~1.2s → vessel at 1.5s → house at 2.8s, settling ~4.0s). On a
real cold start this reads as a **staged PowerPoint build** — the viewer watches
the slide assemble, each element performing its own entrance (the arch even
*draws itself* L→R). Dan's call, confirmed against a side-by-side motion mockup:
the staged build is the cheap tell, not the elements themselves.

**New thesis — "the word arrives into itself."** The whole composition resolves
as **one slow gesture**: a blur-to-sharp *in place* (no translation, no
per-element choreography, no self-drawing arch), everything on one easing curve,
~2.5s, luxurious. This generalizes the phrase already in the v2 wordmark comment
("emerges IN PLACE… the word arriving into itself") to the entire lockup.

Three separate defects are fixed in the same pass because they're entangled with
the same code:

1. **"Constantly too low."** Root cause found in `measure()`: the lockup is a
   **bottom-weighted group** (arch is a thin crown; wordmark + line + tagline
   carry the mass) and the code centers the group's **bounding box** at
   `OP_GROUP_CENTER` (0.48). The eye centers on the **wordmark**, which sits
   *below* the box center — so box-centering always reads low. Every past nudge
   fought this instead of naming it. Fix: center on the **wordmark's optical
   center**, not the group box.
2. **The orphaned horizon seam** (`op-bloom`) — a bright line under the wordmark
   that has no job on the splash (it's the OurBanner gradient-dissolve idiom
   bleeding in). It's the "line that doesn't make sense" from the original
   report. **Remove entirely.**
3. **Foot colophon.** v2 puts the Velayo mark + "VELAYO INC." at the foot. The
   full Velayo lockup asset is a *hero* asset — illegible at foot size — and its
   built-in crest arc creates a **second arch** echoing the OurProvisions crown
   (the "repeated glyph" failure mode). Replace with a **typeset "VELAYO INC."**
   line, no glyph. Removes the double-arch and the `velayo-mark.png` dependency
   from the splash foot.

**Keep unchanged (these are the *good* parts of v2 — do not touch):**
- The wordmark→header **hand-off** on exit (`op-handoff`, `measure()`'s dx/dy/s
  computation in `exit()`). This is expensive motion done right — one purposeful
  continuous gesture. It stays exactly as-is.
- The **readiness gate** and **failsafe** structure (§5). Only the *durations*
  change (below), not the gating logic.
- The **reduced-motion** path — must still resolve to the final static state with
  no blur/animation.

---

## 1 — Motion: one resolve, replacing the 3 acts

**Remove** the staged reveal animations and their keyframes:
- Wordmark: `.op-crest .op-wm { animation: opSurface 1.0s … 1.5s … }` (~L467)
- Tagline: `.op-crest .op-tag { … 1.57s … }` (~L469)
- Arch fade: `.op-crest .op-arch { animation: opArchIn 1.1s … 2.8s … }` (~L471)
- **Arch self-draw:** `.op-crest .op-arch path { animation: opArchDraw … 2.85s }`
  and `@keyframes opArchDraw` (~L473–474) — DELETE. The arch must render already
  drawn (`stroke-dashoffset: 0` in the base `.op-arch path` rule).
- Footer: `.op-crest .op-foot { … 2.85s … }` (~L475)

**Ambient layers stay** (they read as atmosphere, not a solo): the depth-open
(`opDepthOpen`) and vignette-open (`opVigOpen`) may remain as an underneath
texture, but retime them to settle *within* the resolve window (≤2.5s), not as a
distinct "Motion 1" that finishes before the wordmark starts. If they call
attention to themselves in the preview, cut them — the resolve is the point.

**Add** one shared resolve. Every foreground element starts
`opacity:0; filter:blur(18px)` (arch/tagline/foot may use a smaller start blur,
~10px, since they carry less detail) and resolves to sharp on **one curve**:

```
OP_EASE_RESOLVE = cubic-bezier(0.22, 1, 0.36, 1)   /* long, slow tail */

.op-crest .op-wm   { animation: opResolve 2.5s var(--op-ease-resolve)   0ms forwards; }
.op-crest .op-arch { animation: opResolveArch 2.5s var(--op-ease-resolve) 60ms forwards; }
.op-crest .op-tag  { animation: opResolve 2.5s var(--op-ease-resolve)   90ms forwards; }
.op-crest .op-foot { animation: opResolve 2.5s var(--op-ease-resolve)  120ms forwards; }

@keyframes opResolve     { to { opacity: 1;   filter: blur(0); } }
@keyframes opResolveArch { to { opacity: .92; filter: blur(0); } }  /* arch final opacity */
```

Rules:
- **No translation** anywhere — the motion is the *sharpening*, not a rise.
- Internal stagger stays **< 120ms** so it breathes as one event, never a
  staged build. Do NOT reintroduce beats.
- `2.5s` is the approved starting value (slowest end of the mockup dial). It's a
  dial — Dan will confirm on the preview; expose it as a constant if convenient.

## 2 — Geometry: raised crown + locked 2:1 spacing

In `measure()` (~L283), the internal spacing is expressed as relationships to the
wordmark box. Set the two vertical gaps to a **locked 2:1 ratio**, measured as
*true visible* edge-to-edge distances:

- Define one base gap, e.g. `const TAG_GAP = 0.72;` (× wordmark height) — the
  visible gap from the **wordmark bottom** to the **tagline top**.
- Arch gap = `2 * TAG_GAP` — the visible gap from the **arch bottom** to the
  **wordmark top**. Keep this derived (`2×`) so the ratio can't drift when the
  base is tuned.
- Arch width unchanged (`0.52 × wordmark`, the §3 locked ratio).
- `TAG_GAP` (0.72) is a tuning dial — Dan approved "more room to breathe" at this
  value in the mockup; confirm on preview.

## 3 — Position: center on the WORDMARK, not the group box

This is the "too low" fix. In `measure()`:
- Rename intent from group-box centering to **wordmark-optical-center**.
- Set the wordmark's optical center at `OP_GROUP_CENTER` of the **visible**
  viewport (keep the existing `window.visualViewport` logic — that part is
  correct and load-bearing on mobile).
- **Change `OP_GROUP_CENTER` from `0.48` → `0.46`** (~L187) and change what it
  *anchors*: it now positions `wmTop = (OP_GROUP_CENTER * visH) - wmH/2`, i.e.
  the wordmark's own center lands at 46% — NOT the group box's center.
- Derive arch-top and tagline-top from `wmTop` using the §2 gaps. The arch and
  tagline are satellites of the wordmark; the wordmark alone owns "center."

Result: the wordmark sits at optical center (~46%, a hair above true middle),
with the arch breathing above and the tagline close below. The empty espresso
reads balanced top-to-bottom instead of top-heavy.

## 4 — Remove the horizon seam entirely

- Delete the `.op-bloom` element from the JSX (`{!reduced && <div className="op-bloom" …/>}`, ~L515).
- Delete the `.op-bloom` CSS rule (~L385–394), `.op-crest .op-bloom` (~L395), and
  `@keyframes opBloom` (~L396–400).
- Delete the `--op-bloom-top` line in `measure()` (~L306).
- Leave OurBanner's own gradient-dissolve seam untouched — this only removes the
  seam from the **splash**.

## 5 — Foot colophon: typeset, no glyph

- Replace the foot markup (`<div className="op-foot">` with the `<img
  velayo-mark.png>` + text, ~L523–526) with a single typeset line:
  `<div className="op-foot"><div className="op-vt">VELAYO INC.</div></div>`
- Foot styling: Lato 400, ~10px, letter-spacing ~5px, uppercase, color
  `#C9A97A` (sand), opacity ~0.75. Bottom offset ~48px so it isn't jammed to the
  edge.
- **Removes the `velayo-mark.png` dependency** from the splash foot. (The asset
  stays in the repo for other uses — marketing hero, About page, deck covers.
  Do not delete the file.)

## 6 — Timing constants (retune together — this is the trap)

A ~2.5s resolve must not be cut off mid-sharpen by the readiness gate. Retune
all three so the dissolve can only begin *after* the resolve has fully settled:

- `OP_REVEAL_MS` **4450 → ~3100** (~L182): resolve (2.5s) + a short settled hold
  (~0.6s). This is the window before `revealDone` arms.
- `OP_MIN_VISIBLE` **2000 → ~2800** (~L181): the splash must be visible at least
  as long as the resolve takes to finish, so a fast-loading app never dissolves
  mid-blur. Set ≥ resolve duration.
- Confirm `OP_FAILSAFE_MS` still comfortably exceeds `OP_REVEAL_MS` (unchanged if
  already generous; bump if it was tuned near 4.45s).
- Leave `OP_SURFACE_MS` (the hand-off/dissolve duration) unchanged unless the
  preview shows a gap.

**Verification of timing:** on the dev preview, confirm (a) the wordmark reaches
full sharpness *before* any dissolve begins, on both a fast reload and a
throttled/slow load; (b) reduced-motion shows the resolved static state with no
blur; (c) the wordmark→header hand-off still lands correctly (unchanged, but
verify it wasn't disturbed).

---

## Reference mockup

`splash_motion_v2.html` (design-chat artifact) is the approved visual target:
blur-resolve in place, ~2.5s, raised-crown 2:1 spacing, wordmark at ~46%, no
seam, typeset "VELAYO INC." foot. Match its *feel*; the real component keeps its
own measured hand-off and readiness machinery.

## DROPPED_FILES
| file | route | note |
|------|-------|------|
| SPEC_splash_resolve_v3.md | docs/specs/active/ | this spec |
| (retire) SPEC_splash_vessel_identity_v2 | docs/specs/retired/ | superseded on merge |
