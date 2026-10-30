import { photosByMeal, photosFingerprint, addedDate, photoCaption, photoDetails, detailsDate, replaceSteps, MEAL_PHOTO_CAP, isShowcase, liveCookCount, atPhotoCap, setKindFailure } from "./mealPhotos";

const NOW = new Date(2026, 9, 21, 18, 0, 0);
const at = (daysAgo) => new Date(2026, 9, 21 - daysAgo, 12, 0, 0).toISOString();
const row = (id, mealId, daysAgo, extra = {}) => ({ id, meal_id: mealId, uploaded_at: at(daysAgo), uploaded_by: "u1", meal_cook_id: null, ...extra });
const first = (mb) => mb.name;

describe("photosByMeal", () => {
  test("groups by meal, keeps the read's newest-first order, caps at 3", () => {
    const rows = [row("a", "m1", 0), row("b", "m2", 1), row("c", "m1", 2), row("d", "m1", 3), row("e", "m1", 4)];
    const by = photosByMeal(rows);
    expect(MEAL_PHOTO_CAP).toBe(3);
    expect(by.m1.map((r) => r.id)).toEqual(["a", "c", "d"]);
    expect(by.m2.map((r) => r.id)).toEqual(["b"]);
  });
  test("D2: the card is the first row — the newest upload, whoever added it", () => {
    const by = photosByMeal([row("new", "m1", 0, { uploaded_by: "u2" }), row("old", "m1", 5)]);
    expect(by.m1[0].id).toBe("new");
  });
  test("skips soft-deleted rows and junk", () => {
    expect(photosByMeal([null, row("x", "m1", 0, { deleted_at: at(0) }), { id: "y" }])).toEqual({});
    expect(photosByMeal(null)).toEqual({});
  });
});

// SPEC_meal_sharing_v2 S26 / S28 (072): showcase photos sit outside the cap; one pick.
describe("photosByMeal with showcase photos (S26 / S28)", () => {
  const sc = (id, daysAgo, extra = {}) => row(id, "m1", daysAgo, { kind: "showcase", ...extra });
  const ck = (id, daysAgo, extra = {}) => row(id, "m1", daysAgo, { kind: "cook", ...extra });
  test("S26: the cap counts cook photos only — three cooks plus a showcase keeps all four; a fourth cook is dropped, the showcase never", () => {
    const by = photosByMeal([sc("s", 0), ck("a", 1), ck("b", 2), ck("c", 3), ck("d", 4)]);
    expect(by.m1.map((r) => r.id)).toEqual(["a", "s", "b", "c"]);
    expect(liveCookCount(by.m1)).toBe(3);
    expect(atPhotoCap(by.m1)).toBe(true);
    expect(atPhotoCap([sc("s", 0), ck("a", 1)])).toBe(false);
    expect(liveCookCount(null)).toBe(0);
  });
  test("S28: the pick is the newest live cook photo, even when a showcase photo is newer; then the rest newest-first", () => {
    const by = photosByMeal([sc("s2", 0), ck("a", 1), sc("s1", 2), ck("b", 3)]);
    expect(by.m1.map((r) => r.id)).toEqual(["a", "s2", "s1", "b"]);
  });
  test("S28: no cook photo → the newest showcase photo is the pick", () => {
    expect(photosByMeal([sc("s2", 0), sc("s1", 1)]).m1.map((r) => r.id)).toEqual(["s2", "s1"]);
  });
  test("rows with no kind (pre-072 reads) are cook photos", () => {
    expect(isShowcase(row("a", "m1", 0))).toBe(false);
    expect(isShowcase(sc("s", 0))).toBe(true);
    expect(isShowcase(null)).toBe(false);
    expect(photosByMeal([row("a", "m1", 0), row("b", "m1", 1), row("c", "m1", 2), row("d", "m1", 3)]).m1).toHaveLength(3);
  });
});

