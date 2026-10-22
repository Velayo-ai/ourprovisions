/* eslint-disable testing-library/no-node-access, testing-library/no-container --
   "Your cooks" is audited as raw DOM: which lines, which controls, what text. */
// Run: CI=true npx react-scripts test --watchAll=false src/YourCooks
//
// SPEC_meal_photos_v1, 2026-10-21 amendment (slice 2), S5 — "Your cooks" in the recipe view:
//   - from ONE cook when any cook has a rating, a note or a photo; nothing attached → nothing
//   - per cook: the date, then one line per rater (first name in a 2+ member household, stars, note)
//   - "How was it for you?" on a cook the viewer hasn't rated; their own line is tappable after
//   - never a line about who didn't rate; no averages, anywhere (S7)
//   - a cook-attached photo's caption reads "Cooked {date}" (+ " · {First}" in 2+ member households)
import { render, fireEvent } from "@testing-library/react";

jest.mock("@splunk/otel-web", () => ({ __esModule: true, default: { init: () => {}, setGlobalAttributes: () => {} } }));
jest.mock("@splunk/otel-web-session-recorder", () => ({ __esModule: true, default: { init: () => {} } }));
const { RecipeView } = require("./App");

const MEAL = { id: "9d8c7b6a-5f4e-4d3c-8b2a-1f0e9d8c7b6a", kind: "meal", name: "Grandma's Chili", occasion: ["dinner"], instructions: "", attribution: "", created_by: null, meal_ingredients: [] };
const DH = "u-dh", DT = "u-dt";
const TWO = [{ user_id: DH, users: { full_name: "Dan Holmes" } }, { user_id: DT, users: { full_name: "Helen Test" } }];
const ONE = [{ user_id: DH, users: { full_name: "Dan Holmes" } }];
const daysAgo = (d) => new Date(Date.now() - d * 86400000).toISOString();
const C1 = { id: "c1", cooked_at: daysAgo(10) }, C2 = { id: "c2", cooked_at: daysAgo(20) };

function view({ cooks = [C1], ratings = {}, members = TWO, viewer = DT, photos = [], canRate = true } = {}) {
  const onRate = jest.fn();
  const utils = render(
    <RecipeView meal={MEAL} state={null} members={members} cookCount={cooks.length} lastCookedAt={cooks[0] ? cooks[0].cooked_at : null} cookRows={cooks} links={null}
      tagsReady={false} addedThisPlan={false} viewerUserId={viewer} busy={false}
      onPlan={jest.fn()} onAddToShop={jest.fn()} onCooked={jest.fn()} onRemove={jest.fn()} onSeeList={jest.fn()} onClose={jest.fn()} onEdit={jest.fn()}
      photos={photos} photosReady canEditPhotos photoBusy={false} onAddPhoto={jest.fn()} onRemovePhoto={jest.fn()}
      ratingsFor={(id) => ratings[id] || []} onRate={onRate} canRate={canRate} />,
  );
  return { ...utils, onRate };
}
const q = (c, s) => c.querySelector(s);
const qa = (c, s) => Array.from(c.querySelectorAll(s));
const section = (c) => qa(c, ".rv-sec").find((h) => h.textContent.startsWith("Your cooks"));

