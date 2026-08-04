# Splash assets

Covers the splash audio cues (below); the horizon-arc raster's derivation is in
**`SPLASH_ARC_EXTRACTION.md`** in this folder.

Staged build assets for the splash-experience Phase 1 build
(`docs/specs/active/SPEC_splash_vessel_identity.md`). Move to the app's
`public/` when the splash is wired up.

| File | Status | Notes |
|---|---|---|
| `wave_hit.mp3` | ✅ **CHOSEN CUE — ship this one** | The single wave that breaks on the BVI dissolve; the only sound in the scene. Triggered on the entry tap (autoplay-safe), cold-start only, respects mute. **Synthesized draft** — a real wave recording (freesound.org) layered at the same spot would add grit synthesis can't. |
| `enter_wave_hum.mp3` | ⚠️ **UNUSED ALTERNATE — do NOT ship** | An abandoned fallback direction. Kept only for reference. If the sound design is ever revisited, prefer a real recording over synthesis. Delete freely if it's just clutter. |

---

# Horizon-arc raster — `public/splash_arc.png` (v3)

The arc is **emitted light over a background, not a foreground object** — a luminance key
or a plain crop leaves a visible rectangle. The full derivation (inpaint-and-subtract, veil
removal, bloom attenuation, and the corner-lift verification that actually catches a bad
extraction) is in **`SPLASH_ARC_EXTRACTION.md`** in this folder.

**Source reference:** `ChatGPT Image Aug 2, 2026, 12_54_52 AM.png`, archived on **Google
Drive → Shared Folders / OurBrand** (a disposable copy also sits in the gitignored
`handoff/` airlock). The recipe is reproducible only with this source.
