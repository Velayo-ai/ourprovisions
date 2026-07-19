// ============================================================
// image.js — OurBanner upload pipeline
// ============================================================
// Spec: docs/specs/active/SPEC_household_photo_header.md
//
// HARD REQUIREMENT (spec "EXIF normalization"): normalize to
// orientation 1 on upload — bake the rotation into pixels, strip
// the tag. iPhones write an orientation *tag* rather than rotating
// pixels; CSS background-image usually honors it, but <canvas>
// drawImage() does NOT. Every resize path here goes through canvas,
// so a broken normalize ships upside-down houses to a predictable
// share of users. Two Sacandaga test photos were orientation 6 and
// 3 respectively — this is the common case, not the edge case.
//
// Strategy: decode with createImageBitmap({imageOrientation:
// 'from-image'}), which applies the EXIF orientation while decoding
// so the bitmap is already upright in pixel space. Draw that to a
// canvas and re-encode JPEG — the output has orientation 1 baked in
// and no EXIF tag. Fall back to <img> decode (which the browser also
// auto-orients for HTMLImageElement) if createImageBitmap or its
// options are unavailable.
// ============================================================

const MAX_EDGE = 1600;   // downscale long edge — a 4032×3024 original is several MB for a ≤390px band
const JPEG_Q = 0.8;      // ~q80 re-encode

// Decode a File to an upright bitmap-like source (ImageBitmap or HTMLImageElement),
// with EXIF orientation already applied to the pixels.
async function decodeUpright(file) {
  // Preferred path: createImageBitmap honors EXIF via imageOrientation.
  if (typeof createImageBitmap === 'function') {
    try {
      // 'from-image' is the modern spelling; some engines used 'from-image'
      // as the only value. If options are ignored the bitmap may not be
      // oriented — the <img> fallback below covers those engines.
      const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
      return { src: bmp, width: bmp.width, height: bmp.height, close: () => bmp.close && bmp.close() };
    } catch (e) {
      // Not fatal — the <img> fallback below also auto-orients. Logged so a
      // decode failure here is diagnosable rather than invisible.
      console.warn('[photo normalize] createImageBitmap path failed, using <img> fallback:', e);
    }
  }
  // Fallback: HTMLImageElement decode. Browsers auto-orient <img> from EXIF,
  // so drawing this element to canvas also yields upright pixels.
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = reject;
      el.src = url;
    });
    return {
      src: img,
      width: img.naturalWidth,
      height: img.naturalHeight,
      close: () => URL.revokeObjectURL(url),
    };
  } catch (e) {
    URL.revokeObjectURL(url);
    throw e;
  }
}

// Normalize a household photo File for storage:
//   1. decode upright (EXIF baked into pixels)
//   2. downscale long edge to MAX_EDGE
//   3. re-encode JPEG q80, orientation 1, no EXIF tag
// Returns a Blob ready to upload as {household_id}/header.jpg.
export async function normalizeHouseholdPhoto(file) {
  const decoded = await decodeUpright(file);
  try {
    const { src, width, height } = decoded;
    const scale = Math.min(1, MAX_EDGE / Math.max(width, height));
    const w = Math.max(1, Math.round(width * scale));
    const h = Math.max(1, Math.round(height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    // src is already upright; a plain drawImage re-samples with orientation 1.
    ctx.drawImage(src, 0, 0, w, h);

    const blob = await new Promise((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error('Image encode failed'))),
        'image/jpeg',
        JPEG_Q
      );
    });
    return blob;
  } finally {
    decoded.close && decoded.close();
  }
}
