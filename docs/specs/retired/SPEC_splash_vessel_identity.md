# SPEC — Splash: Vessel Identity + Dissolve Hand-off

**Scope:** OurProvisions
**Date:** 2026-07-22
**Author:** Design chat → Cody
**Touches prod?** Yes (App.js `SplashScreen`) — dev-verify before promotion.
**Build now for:** React/PWA. Native iOS (Expo) is a forward note (§8), not this build.

---

## 1. Why this exists (the decision trail)

The current splash shows the **Velayo** brand (navy `#020F1A`, white logo card) even though
the user opened **OurProvisions**. That's a front-door mismatch: the vessel should own its own
splash, with Velayo as a quiet signature — the Harbour model made visible. This spec replaces
the Velayo-branded splash with an OurProvisions vessel splash, and establishes the **fleet-wide
pattern** every future vessel (OurKeep, OurChef, OurManifest…) inherits: warm app palette,
product wordmark lead, Velayo footer, dissolve into the app.

This is not a keystroke change — it defines a reusable pattern, carries "wait-for-ready" logic,
and requires a header-title match. Hence a full spec rather than a plain instruction.

---

## 2. Final design (locked)

Vessel splash on **Warm Dark `#2C1A0E`** (espresso — the OurProvisions palette, NOT Velayo navy).
No white logo card. Sequence:

1. **Wordmark sets.** "*Our*Provisions" — Playfair Display italic, "Our" 400 / "Provisions" 700,
   Parchment `#FAF4EC`. "Provisions" animates from blurred + light + wide-tracked → sharp, bold,
   tracked `0.02em` ("the word arriving into itself").
2. **Arch draws in** above the wordmark — the real Velayo logo arch (curved, bows up in the
   middle), sized to ~74% of the wordmark width. Teal `#0D9488` stroke, draws left→right.
3. **Tagline fades in:** `Save time. Shop smarter.` — spaced caps, Dune `#C9A97A`.
4. **Footer fades in LAST and slowest** — transparent Velayo V-mark (no white box) above
   `VELAYO INC.`, pinned to the bottom edge (no bar, no divider), Dune, ~0.8 opacity.
5. **Dissolve** (see §4) once the app is ready.

**Removed by decision:** water/caustic texture (explored, cut — splash stands cleaner without it).

Reference mockups (design chat, not shipped): `ourprovisions_splash_v2.html`,
`dissolve3_matched.html`.

---

## 3. Tagline note (open, not blocking)

`Save time. Shop smarter.` is the splash tagline. Flag for a future reconciliation: the live
marketing site (index.html) currently uses **"Shop smarter. Eat better."** and the brand palette
page labels the OurProvisions aesthetic **"The Market, Distilled."** Three different strings exist.
Not this spec's job to resolve — just recording that the splash now introduces a third variant’s
replacement, and the site/deck should be brought into line deliberately.

---

## 4. The dissolve — Option 3, "wordmark hand-off" (the non-obvious part)

On ready, the splash hands off to the app by having the **splash wordmark travel to the exact
position and size of the app header title**, so the title *becomes* the header rather than being
replaced. Everything else (arch, tagline, footer, espresso bg) fades out beneath it as the cream
app fades up.

**CRITICAL — measure, don't hardcode.** The landing target must be read from the **actual header
title element at runtime** (its bounding rect + computed font-size), not a fixed px value. This is
what makes the hand-off seamless across viewport widths and independent of whether the "Our" is
shown. Approach:

- Give the real header title a ref/id.
- On dissolve, measure `getBoundingClientRect()` + font-size of that element.
- Animate the splash wordmark (a positioned clone/hero) from its centered splash state to that
  measured rect/size, then unmount the splash and reveal the live header title underneath at the
  same spot.
- Verify the landing on at least two widths (e.g. 390px and 430px) — the seam must be invisible.

Fallback: if measuring proves fiddly, **Option 1 ("lift & part")** is an acceptable, more robust
substitute (splash lifts + fades while app scales up from 96%). Do not ship a hand-off that lands
visibly off-position — a clean Option 1 beats a misaligned Option 3.

---

## 5. Timing: wait for ready, then dissolve (NOT a timer)

The current `SplashScreen` fires `onDone` on a fixed timer. **Replace that with readiness-gated
dismissal.** The splash intro plays; the dissolve fires when the app has something to show.

- There is already a `loading` flag in App.js scope (household/provisions load). Gate the dissolve
  on: intro-minimum-elapsed **AND** `!loading` (and `isSignedIn` resolved as applicable).
- Enforce a **minimum visible time** (~1.8–2.2s) so a fast load still shows the full intro rather
  than flashing.
