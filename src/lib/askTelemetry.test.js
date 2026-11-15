import { trace } from "@opentelemetry/api";
import { askErrorCode, askEventAttributes, askStyle, emitAskEvent } from "./askTelemetry";

describe("askErrorCode: the code only, never the message", () => {
  test("Postgres and PostgREST codes pass as they are", () => {
    expect(askErrorCode({ code: "23505", message: "duplicate key: label Easton" })).toBe("23505");
    expect(askErrorCode({ code: "P0001", message: "Easton already…" })).toBe("P0001");
    expect(askErrorCode({ code: "PGRST116" })).toBe("PGRST116");
  });
  test("a fetch that never reached the server is network", () => {
    expect(askErrorCode(new TypeError("Failed to fetch"))).toBe("network");
    expect(askErrorCode({ message: "Load failed" })).toBe("network");
  });
  test("anything else is unknown — free text never passes as a code", () => {
    expect(askErrorCode({ code: "the ask Easton is gone" })).toBe("unknown");
    expect(askErrorCode(null)).toBe("unknown");
    expect(askErrorCode({})).toBe("unknown");
  });
  test("a delete that matched no live row says so", () => {
    expect(askErrorCode({ code: "no_live_row" })).toBe("no_live_row");
  });
});

describe("attributes: counts, a screen, an op and a code — nothing about the person", () => {
  test("each event's exact shape", () => {
    expect(askEventAttributes.ask_started("simple")).toEqual({ "ask.style": "explorer" });
    expect(askEventAttributes.ask_resumed("shelf", "standard")).toEqual({ screen: "shelf", "ask.style": "shopper" });
    expect(askEventAttributes.ask_abandoned("turn", 0, "simple")).toEqual({ screen: "turn", pick_count: 0, "ask.style": "explorer" });
    expect(askEventAttributes.ask_land_failed({ code: "42501", message: "Easton" }, 3, "standard"))
      .toEqual({ error: true, "error.message": "42501", error_code: "42501", pick_count: 3, "ask.style": "shopper" });
    expect(askEventAttributes.ask_admin_failed("create", { code: "23505", message: "label Easton taken" }))
      .toEqual({ error: true, "error.message": "23505", op: "create", error_code: "23505" });
  });
  test("ask.style: Simple is explorer; anything else (or nothing) is shopper — never a passed-through value", () => {
    expect(askStyle("simple")).toBe("explorer");
    expect(askStyle("standard")).toBe("shopper");
    expect(askStyle(undefined)).toBe("shopper");
    expect(askStyle("Easton")).toBe("shopper");
  });
  test("only the two failures carry the error flag", () => {
    ["ask_started", "ask_resumed", "ask_abandoned"].forEach((n) => expect(askEventAttributes[n]("shelf", 1)).not.toHaveProperty("error"));
  });
  test("unexpected values are flattened, never passed through", () => {
    expect(askEventAttributes.ask_resumed("Easton", "Easton")).toEqual({ screen: "unknown", "ask.style": "shopper" });
    expect(askEventAttributes.ask_abandoned("done", -2)).toEqual({ screen: "unknown", pick_count: 0, "ask.style": "shopper" });
    expect(askEventAttributes.ask_admin_failed("rename Easton", {})).toEqual({ error: true, "error.message": "unknown", op: "unknown", error_code: "unknown" });
  });
});

describe("emitAskEvent", () => {
  afterEach(() => jest.restoreAllMocks());
  test("one span, named for the event, with workflow.name and the attributes", () => {
    const end = jest.fn();
    const startSpan = jest.fn(() => ({ end }));
    jest.spyOn(trace, "getTracer").mockReturnValue({ startSpan });
    emitAskEvent("ask_abandoned", "shelf", 2);
    expect(startSpan).toHaveBeenCalledWith("ask_abandoned", { attributes: { "workflow.name": "ask_abandoned", screen: "shelf", pick_count: 2, "ask.style": "shopper" } });
    expect(end).toHaveBeenCalledTimes(1);
  });
  test("an unknown event name emits nothing; a tracer failure never throws", () => {
    expect(() => emitAskEvent("ask_label_seen", "Easton")).not.toThrow();
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    jest.spyOn(trace, "getTracer").mockReturnValue({ startSpan: () => { throw new Error("boom"); } });
    expect(() => emitAskEvent("ask_started")).not.toThrow();
    expect(warn).toHaveBeenCalled();
  });
});