describe("'Your cooks' (S5)", () => {
  test("cooked once, nothing attached → no 'Your cooks' (unchanged)", () => {
    const { container } = view();
    expect(section(container)).toBeUndefined();
  });

  test("cooked once and rated → 'Your cooks · 1': the date, the rater's line with name and stars, the note beneath", () => {
    const { container } = view({ ratings: { c1: [{ meal_cook_id: "c1", user_id: DH, rating: 3, note: "Double the garlic" }] } });
    expect(section(container).textContent).toBe("Your cooks 1");
    const row = q(container, ".rv-cook");
    expect(q(row, ".rv-cook-date").textContent).not.toBe("");
    const line = q(row, ".rv-rater");
    expect(q(line, ".rv-rater-name").textContent).toBe("Dan");
    expect(q(line, ".rv-stars .sr-only").textContent).toBe("3 of 3");
    expect(q(line, ".rv-rater-note").textContent).toBe("Double the garlic");
    expect(q(line, "button")).toBeNull();   // someone else's stars are drawn, never buttons
  });

  test("the viewer who hasn't rated sees 'How was it for you?' with three stars; a tap rates THIS cook as the viewer", () => {
    const { container, onRate } = view({ ratings: { c1: [{ meal_cook_id: "c1", user_id: DH, rating: 3, note: null }] } });
    const mine = q(container, ".rv-rater.mine");
    expect(q(mine, ".rate-label").textContent).toBe("How was it for you?");
    fireEvent.click(qa(mine, ".rate-star")[0]);
    expect(onRate).toHaveBeenCalledWith("c1", 1, "");
  });

  test("once rated, the viewer's own line is tappable to change it, labelled \"You\"", () => {
    const { container, onRate } = view({ ratings: { c1: [{ meal_cook_id: "c1", user_id: DT, rating: 2, note: null }] } });
    const mine = q(container, ".rv-rater.mine");
    expect(q(mine, ".rate-label").textContent).toBe("You");   // never their own first name (two members can share one)
    expect(qa(mine, ".rate-star.on")).toHaveLength(2);
    expect(q(mine, ".rate-note")).toBeNull();   // no empty note field under a rated cook
    fireEvent.click(qa(mine, ".rate-star")[2]);
    expect(onRate).toHaveBeenCalledWith("c1", 3, "");
  });

  test("solo household: stars only, no names", () => {
    const { container } = view({ members: ONE, viewer: DH, ratings: { c1: [{ meal_cook_id: "c1", user_id: DH, rating: 3, note: null }] } });
    expect(q(container, ".rv-rater-name")).toBeNull();
    expect(q(container, ".rv-rater.mine .rate-label").textContent).toBe("");
  });

  test("never a line about who didn't rate; no averages anywhere", () => {
    const { container } = view({ cooks: [C1, C2], ratings: { c1: [{ meal_cook_id: "c1", user_id: DH, rating: 3, note: null }] } });
    const text = container.textContent;
    expect(text).not.toMatch(/hasn't|has not|didn't|not rated|average|avg/i);
    expect(text).not.toMatch(/\d\.\d/);
    // the unrated cook c2: no other-rater lines, only the viewer's own "How was it for you?"
    const rows = qa(container, ".rv-cook");
    expect(rows).toHaveLength(2);
    expect(qa(rows[1], ".rv-rater:not(.mine)")).toHaveLength(0);
  });

  test("a cleared rating (no row) shows no stars — no vote is not a rating", () => {
    const { container } = view({ cooks: [C1, C2] });   // shown by the 2+ rule, nobody rated
    expect(qa(container, ".rv-stars")).toHaveLength(0);
    expect(qa(container, ".rate-star.on")).toHaveLength(0);
  });

  test("a cook-attached photo alone opens 'Your cooks' from one cook, and its caption reads 'Cooked {date} · {First}'", () => {
    const photo = { id: "p1", meal_id: MEAL.id, meal_cook_id: "c1", cooked_at: C1.cooked_at, uploaded_by: DH, uploaded_at: daysAgo(10), view_path: "v", url: "https://x/v" };
    const { container } = view({ photos: [photo] });
    expect(section(container).textContent).toBe("Your cooks 1");
    expect(q(container, ".rv-photo-cap").textContent).toMatch(/^Cooked .+ · Dan$/);
  });

  test("signed out: other members' lines show, no rating controls", () => {
    const { container } = view({ canRate: false, ratings: { c1: [{ meal_cook_id: "c1", user_id: DH, rating: 2, note: null }] } });
    expect(q(container, ".rate-star")).toBeNull();
    expect(q(container, ".rv-stars .sr-only").textContent).toBe("2 of 3");
  });

  test("no name, note or count in any attribute in 'Your cooks'", () => {
    const { container } = view({ ratings: { c1: [{ meal_cook_id: "c1", user_id: DH, rating: 3, note: "Double the garlic" }, { meal_cook_id: "c1", user_id: DT, rating: 1, note: "too salty" }] } });
    qa(container, ".rv-cooks *").forEach((el) => Array.from(el.attributes).forEach((a) => {
      if (a.name === "value") return;   // the viewer's own note input — masked on prod by maskAllInputs
      expect(a.value).not.toMatch(/Dan|Helen|garlic|salty|(?<!Rate )\b[123] of 3\b/);   // the fixed "Rate N of 3" label is the only count allowed
    }));
  });
});