describe("photosFingerprint", () => {
  test("same rows → same print; a new upload or a removal changes it", () => {
    const a = [row("a", "m1", 0), row("b", "m1", 1)];
    expect(photosFingerprint(a)).toBe(photosFingerprint(a.map((r) => ({ ...r }))));
    expect(photosFingerprint(a)).not.toBe(photosFingerprint(a.slice(1)));
  });
  test("S46 (dev walk step 3, 2026-10-30): a flip changes the print — the same row as cook and as showcase differ; no kind reads as cook", () => {
    const cookRow = row("a", "m1", 0, { kind: "cook" });
    expect(photosFingerprint([cookRow])).not.toBe(photosFingerprint([{ ...cookRow, kind: "showcase" }]));
    expect(photosFingerprint([row("a", "m1", 0)])).toBe(photosFingerprint([cookRow]));
  });
});

describe("setKindFailure (S46: the RPC's message or a plain line, never swallowed)", () => {
  test("22023 'meal photos are full' → the full line", () => {
    expect(setKindFailure({ code: "22023", message: "set_photo_kind: meal photos are full" }))
      .toEqual({ reason: "full", line: "Meal photos are full. Remove one to make room." });
  });
  test("42501 → the author line; P0002 → the gone line", () => {
    expect(setKindFailure({ code: "42501", message: "set_photo_kind: only the photo's author can change its kind" }).line)
      .toBe("Only the person who added a photo can change it.");
    expect(setKindFailure({ code: "P0002", message: "set_photo_kind: not_found" }).line).toBe("That photo is gone. Pull to refresh.");
  });
  test("anything else carries the RPC's own message, with the function prefix dropped", () => {
    expect(setKindFailure({ code: "22023", message: "set_photo_kind: kind must be cook or showcase (got public)" }))
      .toEqual({ reason: "save", line: "Couldn’t change the photo: kind must be cook or showcase (got public)" });
    expect(setKindFailure({ code: "PGRST202", message: "Could not find the function public.set_photo_kind" }).line)
      .toBe("Couldn’t change the photo: Could not find the function public.set_photo_kind");
  });
  test("no error object at all → the plain line", () => {
    expect(setKindFailure(null)).toEqual({ reason: "save", line: "Couldn’t change the photo. Try again." });
  });
});

describe("addedDate / photoCaption (R2)", () => {
  test("an upload today reads 'today', never a cook's 'tonight'", () => {
    expect(addedDate(at(0), NOW)).toBe("today");
    expect(addedDate(at(1), NOW)).toBe("yesterday");
  });
  test("solo household: date only", () => {
    expect(photoCaption(row("a", "m1", 0), [{ user_id: "u1", name: "Dan" }], first, NOW)).toBe("Added today");
  });
  test("2+ members: the uploader's first name", () => {
    const members = [{ user_id: "u1", name: "Dan" }, { user_id: "u2", name: "Dana" }];
    expect(photoCaption(row("a", "m1", 1, { uploaded_by: "u2" }), members, first, NOW)).toBe("Added yesterday · Dana");
  });
  test("an uploader who has left names nobody", () => {
    const members = [{ user_id: "u1", name: "Dan" }, { user_id: "u2", name: "Dana" }];
    expect(photoCaption(row("a", "m1", 0, { uploaded_by: "gone" }), members, first, NOW)).toBe("Added today");
  });
  test("slice 2: a cook-attached photo reads Cooked {date}", () => {
    const p = row("a", "m1", 0, { meal_cook_id: "c1", cooked_at: at(2) });
    expect(photoCaption(p, [], first, NOW)).toMatch(/^Cooked /);
  });
  test("nothing to say → empty", () => {
    expect(photoCaption(null, [], first, NOW)).toBe("");
  });
});

describe("photoCaption: the viewer is 'You' (Dan, 2026-10-21)", () => {
  const members = [{ user_id: "u1", name: "Dan" }, { user_id: "u2", name: "Dan" }];
  test("the viewer's own photo → '· You'; another member's → their first name", () => {
    expect(photoCaption(row("a", "m1", 0, { uploaded_by: "u2" }), members, first, NOW, "u2")).toBe("Added today · You");
    expect(photoCaption(row("a", "m1", 0, { uploaded_by: "u1" }), members, first, NOW, "u2")).toBe("Added today · Dan");
  });
  test("solo: no name at all, not even 'You'", () => {
    expect(photoCaption(row("a", "m1", 0, { uploaded_by: "u1" }), [members[0]], first, NOW, "u1")).toBe("Added today");
  });
  test("a cook-attached photo of the viewer's: 'Cooked {date} · You'", () => {
    const p = row("a", "m1", 0, { uploaded_by: "u1", meal_cook_id: "c1", cooked_at: at(1) });
    expect(photoCaption(p, members, first, NOW, "u1")).toBe("Cooked yesterday · You");
  });
});

