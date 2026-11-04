import { landAskPicksArgs, askCompletedAttributes, joinPickLabels, swipeRemoveConfirm } from "./askPicks";

describe("landAskPicksArgs (A22: ids only, never the label)", () => {
  test("carries exactly the household, the ask and the ids", () => {
    const args = landAskPicksArgs("hh-1", "ask-1", ["c1", "c2", "c3"]);
    expect(Object.keys(args).sort()).toEqual(["p_ask_id", "p_catalog_item_ids", "p_household_id"]);
    expect(args).toEqual({ p_household_id: "hh-1", p_ask_id: "ask-1", p_catalog_item_ids: ["c1", "c2", "c3"] });
  });

  test("copies the ids, so the held wagon can't be mutated through the request", () => {
    const ids = ["c1"];
    const args = landAskPicksArgs("hh-1", "ask-1", ids);
    args.p_catalog_item_ids.push("x");
    expect(ids).toEqual(["c1"]);
  });

  test("no label travels, whatever the caller has in hand", () => {
    const serialized = JSON.stringify(landAskPicksArgs("hh-1", "ask-1", ["c1"]));
    expect(serialized).not.toMatch(/label|Easton|picked/i);
  });
});

describe("askCompletedAttributes (A24 / R5: the count only)", () => {
  test("one attribute, pick_count", () => {
    expect(askCompletedAttributes(3)).toEqual({ pick_count: 3 });
    expect(Object.keys(askCompletedAttributes(1))).toEqual(["pick_count"]);
  });

  test("anything that isn't a positive integer reads 0, never a passed-through value", () => {
    expect(askCompletedAttributes(null)).toEqual({ pick_count: 0 });
    expect(askCompletedAttributes("Easton")).toEqual({ pick_count: 0 });
    expect(askCompletedAttributes(2.5)).toEqual({ pick_count: 0 });
    expect(askCompletedAttributes(-1)).toEqual({ pick_count: 0 });
  });
});

describe("joinPickLabels", () => {
  test("one, two, three names", () => {
    expect(joinPickLabels(["Easton"])).toBe("Easton");
    expect(joinPickLabels(["Easton", "Everett"])).toBe("Easton & Everett");
    expect(joinPickLabels(["Easton", "Everett", "Nina"])).toBe("Easton, Everett & Nina");
  });

  test("null, empty and blank read as no picker", () => {
    expect(joinPickLabels(null)).toBe("");
    expect(joinPickLabels([])).toBe("");
    expect(joinPickLabels(["", "  "])).toBe("");
  });
});

describe("swipeRemoveConfirm (R3)", () => {
  const me = "user_me";
  const mine = { clerkId: me, fullName: "Dan Holmes" };
  const paige = { clerkId: "user_paige", fullName: "Paige" };

  test("a picked row with no contributors confirms, naming the picker", () => {
    expect(swipeRemoveConfirm({ pickedByLabels: ["Easton"], contributors: [] }, me))
      .toEqual({ verb: "picked", byName: "Easton" });
  });

  test("a picked row confirms even for the member who ran the ask — no account is the picker", () => {
    expect(swipeRemoveConfirm({ pickedByLabels: ["Easton"], contributors: [mine] }, me))
      .toEqual({ verb: "picked", byName: "Easton" });
  });

  test("two pickers are both named", () => {
    expect(swipeRemoveConfirm({ pickedByLabels: ["Easton", "Everett"] }, me))
      .toEqual({ verb: "picked", byName: "Easton & Everett" });
  });

  test("the pre-077 rule is unchanged: my own item removes at once", () => {
    expect(swipeRemoveConfirm({ pickedByLabels: null, contributors: [mine] }, me)).toBeNull();
    expect(swipeRemoveConfirm({ contributors: [] }, me)).toBeNull();
    expect(swipeRemoveConfirm({}, me)).toBeNull();
  });

  test("the pre-077 rule is unchanged: someone else's item confirms with their name", () => {
    expect(swipeRemoveConfirm({ contributors: [mine, paige] }, me)).toEqual({ verb: "added", byName: "Paige" });
    expect(swipeRemoveConfirm({ addedBy: "Paige H", contributors: [paige] }, me)).toEqual({ verb: "added", byName: "Paige H" });
    expect(swipeRemoveConfirm({ contributors: [{ clerkId: "user_x" }] }, me)).toEqual({ verb: "added", byName: "someone else" });
  });
});
