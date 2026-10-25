// SAVE A MEAL PHOTO (SPEC_photo_menu DAN-3, 2026-10-25). The 1080 px view rendition — the
// original is never stored. A web app cannot write to iOS Photos; the share sheet's "Save
// Image" can, so where the Web Share API takes files ON A TOUCH DEVICE the item reads "Save
// to Photos" and opens the share sheet. Everywhere else it reads "Download photo" and saves a
// file. The touch gate is deliberate: desktop Chrome on Windows / macOS also shares files, and
// there "Save to Photos" would open the OS share panel instead of downloading (Verification 10
// says desktop downloads).
//
// iOS drops the tap's user activation across a slow await, and navigator.share needs it, so the
// file is fetched when the menu OPENS (prefetch) and handed to share synchronously on the tap.
// The download name is fixed copy ("meal-photo.jpg"), never the meal's name.

const probe = () => new File([new Blob([""], { type: "image/jpeg" })], "meal-photo.jpg", { type: "image/jpeg" });

export function canSaveToPhotos(nav = typeof navigator !== "undefined" ? navigator : null, win = typeof window !== "undefined" ? window : null) {
  try {
    if (!nav || typeof nav.share !== "function" || typeof nav.canShare !== "function") return false;
    const coarse = !!(win && win.matchMedia && win.matchMedia("(pointer: coarse)").matches);
    return coarse && nav.canShare({ files: [probe()] });
  } catch {
    return false;
  }
}

export const saveLabel = (toPhotos) => (toPhotos ? "Save to Photos" : "Download photo");

const extFor = (type) => (type === "image/webp" ? "webp" : type === "image/png" ? "png" : "jpg");

// One cache per photo surface: url → { file, promise }. A failed fetch is forgotten so a later
// tap tries again.
export function createPhotoSaver({ fetchImpl = (...a) => fetch(...a), nav = typeof navigator !== "undefined" ? navigator : null, toPhotos = () => canSaveToPhotos() } = {}) {
  const cache = new Map();
  const prefetch = (url) => {
    if (!url) return null;
    let e = cache.get(url);
    if (e) return e;
    e = { file: null, promise: null };
    e.promise = Promise.resolve().then(() => fetchImpl(url))
      .then((r) => { if (!r.ok) throw new Error(`photo fetch ${r.status}`); return r.blob(); })
      .then((b) => {
        const type = b.type || "image/jpeg";
        e.file = new File([b], `meal-photo.${extFor(type)}`, { type });
        return e.file;
      })
      .catch((err) => { cache.delete(url); throw err; });
    cache.set(url, e);
    return e;
  };
  const download = (file) => {
    const href = URL.createObjectURL(file);
    const a = document.createElement("a");
    a.href = href;
    a.download = file.name;
    a.rel = "noopener";
    a.click();
    setTimeout(() => URL.revokeObjectURL(href), 10000);
  };
  const deliver = (file) => {
    if (toPhotos() && nav && nav.canShare({ files: [file] })) {
      return nav.share({ files: [file] }).catch((err) => {
        if (err && err.name === "AbortError") return;   // the person closed the sheet
        console.warn("[meal photo] share failed, downloading instead:", err && (err.name || err));
        download(file);
      });
    }
    download(file);
    return Promise.resolve();
  };
  // Synchronous when the file is already in hand (the iOS case), else after the fetch.
  const save = (url) => {
    const e = prefetch(url);
    if (!e) return Promise.resolve();
    if (e.file) return deliver(e.file);
    return e.promise.then(deliver).catch((err) => console.warn("[meal photo] could not save:", err && (err.message || err)));
  };
  return { prefetch, save };
}
