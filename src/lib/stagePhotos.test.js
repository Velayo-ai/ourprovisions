// Run: CI=true npx react-scripts test --watchAll=false src/lib/stagePhotos
import { filesFromPicker, stagePhotos, HINT_CAP, HINT_UNDECODABLE } from "./stagePhotos";

const file = (name, type, size = 10) => new File([new Uint8Array(size)], name, { type });
const okDownscale = async (f) => new Blob([new Uint8Array(3)], { type: "image/jpeg" });
const opts = (over = {}) => {
  let id = 0;
  return { room: 4, downscale: okDownscale, createUrl: () => "blob:x", nextId: () => ++id, ...over };
};

test("filesFromPicker snapshots the list BEFORE resetting the value (the 10-11 silent failure)", () => {
  // A stand-in for the live FileList: resetting value empties it, as Chrome does.
  const input = { files: [file("a.jpg", "image/jpeg"), file("b.png", "image/png")], value: "x" };
  Object.defineProperty(input, "value", { set() { input.files = []; }, get() { return ""; } });
  const files = filesFromPicker(input);
  expect(files.map((f) => f.name)).toEqual(["a.jpg", "b.png"]);
  expect(input.files).toEqual([]);   // the reset still happened
});

test("filesFromPicker tolerates a missing input or list", () => {
  expect(filesFromPicker(null)).toEqual([]);
  expect(filesFromPicker({})).toEqual([]);
});

test("every pick stages, no hints", async () => {
  const r = await stagePhotos([file("a.jpg", "image/jpeg"), file("b.png", "image/png")], opts());
  expect(r.made.length).toBe(2);
  expect(r.made.map((m) => m.id)).toEqual([1, 2]);
  expect(r.hints).toEqual([]);
});

test("an undecodable file is dropped with a hint; the others are kept", async () => {
  const downscale = async (f) => { if (f.type === "image/heic") throw new Event("error"); return okDownscale(f); };
  const r = await stagePhotos([file("a.jpg", "image/jpeg"), file("x.heic", "image/heic"), file("b.png", "image/png")], opts({ downscale }));
  expect(r.made.map((m) => m.originalBytes)).toEqual([10, 10]);
  expect(r.hints).toEqual([HINT_UNDECODABLE]);
});

test("two undecodable files produce the hint once", async () => {
  const downscale = async () => { throw new Error("nope"); };
  const r = await stagePhotos([file("a.heic", "image/heic"), file("b.heic", "image/heic")], opts({ downscale }));
  expect(r.made).toEqual([]);
  expect(r.hints).toEqual([HINT_UNDECODABLE]);
});

test("more than the room: extras ignored with the cap hint, in order", async () => {
  const five = [1, 2, 3, 4, 5].map((i) => file(`${i}.jpg`, "image/jpeg", i));
  const r = await stagePhotos(five, opts({ room: 4 }));
  expect(r.made.map((m) => m.originalBytes)).toEqual([1, 2, 3, 4]);
  expect(r.hints).toEqual([HINT_CAP]);
});

test("no room left: nothing staged, the cap hint", async () => {
  const r = await stagePhotos([file("a.jpg", "image/jpeg")], opts({ room: 0 }));
  expect(r.made).toEqual([]);
  expect(r.hints).toEqual([HINT_CAP]);
});

test("an empty or null downscale result counts as undecodable", async () => {
  const r = await stagePhotos([file("a.jpg", "image/jpeg")], opts({ downscale: async () => null }));
  expect(r.made).toEqual([]);
  expect(r.hints).toEqual([HINT_UNDECODABLE]);
});

test("an error outside the per-file loop still comes back as a hint, never a throw", async () => {
  const r = await stagePhotos([file("a.jpg", "image/jpeg")], opts({ createUrl: () => { throw new Error("createObjectURL exploded"); } }));
  expect(r.made).toEqual([]);
  expect(r.hints).toEqual([HINT_UNDECODABLE]);
});

test("a FileList-like iterable is accepted", async () => {
  const listLike = { length: 1, 0: file("a.jpg", "image/jpeg"), [Symbol.iterator]: function* () { yield this[0]; } };
  const r = await stagePhotos(listLike, opts());
  expect(r.made.length).toBe(1);
});
