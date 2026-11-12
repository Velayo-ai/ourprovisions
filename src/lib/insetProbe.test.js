import { probeEnabled, insetProbeLines, DEV_HOSTS } from "./insetProbe";

describe("the top-edge probe", () => {
  test("only in the installed app on the dev host — never prod, never a browser tab", () => {
    expect(probeEnabled({ hostname: "dev.ourprovisions.velayo.ai", standalone: true })).toBe(true);
    expect(probeEnabled({ hostname: "localhost", standalone: true })).toBe(true);
    expect(probeEnabled({ hostname: "dev.ourprovisions.velayo.ai", standalone: false })).toBe(false);
    expect(probeEnabled({ hostname: "dev.ourprovisions.velayo.ai", standalone: undefined })).toBe(false);
    expect(probeEnabled({ hostname: "ourprovisions.velayo.ai", standalone: true })).toBe(false);
    expect(probeEnabled({ hostname: undefined, standalone: true })).toBe(false);
    expect(DEV_HOSTS).not.toContain("ourprovisions.velayo.ai");
  });

  test("a bar-sized gap reads as: the page starts below the bar", () => {
    const lines = insetProbeLines({ envTop: "0px", opInsetTop: "62px", screenHeight: 956, innerHeight: 894, vvHeight: 894, vvOffsetTop: 0 });
    expect(lines[0]).toBe("env(safe-area-inset-top): 0px");
    expect(lines[1]).toBe("page starts BELOW the bar (gap 62px)");
    expect(lines[2]).toBe("--op-inset-top: 62px · screen 956 · inner 894");
    expect(lines[3]).toBe("visualViewport: 894 @ 0");
  });

  test("no gap reads as: the page runs behind the bar; sideways is labelled; no visualViewport is n/a", () => {
    expect(insetProbeLines({ envTop: "62px", opInsetTop: "0px", screenHeight: 956, innerHeight: 956, vvHeight: 956, vvOffsetTop: 0 })[1])
      .toBe("page runs BEHIND the bar (gap 0)");
    expect(insetProbeLines({ envTop: "0px", opInsetTop: "0px", screenHeight: 440, innerHeight: 440, landscape: true })[1])
      .toBe("sideways — page runs BEHIND the bar (gap 0)");
    expect(insetProbeLines({ envTop: "0px", opInsetTop: "0px", screenHeight: 956, innerHeight: 894 })[3]).toBe("visualViewport: n/a");
  });
});
