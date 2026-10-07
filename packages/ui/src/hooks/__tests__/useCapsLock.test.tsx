import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { useCapsLock } from "../useCapsLock";

function Probe() {
  const { capsLock, onKeyDown, onKeyUp, onBlur } = useCapsLock();
  return (
    <>
      <input aria-label="password" onKeyDown={onKeyDown} onKeyUp={onKeyUp} onBlur={onBlur} />
      <output>{capsLock ? "on" : "off"}</output>
    </>
  );
}

/** jsdom 的 KeyboardEvent 不读 modifierCapsLock，这里直接替换 getModifierState。 */
function pressWithCapsLock(target: HTMLElement, capsLock: boolean) {
  const event = new KeyboardEvent("keydown", { key: "a", bubbles: true });
  Object.defineProperty(event, "getModifierState", {
    value: (key: string) => key === "CapsLock" && capsLock,
  });
  fireEvent(target, event);
}

describe("useCapsLock", () => {
  test("follows Caps Lock from keyboard events and resets on blur", () => {
    render(<Probe />);
    const input = screen.getByLabelText("password");
    expect(screen.getByText("off")).toBeInTheDocument();

    pressWithCapsLock(input, true);
    expect(screen.getByText("on")).toBeInTheDocument();

    pressWithCapsLock(input, false);
    expect(screen.getByText("off")).toBeInTheDocument();

    pressWithCapsLock(input, true);
    fireEvent.blur(input);
    expect(screen.getByText("off")).toBeInTheDocument();
  });
});
