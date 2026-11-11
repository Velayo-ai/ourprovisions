import { inviteCodeFromInput, inviteShareText, inviteConsumedAttributes, inviteWorkflowName } from "./inviteLink";

describe("inviteCodeFromInput (A4)", () => {
  test("a full invite URL → its code", () => {
    expect(inviteCodeFromInput("https://ourprovisions.velayo.ai?invite=5EA0IB")).toBe("5EA0IB");
    expect(inviteCodeFromInput("  https://dev.ourprovisions.velayo.ai/?invite=Q5Y4R7#/home  ")).toBe("Q5Y4R7");
    expect(inviteCodeFromInput("https://ourprovisions.velayo.ai/?ref=R9R9R9&invite=ABC123")).toBe("ABC123");
  });
  test("a scheme-less paste is read the same way", () => {
    expect(inviteCodeFromInput("ourprovisions.velayo.ai/?invite=5EA0IB")).toBe("5EA0IB");
  });
  test("a bare code passes through as typed (the server normalizes case)", () => {
    expect(inviteCodeFromInput(" 5ea0ib ")).toBe("5ea0ib");
  });
  test("a URL with no invite falls back to the raw string; empty stays empty", () => {
    expect(inviteCodeFromInput("https://ourprovisions.velayo.ai/?ref=R9R9R9")).toBe("https://ourprovisions.velayo.ai/?ref=R9R9R9");
    expect(inviteCodeFromInput("   ")).toBe("");
    expect(inviteCodeFromInput(undefined)).toBe("");
  });
});

describe("inviteShareText (A5)", () => {
  test("names the place and the code; the link is not in the text", () => {
    const t = inviteShareText("Madbury", "https://ourprovisions.velayo.ai?invite=5EA0IB");
    expect(t).toBe("Come aboard my OurProvisions list — join Madbury. Code 5EA0IB if the link doesn't open the app.");
    expect(t).not.toMatch(/https?:/);
  });
  test("no code in the url → the sentence without the code line", () => {
    expect(inviteShareText("Madbury", "not a url")).toBe("Come aboard my OurProvisions list — join Madbury.");
  });
});

describe("inviteConsumedAttributes (A6)", () => {
  test("three outcomes, booleans and a fixed word only", () => {
    expect(inviteConsumedAttributes(false, false)).toEqual({ present: false, outcome: "absent" });
    expect(inviteConsumedAttributes(true, true)).toEqual({ present: true, outcome: "joined" });
    expect(inviteConsumedAttributes(true, false)).toEqual({ present: true, outcome: "failed" });
    expect(inviteConsumedAttributes("5EA0IB", false)).toEqual({ present: true, outcome: "failed" });
  });
});

describe("inviteWorkflowName", () => {
  test("joined and failed get a Splunk workflow name", () => {
    expect(inviteWorkflowName("joined")).toBe("invite_joined");
    expect(inviteWorkflowName("failed")).toBe("invite_failed");
  });
  test("absent → null: it fires on every app open, so it stays an unnamed span", () => {
    expect(inviteWorkflowName("absent")).toBeNull();
    expect(inviteWorkflowName(inviteConsumedAttributes(false, false).outcome)).toBeNull();
  });
  test("anything else → null", () => {
    expect(inviteWorkflowName(undefined)).toBeNull();
    expect(inviteWorkflowName("")).toBeNull();
  });
  test("the names follow the attributes' outcome", () => {
    expect(inviteWorkflowName(inviteConsumedAttributes(true, true).outcome)).toBe("invite_joined");
    expect(inviteWorkflowName(inviteConsumedAttributes(true, false).outcome)).toBe("invite_failed");
  });
});