describe("photoDetails (SPEC_photo_menu DAN-2)", () => {
  const two = [{ user_id: "u1", name: "Dan" }, { user_id: "u2", name: "Helen" }];
  const day = (m, d, y = 2026) => new Date(y, m, d, 12, 0, 0).toISOString();
  const want = (iso) => new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  test("a calendar date, never a relative word; the year only outside this year", () => {
    expect(detailsDate(at(0), NOW)).toBe(want(at(0)));
    expect(detailsDate(day(11, 30, 2025), NOW)).toBe(new Date(day(11, 30, 2025)).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }));
    expect(detailsDate(null, NOW)).toBe("");
    expect(detailsDate("nope", NOW)).toBe("");
  });
  test("2+ members, uploader still one: 'Added by {First} · {date}' — the viewer's own photo too", () => {
    expect(photoDetails(row("a", "m1", 1), two, first, NOW)).toEqual([`Added by Dan · ${want(at(1))}`]);
    expect(photoDetails(row("a", "m1", 1, { uploaded_by: "u2" }), two, first, NOW)).toEqual([`Added by Helen · ${want(at(1))}`]);
  });
  test("solo, or the uploader left: 'Added {date}', no name", () => {
    expect(photoDetails(row("a", "m1", 1), [two[0]], first, NOW)).toEqual([`Added ${want(at(1))}`]);
    expect(photoDetails(row("a", "m1", 1, { uploaded_by: "gone" }), two, first, NOW)).toEqual([`Added ${want(at(1))}`]);
  });
  test("a cook-attached photo adds 'From the cook on {date}'", () => {
    const p = row("a", "m1", 0, { meal_cook_id: "c1", cooked_at: at(2) });
    expect(photoDetails(p, two, first, NOW)).toEqual([`Added by Dan · ${want(at(0))}`, `From the cook on ${want(at(2))}`]);
  });
  test("a showcase photo adds the S13 fact as its last line", () => {
    expect(photoDetails(row("a", "m1", 1, { kind: "showcase" }), two, first, NOW))
      .toEqual([`Added by Dan · ${want(at(1))}`, "Showcase photo · can be seen by anyone you give this meal to"]);
  });
  test("nothing to say → no lines", () => {
    expect(photoDetails(null, two, first, NOW)).toEqual([]);
    expect(photoDetails(row("a", "m1", 0, { uploaded_at: null }), two, first, NOW)).toEqual([]);
  });
});

describe("replaceSteps (SPEC_photo_menu DAN-1)", () => {
  test("a cook photo: upload, then add with the old cook (the RPC's per-cook replace)", () => {
    expect(replaceSteps({ id: "p", meal_cook_id: "c1" }, 3)).toEqual(["upload", "saveCook"]);
    expect(replaceSteps({ id: "p", meal_cook_id: "c1" }, 1)).toEqual(["upload", "saveCook"]);
  });
  test("a meal photo under the cap: upload → add → remove", () => {
    expect(replaceSteps({ id: "p", meal_cook_id: null }, 1)).toEqual(["upload", "save", "removeOld"]);
    expect(replaceSteps({ id: "p", meal_cook_id: null }, 2)).toEqual(["upload", "save", "removeOld"]);
  });
  test("a meal photo at the cap: upload → remove → add (an add first would age out the oldest)", () => {
    expect(replaceSteps({ id: "p", meal_cook_id: null }, 3)).toEqual(["upload", "removeOld", "save"]);
  });
  test("upload is always first, so a failed upload changes nothing", () => {
    [[{ meal_cook_id: "c" }, 2], [{}, 1], [{}, 3]].forEach(([o, n]) => expect(replaceSteps(o, n)[0]).toBe("upload"));
  });
});