// "How was it for you?" only on the meal's NEWEST cook, and only if the viewer hasn't rated it — it never
// moves to an older cook. Rated lines stay editable (Dan, 2026-10-21).
describe("'How was it for you?' is offered on the newest cook only", () => {
  const C3 = { id: "c3", cooked_at: daysAgo(30) };
  const prompts = (c) => qa(c, ".rv-cook").map((row) => {
    const label = q(row, ".rv-rater.mine .rate-label");
    return label ? label.textContent : null;
  });

  test("three cooks, the viewer rated none → the prompt on the newest only", () => {
    const { container } = view({ cooks: [C1, C2, C3], ratings: { c2: [{ meal_cook_id: "c2", user_id: DH, rating: 2, note: null }] } });
    expect(prompts(container)).toEqual(["How was it for you?", null, null]);
  });

  test("rated the newest → no prompt anywhere; the own line stays editable", () => {
    const { container, onRate } = view({ cooks: [C1, C2, C3], ratings: { c1: [{ meal_cook_id: "c1", user_id: DT, rating: 3, note: null }] } });
    expect(prompts(container)).toEqual(["You", null, null]);
    expect(container.textContent).not.toMatch(/How was it for you\?/);
    fireEvent.click(qa(qa(container, ".rv-cook")[0], ".rate-star")[1]);
    expect(onRate).toHaveBeenCalledWith("c1", 2, "");
  });

  test("an older cook the viewer rated keeps its editable line; the newest, unrated, gets the prompt", () => {
    const { container } = view({ cooks: [C1, C2, C3], ratings: { c3: [{ meal_cook_id: "c3", user_id: DT, rating: 2, note: null }] } });
    expect(prompts(container)).toEqual(["How was it for you?", null, "You"]);
  });

  test("an older unrated cook never shows stars to tap", () => {
    const { container } = view({ cooks: [C1, C2, C3], ratings: { c1: [{ meal_cook_id: "c1", user_id: DT, rating: 3, note: null }] } });
    expect(qa(qa(container, ".rv-cook")[1], ".rate-star")).toHaveLength(0);
    expect(qa(qa(container, ".rv-cook")[2], ".rate-star")).toHaveLength(0);
  });
});

// "You" (Dan, 2026-10-21): the viewer's own line and own photos never carry their first name — two
// members can share one (both test accounts are "Dan"). Other members keep their first names.
describe("the viewer is 'You'", () => {
  const SAME = [{ user_id: DH, users: { full_name: "Dan Holmes" } }, { user_id: DT, users: { full_name: "Dan Test User" } }];
  test("two members both named Dan: the other is 'Dan', the viewer is 'You'", () => {
    const { container } = view({ members: SAME, ratings: { c1: [{ meal_cook_id: "c1", user_id: DH, rating: 3, note: null }, { meal_cook_id: "c1", user_id: DT, rating: 1, note: null }] } });
    expect(q(container, ".rv-rater:not(.mine) .rv-rater-name").textContent).toBe("Dan");
    expect(q(container, ".rv-rater.mine .rate-label").textContent).toBe("You");
  });
  test("signed out (read-only), the viewer's own line still reads 'You'", () => {
    const { container } = view({ members: SAME, canRate: false, ratings: { c1: [{ meal_cook_id: "c1", user_id: DT, rating: 2, note: null }] } });
    expect(qa(container, ".rv-rater-name").map((e) => e.textContent)).toEqual(["You"]);
  });
  test("the viewer's own photo caption reads '· You'; another member's reads their first name", () => {
    const own = { id: "p1", meal_id: MEAL.id, meal_cook_id: "c1", cooked_at: C1.cooked_at, uploaded_by: DT, uploaded_at: daysAgo(10), view_path: "v", url: "https://x/v" };
    expect(q(view({ members: SAME, photos: [own] }).container, ".rv-photo-cap").textContent).toMatch(/^Cooked .+ · You$/);
  });
});
