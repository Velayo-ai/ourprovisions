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

// Decode upright, downscale the long edge to `maxEdge`, re-encode JPEG at
// `quality` (orientation 1, no EXIF tag). The one pipeline behind both the
// OurBanner upload and recipe import's screenshots (SPEC_recipe_import: client
// downscale before upload, longest edge ≤ 1600 px, JPEG ~0.8 — same numbers, so
// the defaults are shared rather than copied). Throws when the browser cannot
// decode the file (a HEIC the picker did not convert, a non-image) — the caller
// decides what to say. Returns a Blob.
export async function downscaleToJpeg(file, { maxEdge = MAX_EDGE, quality = JPEG_Q } = {}) {
  const decoded = await decodeUpright(file);
  try {
    const { src, width, height } = decoded;
    const scale = Math.min(1, maxEdge / Math.max(width, height));
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
        quality
      );
    });
    return blob;
  } finally {
    decoded.close && decoded.close();
  }
}

// Normalize a household photo File for storage:
//   1. decode upright (EXIF baked into pixels)
//   2. downscale long edge to MAX_EDGE
//   3. re-encode JPEG q80, orientation 1, no EXIF tag
// Returns a Blob ready to upload as {household_id}/header.jpg. Unchanged
// behaviour since the 2026-10-10 refactor: the body moved into downscaleToJpeg
// with these exact defaults.
export function normalizeHouseholdPhoto(file) {
  return downscaleToJpeg(file);
}

// ── Meal photos (SPEC_meal_photos_v1 A3; 065) ─────────────────────────────
// Two renditions from ONE decode, each a fresh canvas re-encode — so none of the
// ORIGINAL's metadata (EXIF, GPS included) survives into either: a canvas holds
// pixels only. But an encoder may add its own: iPhone Safari's JPEG toBlob writes
// a small EXIF APP1 (ColorSpace, PixelX/YDimension) and an empty IPTC APP13
// (found on the stored objects, 2026-10-21). Verification 5's gate is no EXIF, no
// IPTC, no GPS in either file (Dan's ruling (b)), so every JPEG rendition goes
// through stripJpegMetadata below before upload. No original is ever stored;
// hi-res stays on the phone.
//   thumb ≈ 480 px long edge — the library card (the only size it loads)
//   view  ≈ 1080 px long edge — the recipe view's strip
// WebP at ~0.78, JPEG at the same quality when the browser cannot encode WebP
// (an older Safari hands back a PNG for 'image/webp' — detected by the blob's
// own type, never by user agent). Both renditions share one format so they
// share one path stem: {uuid}-thumb.{ext} / {uuid}-view.{ext}.
export const MEAL_PHOTO_THUMB_EDGE = 480;
export const MEAL_PHOTO_VIEW_EDGE = 1080;
const MEAL_PHOTO_Q = 0.78;
// The JPEG THUMBNAIL only (the iPhone route — Safari cannot encode WebP): 0.7. The library
// loads only thumbnails (A3), so this is the egress that repeats; the view copy keeps 0.78.
// iPhone JPEG thumbs at 0.78 were 58.6 / 65.2 kB against ~28 kB for a WebP thumb (dev,
// 2026-10-21). Measured in Chrome from the two stored view copies: 0.78 → 0.7 is −20% / −19%
// (24,720 → 19,827 B; 29,607 → 23,886 B), no visible difference at the card slot or 1:1.
// Safari's encoder maps quality differently (its 0.78 is ~2.4× Chrome's bytes), so the phone's
// own saving is confirmed by the next iPhone upload, not assumed from these numbers.
export const MEAL_PHOTO_THUMB_JPEG_Q = 0.7;

function encodeCanvas(src, width, height, maxEdge, type, quality) {
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  const w = Math.max(1, Math.round(width * scale));
  const h = Math.max(1, Math.round(height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  canvas.getContext('2d').drawImage(src, 0, 0, w, h);
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve({ blob: b, width: w, height: h }) : reject(new Error('Image encode failed'))),
      type,
      quality
    );
  });
}

