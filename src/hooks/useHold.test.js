import { render, screen, fireEvent, act } from "@testing-library/react";
import { useHold, HOLD_MS, holdFillCss } from "./useHold";

function Probe({ onHold, onRelease }) {
  const { holding, bind } = useHold({ onHold, onRelease });
  return <button type="button" className={holding ? "holding" : ""} {...bind}>press</button>;
}

describe("useHold", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());
  const setup = () => {
    const onHold = jest.fn(), onRelease = jest.fn();
    render(<Probe onHold={onHold} onRelease={onRelease} />);
    return { onHold, onRelease, b: screen.getByRole("button") };
  };

  test("the hold is one second", () => {
    expect(HOLD_MS).toBe(1000);
  });

  test("held for HOLD_MS → onHold once; `holding` is true only while pressed", () => {
    const { onHold, onRelease, b } = setup();
    fireEvent.pointerDown(b);
    expect(b).toHaveClass("holding");
    act(() => { jest.advanceTimersByTime(HOLD_MS - 1); });
    expect(onHold).not.toHaveBeenCalled();
    act(() => { jest.advanceTimersByTime(1); });
    expect(onHold).toHaveBeenCalledTimes(1);
    expect(b).not.toHaveClass("holding");
    fireEvent.pointerUp(b);   // lifting after the hold fired is not a release
    expect(onRelease).not.toHaveBeenCalled();
  });

  test("lifted, left or cancelled early → onRelease, never onHold", () => {
    const { onHold, onRelease, b } = setup();
    ["pointerUp", "pointerLeave", "pointerCancel"].forEach((end) => {
      fireEvent.pointerDown(b);
      act(() => { jest.advanceTimersByTime(400); });
      fireEvent[end](b);
      act(() => { jest.advanceTimersByTime(HOLD_MS); });
    });
    expect(onRelease).toHaveBeenCalledTimes(3);
    expect(onHold).not.toHaveBeenCalled();
    expect(b).not.toHaveClass("holding");
  });

  test("keyboard: Enter or Space held; a key repeat does not restart it", () => {
    const { onHold, b } = setup();
    fireEvent.keyDown(b, { key: "Enter" });
    act(() => { jest.advanceTimersByTime(600); });
    fireEvent.keyDown(b, { key: "Enter", repeat: true });
    act(() => { jest.advanceTimersByTime(400); });
    expect(onHold).toHaveBeenCalledTimes(1);
  });

  test("the fill rules carry the hold's own duration", () => {
    const css = holdFillCss(".x-fill", ".x.holding .x-fill");
    expect(css).toContain(".x-fill { position: absolute; inset: 0; background: #E8D5B7; transform: scaleX(0); transform-origin: left; transition: transform 0.2s; }");
    expect(css).toContain(".x.holding .x-fill { transform: scaleX(1); transition: transform 1000ms linear; }");
  });
});
