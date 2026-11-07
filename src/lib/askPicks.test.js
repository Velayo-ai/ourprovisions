import { landAskPicksArgs, askCompletedAttributes, joinPickLabels, swipeRemoveConfirm, provenanceClayLine, pickInitials } from "./askPicks";

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

describe("provenanceClayLine — one line, Added by then Picked by (C4)", () => {
  test("either facet alone, both joined by ' · ', or nothing", () => {
    expect(provenanceClayLine(["you"], null)).toBe("Added by you");
    expect(provenanceClayLine([], ["Easton"])).toBe("Picked by Easton");
    expect(provenanceClayLine(["you"], ["Easton"])).toBe("Added by you · Picked by Easton");
    expect(provenanceClayLine(["you", "Paige"], ["Easton", "Everett"])).toBe("Added by you & Paige · Picked by Easton & Everett");
    expect(provenanceClayLine([], [])).toBeNull();
    expect(provenanceClayLine(null, null)).toBeNull();
  });
  test("repeated or blank names collapse", () => {
    expect(provenanceClayLine(["you", "you"], ["Easton", " ", "Easton"])).toBe("Added by you · Picked by Easton");
  });
});

describe("pickInitials — the tray's picker initials (A19; two-E ruling C4.1)", () => {
  test("one letter per distinct picker, in order", () => {
    expect(pickInitials(["Easton"])).toEqual(["E"]);
    expect(pickInitials(["nina", "Easton", "nina"])).toEqual(["N", "E"]);
    expect(pickInitials(null)).toEqual([]);
    expect(pickInitials([" ", ""])).toEqual([]);
  });
  test("pickers on the same row who share a first letter show two letters", () => {
    expect(pickInitials(["Easton", "Everett"])).toEqual(["Ea", "Ev"]);
    expect(pickInitials(["easton", "Nina", "everett"])).toEqual(["Ea", "N", "Ev"]);   // Nina keeps one
  });
  test("a non-colliding pair stays single letters", () => {
    expect(pickInitials(["Easton", "Nina"])).toEqual(["E", "N"]);
  });
  test("a two-letter collision shows both as-is, no further rule", () => {
    expect(pickInitials(["Eva", "Evan"])).toEqual(["Ev", "Ev"]);
    expect(pickInitials(["E", "Easton"])).toEqual(["E", "Ea"]);                      // a one-letter label has no second letter
  });
});