- Enforce a **maximum** (~5s) failsafe so a stuck load never traps the user on the splash.
- On slow loads the splash simply holds after its intro (no motion needed now that water is cut).

---

## 6. Header change required (paired with this)

For the §4 hand-off to be seamless, the splash wordmark and the header title must show the **same
words**. Today the no-photo header renders just "**Provisions**" while the splash + photo header
render "***Our* Provisions**." 

**Decision to confirm with Dan:** standardize the header to always render "*Our* Provisions"
(the "Our" is the naming convention across the fleet). If confirmed, update the no-photo header
title to match. If Dan prefers the header stay "Provisions" only, then the splash wordmark must
land on "Provisions" (drop the "Our" at the moment of hand-off) — messier; not recommended.

---

## 7. Assets

- **Footer V-mark:** needs a **transparent-background** mark. The existing `VELAYO_LOGO_WHITE` /
  `VELAYO_LOGO_TEAL` PNGs (App.js lines 171–172) have **solid** backgrounds (white / teal) — they
  will show a box. Design chat produced a knocked-out transparent PNG from the white asset
  (clean on espresso, no halo) as a working fallback.
  **Preferred:** ship a true-source transparent mark (SVG, or PNG exported with real alpha) for
  razor-sharp edges at all sizes. Use the knockout only if no source asset exists.
- **Arch:** render as inline SVG path (curved, shallow symmetric upward bow), teal `#0D9488`
  stroke, not a raster — so it scales and animates crisply. Keep the left→right draw-in.

  **Size and placement — LOCKED via Dan's arch-matched overlay test (authoritative):**
  Dan overlaid the true Velayo logo on the splash, scaled so the wordmark sits on the logo's
  **mast line** (the horizontal line through the **notches** in the V's two diagonals), and
  confirmed the final arch position directly. Locked values:
    1. **Arch width = 0.52 × wordmark width.** The rendered "*Our*Provisions" at 40px Playfair
       italic measures **238px**, so arch width ≈ **124px**. (Earlier mockups used 94–156px from
       wrong wordmark-width assumptions — both wrong. 0.52× the *measured* wordmark is the rule;
       124px is the value at this size.)
    2. **Arch height = "higher" placement** — the arch floats with clear espresso air *below it*
       before the wordmark (NOT tucked against the letter tops, NOT stranded at screen top). This
       matches where the arch rests over the V's opening in the real logo. On the 390×844 reference
       the arch top ≈ 334px with wordmark top ≈ 430px. Compute proportionally in build, don't
       hardcode: arch sits ~0.8× its own width of clear gap above the wordmark cap-line.
  Position the arch **absolutely** (not in the wordmark's flex column, or the gap collapses).
  Keep the shallow upward bow and left→right draw-in. Render + overlay-verified reference:
  `1784751924184_image.png` (Dan's final overlay) and `h_high.png`.

---

## 8. Forward note — native iOS (Expo), 1.0

When OurProvisions ships as a native Expo/iOS app, the **true native launch screen must be static**
(Apple forbids animating it). This animated splash then lives, as it does now, in the first mounted
React view *after* launch — no change needed. Flagging so the pattern isn't mistakenly moved into
the native launch screen layer later.

---

## 9. Anchors (grep before edit — line numbers drift)

- `SplashScreen` component: App.js ~L174–216 (contains `logoRise` / `lineDraw` / `tagFade`
  keyframes, `VELAYO_LOGO_WHITE` at L199).
- Render site: `{showSplash && <SplashScreen onDone={handleSplashDone} />}` ~L1224.
- State: `showSplash` ~L360, `handleSplashDone` ~L361.
- Readiness flag: `loading` in scope (used at L641, L662, L1173, L1227).
- Header title render: locate the Playfair italic title in the title band (the "Our Provisions" /
  "Provisions" element) and give it the ref for §4 measurement.

---

## 10. Verification checklist

- [ ] Dev preview: splash shows on espresso, no white card, no navy.
- [ ] Wordmark set animation reads (blur/weight/tracking resolve).
- [ ] Arch is curved (bows up), width = 0.52× wordmark width (~124px at 238px wordmark), at the
      "higher" placement with clear espresso air below it before the wordmark (does NOT cut
      through the letters, not tucked tight), draws in. Ref: `h_high.png` + Dan's final overlay.
- [ ] Footer mark floats — NO white/teal box, no halo — above `VELAYO INC.`, fades in last.
- [ ] Tagline reads `Save time. Shop smarter.`
- [ ] Dissolve fires on `!loading` (not timer); min ~2s enforced; ~5s failsafe works.
- [ ] Hand-off: splash title lands on header title position/size — seam invisible at 390px & 430px.
- [ ] Header shows same words the splash lands on (see §6 decision).
- [ ] No regression to signed-out / photo-header / no-photo-header states.
