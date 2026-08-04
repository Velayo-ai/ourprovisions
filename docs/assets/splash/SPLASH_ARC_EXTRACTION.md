# Splash arc — extraction method

**Artifact:** `public/splash_arc.png` (v3, 645×318)
**Source:** `ChatGPT Image Aug 2, 2026, 12_54_52 AM.png` — archived on **Google Drive → Shared Folders / OurBrand** (disposable copy also in the gitignored `handoff/` airlock)
**Date:** 2026-08-03

Written because the v1/v2 intermediates were cleared from `handoff/` after v3
shipped. The source reference remains; this file is how you get from one to the
other.

---

## Why not just crop it

The arc is **emitted light over a background**, not a foreground object sitting
on one. A plain crop or a luminance key clips the glow falloff and leaves a
visible rectangle when composited. That rectangle was shipped once (v1) and
had to be chased down.

## Crop region

x 110–755, y 520–838 in the source → 645×318 output.

## Steps

**1. Reconstruct the background.**
Mask everything bright (luminance > 34, dilated 6px) plus the entire arc/glow
zone. Diffusion-inpaint the masked area: ~120 iterations of Gaussian blur
(σ=18), re-imposing known pixels each pass, then a final σ=8 smooth. This
yields the espresso gradient that sits *under* the arc.

**2. Subtract.**
`residual = crop − background`. What remains is only the light the arc adds.

**3. Remove the residual veil.**
The inpaint runs slightly dark inside the masked zone, leaving a uniform
positive floor (~+2.7 luminance) across the whole bounding box. **This is what
produced the visible rectangle in v1.** Fit a 2D quadratic to the residual
using *border pixels only* (26px inset ring), subtract it, then subtract a
remaining floor taken at the 92nd percentile of border luminance.

**4. Feather to zero.**
Cosine ramp over the outer 34px so alpha reaches exactly 0 at the boundary.

**5. Build RGBA.**
`alpha = (residual_luminance / 255) ^ 0.85 × feather`
colour = residual normalised to its per-pixel peak.

**6. Bloom attenuation (the v2 → v3 change).**
Find the stroke centreline (brightest row per column, smoothed σ=12). Weight by
distance from it: keep 1.0 within 3.5px (the core), ramp over 9px down to 0.80
beyond. This cuts the halo without thinning the stroke — a radial cut from the
sun would have thinned the gold segment of the arc itself, which is stroke, not
bloom. Then apply a +10% alpha ramp across the right half to give the teal more
presence.

Result: total emitted light −10%, apex alpha unchanged at 238, teal half +5%.

---

## Verification

**Compositing onto flat colour proves nothing** — the veil is invisible against
it. That check passed on v1 and the box shipped anyway.

Measure the lift the asset adds over its background:

```
delta = alpha × (colour − background_luminance)
```

Sample the corners and the outer bands. Anything above ~0.7 will read as a
visible box on a real vignetted background.

| version | corner lift |
|---------|-------------|
| v1      | +2.66  (box visible) |
| v3      | +0.01  (clean) |

---

## Positioning (for reference)

The arc is part of the wordmark lockup, not the viewport. In `measure()`:

- `ARC_W_RATIO` = 1.25 — canvas width relative to wordmark width. The visible
  stroke is ~0.83 of the canvas, so this lands the visible arc at ~1.0×
  wordmark width, tips aligned with the wordmark edges. **Do not set this to
  1.0** — that ratio describes visible ink, not canvas.
- `ARC_GAP` = 0.41 — vertical gap. Not derivable: the arc's tails descend
  diagonally into a soft falloff, so measured gap varies ~10× with the
  visibility threshold chosen. This one is an eye call, not a measurement.
