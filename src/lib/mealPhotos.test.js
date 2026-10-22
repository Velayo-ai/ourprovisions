import { photosByMeal, photosFingerprint, addedDate, photoCaption, MEAL_PHOTO_CAP } from "./mealPhotos";

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

describe("photosFingerprint", () => {
  test("same rows → same print; a new upload or a removal changes it", () => {
    const a = [row("a", "m1", 0), row("b", "m1", 1)];
    expect(photosFingerprint(a)).toBe(photosFingerprint(a.map((r) => ({ ...r }))));
    expect(photosFingerprint(a)).not.toBe(photosFingerprint(a.slice(1)));
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
