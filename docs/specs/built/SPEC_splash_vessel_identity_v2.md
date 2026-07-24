# SPEC — Splash Scene: Vessel Identity, BVI Wash & Entry Experience (v2)

**Scope:** OurProvisions
**Date:** 2026-07-22
**Supersedes:** `SPEC_splash_vessel_identity.md` (v1). v1 described an earlier, quieter design
(static espresso splash, wordmark hand-off, water explicitly cut). The design grew substantially
after v1 was written. **Where v1 and this document disagree, v2 wins. Retire v1.**
**Touches prod?** Yes (App.js `SplashScreen`, header title, new audio asset). Dev-verify first.
**Build target:** React / PWA. Native iOS (Expo) is a forward note (§10), not this build.

---

## 1. What this is and why

The current splash shows the **Velayo** brand (navy, white logo card) even though the user opened
**OurProvisions** — a front-door mismatch. But the goal is bigger than correcting branding.

**Design intent (Dan, verbatim intent):** the moment a person launches this app they should feel
*"this is something special"* — the magic of the ocean in your hand. Not a loading screen; a
**threshold**. A splash *scene*.

This spec defines that entry experience and the **fleet-wide pattern** every future vessel
(OurKeep, OurManifest, OurDiscovery) inherits: warm vessel palette, product wordmark lead, quiet
Velayo footer, and a dissolve that carries the world into the app.

**Working reference (authoritative for feel/choreography):** `SPLASH_final.html` — plays the full
arc end to end with audio. When prose here and that file disagree on *feel*, the file wins;
when they disagree on *values* (geometry, colors, timing rules), this spec wins.

---

## 2. The experience — six beats

| # | Beat | What happens |
|---|------|--------------|
| 1 | **Threshold** | Deep, compressed, near-empty espresso. Tight vignette (the world feels small/closed). A slow-breathing `Tap to enter` prompt low on screen. Holds during real load — the wait becomes anticipation. |
| 2 | **Crest** | On the entry tap: the space *opens*. Vignette retreats, depth gradient lightens and pushes back, a wide horizon light blooms outward from center. The "cresting the hill" awe beat. |
| 3 | **Reveal** | Arch draws in (left→right). Wordmark **surfaces** — rises from below, de-blurring into focus (disclosure, not assembly). Tagline fades in. Velayo footer fades in last and slowest. |
| 4 | **Hold** | A beat of stillness. Let it land. |
| 5 | **Send-off** | The **BVI water wash**: a translucent turquoise sheet floods up over the view with luminous water-light particles, then recedes upward — the ocean washing the view away. **The wave audio breaks here** (§7). |
| 6 | **Surfaced** | App revealed beneath, already whole. Wordmark settles as the header title. The header retains a faint BVI glow permanently (§6). |

**Cut by decision (do not reintroduce):** warm/caustic "water texture" on the static splash (v1
explored and cut); a **shimmer sweep** across the wordmark (read as a "ghost", removed — also
saves payload); sunset-gold particle palette (replaced by BVI); anchor/chain audio (§7).

---

## 3. Visual system — locked values

**Palette.** Splash is **Warm Dark espresso `#2C1A0E`** (deepening to `#160B04` at the vignette),
NOT Velayo navy. Parchment `#FAF4EC` for the wordmark, Dune `#C9A97A` for tagline/footer, teal
`#0D9488` for the arch.

**Wordmark.** "*Our*Provisions" — Playfair Display **italic**, "Our" weight 400, "Provisions"
weight 700, Parchment. Rendered at 40px on the 390×844 reference; measures **238px wide**.

**Tagline.** `Save time. Shop smarter.` — Lato 300, spaced caps, Dune.
*(Open item: the live marketing site uses "Shop smarter. Eat better." and the brand palette page
is labelled "The Market, Distilled." Three strings exist. Not this spec's job to resolve — flagged
in §11.)*

**Footer.** Transparent Velayo V-mark above `VELAYO INC.`, pinned to the bottom edge — **no bar,
no divider**, floating on the background. Fades in **last and slowest**. This is the colophon
pattern: the vessel owns the stage, the house signs the foot.

