// Run: CI=true npx react-scripts test --watchAll=false src/lib/savePhoto
// SPEC_photo_menu DAN-3: "Save to Photos" (share sheet) on a touch device whose Web Share takes
// files; "Download photo" everywhere else; the file is fetched on menu open, shared on the tap.
import { canSaveToPhotos, saveLabel, createPhotoSaver } from "./savePhoto";

const win = (coarse) => ({ matchMedia: (q) => ({ matches: q === "(pointer: coarse)" ? coarse : false }) });
const nav = (canFiles) => ({ share: jest.fn(() => Promise.resolve()), canShare: jest.fn(() => canFiles) });
const flush = () => new Promise((r) => setTimeout(r, 0));

describe("canSaveToPhotos / saveLabel", () => {
  test("touch + file sharing → Save to Photos", () => {
    expect(canSaveToPhotos(nav(true), win(true))).toBe(true);
    expect(saveLabel(true)).toBe("Save to Photos");
  });
  test("desktop that shares files (Chrome on Windows) → Download photo", () => {
    expect(canSaveToPhotos(nav(true), win(false))).toBe(false);
    expect(saveLabel(false)).toBe("Download photo");
  });
  test("no Web Share, or no file sharing → Download photo", () => {
    expect(canSaveToPhotos({}, win(true))).toBe(false);
    expect(canSaveToPhotos(nav(false), win(true))).toBe(false);
    expect(canSaveToPhotos(null, null)).toBe(false);
  });
});

describe("createPhotoSaver", () => {
  const blob = new Blob([new Uint8Array([1, 2])], { type: "image/webp" });
  const okFetch = () => jest.fn(() => Promise.resolve({ ok: true, blob: () => Promise.resolve(blob) }));
  beforeEach(() => {
    global.URL.createObjectURL = jest.fn(() => "blob:x");
    global.URL.revokeObjectURL = jest.fn();
  });

  test("prefetched: share is called synchronously on the tap, with a fixed file name", async () => {
    const n = nav(true);
    const s = createPhotoSaver({ fetchImpl: okFetch(), nav: n, toPhotos: () => true });
    s.prefetch("https://x/a");
    await flush();
    s.save("https://x/a");
    expect(n.share).toHaveBeenCalledTimes(1);
    const file = n.share.mock.calls[0][0].files[0];
    expect(file.name).toBe("meal-photo.webp");
  });

  test("one fetch per URL", async () => {
    const f = okFetch();
    const s = createPhotoSaver({ fetchImpl: f, nav: nav(true), toPhotos: () => true });
    s.prefetch("https://x/a");
    s.prefetch("https://x/a");
    await s.save("https://x/a");
    expect(f).toHaveBeenCalledTimes(1);
  });

  test("Download photo: an <a download> click, no share", async () => {
    const n = nav(true);
    const click = jest.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    const s = createPhotoSaver({ fetchImpl: okFetch(), nav: n, toPhotos: () => false });
    await s.save("https://x/a");
    expect(n.share).not.toHaveBeenCalled();
    expect(click).toHaveBeenCalledTimes(1);
    expect(click.mock.instances[0].download).toBe("meal-photo.webp");
    click.mockRestore();
  });

  test("the person closing the share sheet is not an error and downloads nothing", async () => {
    const n = { canShare: () => true, share: jest.fn(() => Promise.reject(Object.assign(new Error("x"), { name: "AbortError" }))) };
    const click = jest.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    const s = createPhotoSaver({ fetchImpl: okFetch(), nav: n, toPhotos: () => true });
    await s.save("https://x/a");
    await flush();
    expect(click).not.toHaveBeenCalled();
    click.mockRestore();
  });

  test("a failed fetch is forgotten, so the next tap tries again", async () => {
    const f = jest.fn()
      .mockImplementationOnce(() => Promise.resolve({ ok: false, status: 400 }))
      .mockImplementation(() => Promise.resolve({ ok: true, blob: () => Promise.resolve(blob) }));
    const n = nav(true);
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    const s = createPhotoSaver({ fetchImpl: f, nav: n, toPhotos: () => true });
    await s.save("https://x/a");
    expect(n.share).not.toHaveBeenCalled();
    await s.save("https://x/a");
    expect(n.share).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });
});
