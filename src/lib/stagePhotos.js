// Bring a recipe — Photo staging (SPEC_recipe_import chunk 2, slice c). Pure where
// it can be, so the picker wiring is testable without a DOM and the failure paths
// are enumerable. Lifted out of MealSheet on 2026-10-11 after a silent failure:
// the handler read `e.target.files` (a LIVE FileList), reset the input's value
// (which empties that same list), then staged from it — zero files, zero hints.
//
// RULE: nothing on this path fails silently. Every outcome that is not a staged
// thumbnail produces a hint the row shows.

export const PHOTO_CAP = 4;   // spec D7: up to 4 images, read together as one recipe

export const HINT_CAP = "Up to 4 at a time.";
export const HINT_UNDECODABLE = "Couldn't open that image";
export const HINT_UNREADABLE = "Couldn't read those images. Try picking them again.";

// Snapshot the picker's files BEFORE the value is reset. The reset lets the same
// file be picked again after a remove; done in the wrong order it discards the
// pick. Always returns a real array, never the live list.
export function filesFromPicker(input) {
  const files = Array.from((input && input.files) || []);
  try { if (input) input.value = ""; } catch { /* some engines refuse; harmless */ }
  return files;
}

// Downscale each picked file in turn and return what can be staged plus the hints
// for everything that cannot. `room` is how many more the row can take; extras are
// ignored with the cap hint. An undecodable file (a HEIC the picker left alone, a
// non-image) is dropped with its own hint and the rest are kept. Never throws:
// an unexpected error on one file counts as that file being undecodable, and an
// error outside the loop still returns a hint rather than an empty silence.
export async function stagePhotos(files, { room, downscale, createUrl, nextId }) {
  const list = Array.isArray(files) ? files : Array.from(files || []);
  const made = [];
  const hints = [];
  try {
    const take = list.slice(0, Math.max(0, room));
    if (list.length > Math.max(0, room)) hints.push(HINT_CAP);
    for (const f of take) {
      try {
        const blob = await downscale(f);
        if (!blob || typeof blob.size !== "number" || blob.size === 0) throw new Error("empty result");
        made.push({ id: nextId(), blob, url: createUrl(blob), bytes: blob.size, originalBytes: f.size });
      } catch (err) {
        // Logged with the file's type and size, never its contents.
        console.warn(`[recipe import] could not open an image (${f && f.type ? f.type : "unknown type"}, ${f && f.size ? f.size : 0} bytes):`, err && (err.message || err.type || err));
        hints.push(HINT_UNDECODABLE);
      }
    }
  } catch (err) {
    console.warn("[recipe import] staging failed:", err && (err.message || err));
    hints.push(HINT_UNDECODABLE);
  }
  return { made, hints: [...new Set(hints)] };
}