**Arch — LOCKED via Dan's logo-overlay test (authoritative).**
Dan overlaid the real Velayo logo on the splash, scaled so the wordmark sits on the logo's **mast
line** (the horizontal line through the **notches** in the V's diagonals), and confirmed placement
directly. Two locked relationships:
1. **Width = 0.52 × wordmark width** → ~**124px** at the 238px wordmark. (Earlier mockups used
   94px and 156px from wrong wordmark-width assumptions — both wrong. The *ratio* is the rule.)
2. **"Higher" placement** — the arch floats with **clear espresso air below it** before the
   wordmark. Not tucked against the letter tops; not stranded near the top of the screen.
   On the 390×844 reference: arch top ≈ 334px, wordmark top ≈ 430px. Compute proportionally.

Additional arch rules:
- Render as **inline SVG path**, shallow symmetric upward bow, teal stroke, left→right draw-in.
- **Position it absolutely**, NOT inside the wordmark's flex column — margin inside a centered
  flex column just recenters the cluster and the gap collapses (this bug occurred twice).
- Must never overlap or cut through the letterforms.
- References: `h_high.png`, and Dan's final overlay confirming it.

**BVI water palette (the wash).** A tight, harmonious water-only band — no warm tones mixed in
(mixing warm+cool is what made an earlier particle pass read as *confetti* rather than light):

| role | hex | rgb |
|------|-----|-----|
| foam / sunlit shallow | `#E2F7F7` | 226,247,247 |
| pale aqua | `#A8E7E6` | 168,231,230 |
| glowing turquoise | `#5ECECD` | 94,206,205 |
| Caribbean teal | `#26A9B1` | 38,169,177 |
| deep drop-off teal | `#117C8C` | 17,124,140 |

Weight the distribution toward pale aqua/turquoise (bright, lit). Reference: `bvi_palette.png`.

---

## 4. Motion language

**Shared easing:** `cubic-bezier(0.16, 1, 0.3, 1)` — the "rising/surfacing" curve. Used by the
scene AND by app interactions (§6). This shared curve is the mechanism of continuity.

**Smoothness constraint (important):** animate **only GPU-friendly properties** — `opacity`,
`transform`, `filter: blur()`. **Do NOT animate `letter-spacing`** — it forces per-frame text
reflow on the CPU and produced visible jank in testing. The wordmark "sets" via
opacity + translateY + de-blur, not by tracking changes.

**Indicative timings** (reference implementation; real build gates on readiness per §5):

| element | start | duration |
|---|---|---|
| depth opens / vignette retreats | on crest | 2.2–2.4s |
| horizon bloom | crest +0.1s | 2.2s |
| wordmark surfaces | crest +0.5s | 1.8s |
| arch draws | crest +1.0s | 1.4s |
| tagline | crest +2.1s | 1.2s |
| Velayo footer | crest +2.5s | 1.3s |
| hold | — | ~1s |
| BVI wash flood → recede | send-off | ~2.2s |

---

## 5. Timing & lifecycle — readiness-gated, NOT a timer

The current `SplashScreen` fires `onDone` on a fixed timer. **Replace with readiness gating.**

- The **threshold holds** while the app loads. There is already a `loading` flag in App.js scope
  (household/provisions load) — gate on `!loading` (and auth resolved as applicable).
- **Minimum visible time** ~1.8–2.2s so a fast load still shows the experience rather than flashing.
- **Maximum failsafe** ~5s so a stuck load never traps the user.
- **Cold start only.** The scene plays on genuine app entry, not on subsequent navigation.
- The **entry tap** (`Tap to enter`) is the gesture that begins the crest and unlocks audio (§7).

---

## 6. Carrying the experience into the app (continuity)

A threshold that lies is worse than no threshold. Three mechanisms:

**(a) Surfacing dissolve.** The scene doesn't cut to a bright list — the dark **recedes into the
espresso header** while the cream body is revealed below, as if the user has risen up through the
surface. The header is the deep water; the list is the light above it.

**(b) Wordmark hand-off — measure, don't hardcode.** The splash wordmark travels to the **exact
position and size of the real header title**, so the title *becomes* the header rather than being
replaced. Implementation:
- Give the real header title a ref/id.
- On dissolve, read its `getBoundingClientRect()` + computed font-size **at runtime**.
- Animate the splash wordmark (positioned clone) to that measured rect/size; then unmount the
  scene and reveal the live header title in the same spot.
- **Verify at ≥2 viewport widths (e.g. 390px and 430px) — the seam must be invisible.**
- NOTE: the app header title is **centered and large**, not left-aligned/small. An earlier attempt
  animated to a top-left corner slot and was wrong.
- **Fallback:** if measured hand-off proves fragile, a clean "lift & fade" (scene lifts+fades while
  app scales up from 96%) is acceptable. **Never ship a visibly misaligned hand-off.**

**(c) Atmospheric header (persistent).** The espresso header permanently retains a faint **BVI
depth-glow** (soft radial turquoise/teal at very low opacity) behind the title. Every time the user
sees the header they get a trace of the threshold. This is the same header that hosts the household
photo — atmosphere and photo share a home.

**(d) Shared motion in-app.** Row adds, tab switches, count changes use the §4 easing. Awe at
launch, calm competence thereafter — made by the same hand.

---

## 7. Sound

**Design decision:** a **single wave that breaks on the dissolve** — the only sound, at the only
moment water is visible. Rejected directions (do not revisit without cause): a **chime**
(reads as a notification), and an **anchor/chain clank** (conceptually loved — "Titanic-size anchor
seating, ship ready to sail" — but synthesis could not render heavy chain convincingly; it landed
in the uncanny valley across many attempts).

**Asset:** `wave_hit.mp3` (~2.8s). Structure: swell rises → **breaks at ~1.1s into the clip** →
washes out to silence.
**Alternate (unused):** `enter_wave_hum.mp3` — wave into a low ship-ready hum. Do not ship;
retained as a reference only.

**Sync:** the wave's **break** must coincide with the **wash flooding the view**. In the reference
implementation the wash fires at +5600ms and the clip starts at +4500ms (5600 − 1100). In the real
build, derive the offset from the actual wash trigger rather than hardcoding.

**Trigger rules (all required):**
- Plays **only on the entry tap** — never autoplay. (Browsers block autoplay; the tap is also the
  audio-unlock gesture. This is why "sound on first tap" is the architecture.)
- **Cold-start only.** Never on subsequent navigation or re-render.
- **Respects the device mute/silent switch.** An app that makes unexpected noise reads as cheap —
  the exact opposite of the goal.
- Prime/unlock the audio element **silently** (muted play/pause pass). A non-muted priming pass
  caused an audible double-wave in testing.

**Honest status / upgrade path:** `wave_hit.mp3` is **synthesized** — usable and shippable, but a
real wave recording (e.g. freesound.org, CC-licensed) layered at the same moment would add grit
synthesis can't. Water synthesizes well (noise-based); *chain does not* — if the anchor idea is
ever revived, it must use a real recording.

**Native forward note:** pair the wash with a **haptic thump** (taptic engine) on the water hit.
Sound + haptics is what sells scale on a handheld device, and compensates for phone speakers being
unable to reproduce the low end.

---

## 8. Header change required (paired with this build)

For the hand-off to be seamless the splash wordmark and header title must show the **same words**.
Today the no-photo header renders just "**Provisions**" while the splash and photo header render
"***Our* Provisions**."

**Decision:** standardize the header to always render "*Our* Provisions" — the "Our" is the fleet
naming convention, and it makes the hand-off clean. Implement alongside this spec.

---

## 9. Implementation notes

- **Particle wash = canvas (or WebGL), not CSS.** CSS can fake a few dozen particles; this needs
  thousands. Use **additive blending** (`globalCompositeOperation = 'lighter'`) with soft radial
  falloff per particle so overlaps read as *light/shimmer*, not dots. Particles rise with lateral
  drift (water caustics move differently than embers) and clear **bottom-up**, reinforcing surfacing.
- **Preserve the wordmark zone** when spawning particles so the name stays intact as the still
  point everything resolves around.
- **Respect `prefers-reduced-motion`:** provide a reduced variant (short fade from espresso to app,
  no particles, no parallax) — this experience is motion-heavy.
- **Payload discipline:** the shimmer was cut partly for weight. Keep the audio asset small
  (~100KB target) and the particle system bounded.

---

## 10. Native iOS (Expo), 1.0 — forward note

The true native launch screen **must be static** (Apple forbids animating it). This animated scene
lives — as it does today — in the first mounted React view *after* launch. Do not move it into the
native launch-screen layer. Haptics (§7) become available here.

---

## 11. Anchors & open items

**Code anchors (grep before edit — line numbers drift):**
- `SplashScreen` component: App.js ~L174–216 (contains `logoRise` / `lineDraw` / `tagFade`
  keyframes; `VELAYO_LOGO_WHITE` ~L199).
- Render site: `{showSplash && <SplashScreen onDone={handleSplashDone} />}` ~L1224.
- State: `showSplash` ~L360, `handleSplashDone` ~L361.
- Readiness flag: `loading` in scope (used ~L641, L662, L1173, L1227).
- Header title: the Playfair italic title in the title band — needs a ref for §6(b) measurement.

**Assets:**
- Footer V-mark needs a **transparent-background** asset. The existing `VELAYO_LOGO_WHITE` /
  `VELAYO_LOGO_TEAL` PNGs (App.js ~L171–172) have **solid** backgrounds and will show a box. A
  knocked-out transparent PNG was produced in design chat as a working fallback; **prefer a true
  source SVG / alpha PNG** for sharp edges at all sizes.
- The brand deck PDF in the project (`velayobranddeck__March_28_2026.pdf`) is **corrupted /
  unreadable** (broken trailer & xref) — needs a clean re-export into the repo.

**Open items (not blocking this build):**
- Tagline reconciliation across splash / marketing site / brand palette page (§3).
- Real-wave recording swap + haptic sync (§7).
- Atmospheric header + shared motion language (§6c/6d) may warrant its own fast-follow phase.
- **Parked, own session:** fleet-as-book-series (the splash spine reads like a bound volume;
  present the fleet as a shelf of matched volumes). Not splash work.

---

## 12. Verification checklist

- [ ] Splash renders on espresso `#2C1A0E` — no white logo card, no Velayo navy.
- [ ] Threshold holds during load; breathing `Tap to enter` visible.
- [ ] Entry tap triggers crest: vignette retreats, depth opens, horizon blooms.
- [ ] Wordmark surfaces (opacity + translateY + de-blur). **No letter-spacing animation.** Smooth,
      no jank.
- [ ] Arch: curved bow, width = 0.52 × wordmark (~124px), **higher** placement with visible
      espresso between arch and letter tops, absolutely positioned, draws in L→R.
- [ ] Tagline reads `Save time. Shop smarter.`
- [ ] Velayo footer: transparent mark (NO box/halo) + `VELAYO INC.`, bottom-pinned, fades in last.
- [ ] BVI wash floods and recedes using the §3 palette; particles read as light (additive), not dots
      or confetti; wordmark zone preserved.
- [ ] Wave audio breaks **exactly** on the wash; plays once; cold-start only; muted-switch
      respected; silent priming (no double-wave).
- [ ] Dissolve gated on `!loading` (not a timer); min ~2s enforced; ~5s failsafe works.
- [ ] Hand-off: wordmark lands on the **measured** header title position/size — seam invisible at
      390px and 430px.
- [ ] Header renders "*Our* Provisions" (§8), matching what the splash hands off.
- [ ] Header retains faint BVI depth-glow after settle.
- [ ] `prefers-reduced-motion` variant works.
- [ ] No regression: signed-out state, photo header, no-photo header.