// File → { thumb: {blob,width,height}, view: {blob,width,height}, type, ext }.
// Throws when the file cannot be decoded (the caller says "Couldn't read that photo").
export async function renderMealPhoto(file) {
  const decoded = await decodeUpright(file);
  try {
    const { src, width, height } = decoded;
    let type = 'image/webp';
    let thumb = await encodeCanvas(src, width, height, MEAL_PHOTO_THUMB_EDGE, type, MEAL_PHOTO_Q);
    if (thumb.blob.type !== 'image/webp') {
      type = 'image/jpeg';
      thumb = await encodeCanvas(src, width, height, MEAL_PHOTO_THUMB_EDGE, type, MEAL_PHOTO_THUMB_JPEG_Q);
    }
    const view = await encodeCanvas(src, width, height, MEAL_PHOTO_VIEW_EDGE, type, MEAL_PHOTO_Q);
    // Ruling (b): no EXIF / XMP / IPTC in a stored JPEG, whatever the encoder wrote.
    thumb.blob = await stripJpegMetadata(thumb.blob);
    view.blob = await stripJpegMetadata(view.blob);
    return { thumb, view, type, ext: type === 'image/webp' ? 'webp' : 'jpg' };
  } finally {
    decoded.close && decoded.close();
  }
}

// ── JPEG metadata strip (Verification 5, Dan's ruling (b), 2026-10-21) ──────
// Drops every APP1 (EXIF and XMP) and APP13 (Photoshop / IPTC) segment from a
// JPEG's header; keeps APP0 (JFIF), every other segment (quantization and
// Huffman tables, the frame header, APP2 colour profile) and the entropy-coded
// image data byte for byte. Rotation is already baked into the pixels by the
// canvas, so no orientation tag is needed. Pure over bytes: returns the SAME
// array when nothing was removed (a clean JPEG comes out byte-identical), a new
// one otherwise. Throws on a JPEG it cannot walk — never uploads what it could
// not check.
const APP1 = 0xe1;
const APP13 = 0xed;
export function stripJpegSegments(bytes) {
  if (!(bytes && bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8)) throw new Error('Not a JPEG');
  const keep = [[0, 2]];   // SOI
  let removed = false;
  let i = 2;
  for (;;) {
    if (i + 1 >= bytes.length || bytes[i] !== 0xff) throw new Error('JPEG header could not be walked');
    let m = bytes[i + 1];
    let at = i;
    while (m === 0xff) { at += 1; m = bytes[at + 1]; }   // fill bytes before a marker
    if (m === 0xda || m === 0xd9) { keep.push([i, bytes.length]); break; }   // SOS / EOI: the rest verbatim
    if (at + 3 >= bytes.length) throw new Error('JPEG header could not be walked');
    const len = (bytes[at + 2] << 8) | bytes[at + 3];
    const end = at + 2 + len;
    if (len < 2 || end > bytes.length) throw new Error('JPEG segment overruns the file');
    if (m === APP1 || m === APP13) removed = true;
    else keep.push([i, end]);
    i = end;
  }
  if (!removed) return bytes;
  const out = new Uint8Array(keep.reduce((n, [a, b]) => n + (b - a), 0));
  let o = 0;
  keep.forEach(([a, b]) => { out.set(bytes.subarray(a, b), o); o += b - a; });
  return out;
}

const readBlobBytes = (blob) => (typeof blob.arrayBuffer === 'function'
  ? blob.arrayBuffer()
  : new Promise((resolve, reject) => { const fr = new FileReader(); fr.onload = () => resolve(fr.result); fr.onerror = () => reject(fr.error); fr.readAsArrayBuffer(blob); })
).then((buf) => new Uint8Array(buf));

// Blob → Blob. Any non-JPEG (the WebP route) is returned unchanged, unread.
export async function stripJpegMetadata(blob) {
  if (!blob || blob.type !== 'image/jpeg') return blob;
  const bytes = await readBlobBytes(blob);
  const out = stripJpegSegments(bytes);
  return out === bytes ? blob : new Blob([out], { type: 'image/jpeg' });
}

// The two object paths for one upload — the shape add_meal_photo checks (065):
// {household}/{meal}/{uuid}-thumb.{ext} and -view.{ext}, one shared stem.
export function mealPhotoPaths(householdId, mealId, stem, ext) {
  const base = `${householdId}/${mealId}/${stem}`;
  return { thumbPath: `${base}-thumb.${ext}`, viewPath: `${base}-view.${ext}` };
}
