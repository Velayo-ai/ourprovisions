# Splash assets

Covers the splash audio cues (below) and the horizon-arc raster extraction (bottom).

Staged build assets for the splash-experience Phase 1 build
(`docs/specs/active/SPEC_splash_vessel_identity.md`). Move to the app's
`public/` when the splash is wired up.

| File | Status | Notes |
|---|---|---|
| `wave_hit.mp3` | ✅ **CHOSEN CUE — ship this one** | The single wave that breaks on the BVI dissolve; the only sound in the scene. Triggered on the entry tap (autoplay-safe), cold-start only, respects mute. **Synthesized draft** — a real wave recording (freesound.org) layered at the same spot would add grit synthesis can't. |
| `enter_wave_hum.mp3` | ⚠️ **UNUSED ALTERNATE — do NOT ship** | An abandoned fallback direction. Kept only for reference. If the sound design is ever revisited, prefer a real recording over synthesis. Delete freely if it's just clutter. |

---

# Horizon-arc extraction — `public/splash_arc.png` (v3)

The arc is **emitted light over a background, not a foreground object.** A luminance key
or a plain crop clips the glow falloff and leaves a visible rectangle. This is the pipeline
that produced the shipped v3 raster, recorded here because the chat that authored it does
not survive.

- **Source:** `ChatGPT Image Aug 2, 2026, 12_54_52 AM.png` (the approved splash reference),
  archived on **Google Drive → Shared Folders / OurBrand**. The build-time copy in the
  gitignored `handoff/` airlock is disposable; the Drive copy is the durable one.
- **Crop region:** x 110–755, y 520–838 → **645×318** output.

## Pipeline

1. **Reconstruct the background.** Mask everything bright (**luminance > 34, dilated 6px**)
   plus the whole arc/glow zone. Diffusion-inpaint the masked area: **~120 iterations of
   Gaussian blur (σ=18)**, re-imposing the known (unmasked) pixels every pass, then a
   **final σ=8 smooth**. Yields the espresso gradient that sits *under* the arc.
2. **Subtract.** `residual = crop − background`. What remains is only the light the arc adds.
3. **Remove the residual veil.** The inpaint runs slightly dark inside the masked zone,
   leaving a uniform positive floor (**~+2.7 luminance**) across the whole bounding box —
   this is what produced the visible rectangle in **v1**. Fit a **2D quadratic to the
   residual using border pixels only (26px inset ring)**, subtract it, then subtract a
   remaining floor taken at the **92nd percentile of border luminance**.
4. **Feather to zero.** **Cosine ramp over the outer 34px** so alpha reaches exactly 0 at
   the boundary.
5. **Build RGBA.** `alpha = (residual_luminance / 255) ^ 0.85 × feather`;
   `colour = residual normalised to its per-pixel peak`.
6. **v3 bloom attenuation.** Find the stroke centreline (**brightest row per column,
   smoothed**). Weight by distance from it: **keep 1.0 within 3.5px** (the core), **ramp
   over 9px down to 0.80** beyond — cuts the halo without thinning the stroke. Then a
   **+10% alpha ramp across the right half** to give the teal more presence.

## Verification

Compositing onto a flat colour proves nothing — the veil is invisible against it. Measure
**`alpha × (colour − background)` at the corners**; anything above **~0.7** shows as a box.

| Version | Corner residual | Result |
|---|---|---|
| v1 | **+2.66** | visible rectangle |
| v3 | **+0.01** | clean |

(Cross-check on the shipped file: corner 20×20 mean alpha ≈ 0, extreme corner pixels 0 —
consistent with +0.01.)

## Source dependency

This recipe is reproducible **only** with its source image, archived off-repo on
**Google Drive → Shared Folders / OurBrand** (`ChatGPT Image Aug 2, 2026, 12_54_52 AM.png`,
~1.3 MB). The build-time copy in the gitignored `handoff/` airlock is disposable and can
be cleared. If the Drive location moves, update this note.
