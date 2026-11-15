import { trace } from "@opentelemetry/api";
import { askErrorCode, askEventAttributes, emitAskEvent } from "./askTelemetry";

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
    expect(askEventAttributes.ask_started()).toEqual({});
    expect(askEventAttributes.ask_resumed("shelf")).toEqual({ screen: "shelf" });
    expect(askEventAttributes.ask_abandoned("turn", 0)).toEqual({ screen: "turn", pick_count: 0 });
    expect(askEventAttributes.ask_land_failed({ code: "42501", message: "Easton" }, 3)).toEqual({ error_code: "42501", pick_count: 3 });
    expect(askEventAttributes.ask_admin_failed("create", { code: "23505" })).toEqual({ op: "create", error_code: "23505" });
  });
  test("unexpected values are flattened, never passed through", () => {
    expect(askEventAttributes.ask_resumed("Easton")).toEqual({ screen: "unknown" });
    expect(askEventAttributes.ask_abandoned("done", -2)).toEqual({ screen: "unknown", pick_count: 0 });
    expect(askEventAttributes.ask_admin_failed("rename Easton", {})).toEqual({ op: "unknown", error_code: "unknown" });
  });
});

describe("emitAskEvent", () => {
  afterEach(() => jest.restoreAllMocks());
  test("one span, named for the event, with workflow.name and the attributes", () => {
    const end = jest.fn();
    const startSpan = jest.fn(() => ({ end }));
    jest.spyOn(trace, "getTracer").mockReturnValue({ startSpan });
    emitAskEvent("ask_abandoned", "shelf", 2);
    expect(startSpan).toHaveBeenCalledWith("ask_abandoned", { attributes: { "workflow.name": "ask_abandoned", screen: "shelf", pick_count: 2 } });
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
