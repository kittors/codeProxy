import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, test, vi } from "vitest";
import { NavList } from "../../navigation/NavList";
import { FormField } from "../../primitives/Form";
import { ToggleSwitch } from "../../primitives/ToggleSwitch";
import { Callout } from "../Callout";
import { CheckboxField } from "../CheckboxField";
import { ChoiceCards } from "../ChoiceCards";
import { DetailList } from "../DetailList";
import { FormSection } from "../FormSection";
import { SecretValue } from "../SecretValue";
import { SettingGroup, SettingRow } from "../SettingRow";

describe("ChoiceCards", () => {
  test("is a radiogroup and arrow keys move the selection", async () => {
    const user = userEvent.setup();
    function Harness() {
      const [value, setValue] = useState<"allow" | "deny">("allow");
      return (
        <ChoiceCards
          ariaLabel="Action"
          value={value}
          onChange={setValue}
          options={[
            { value: "allow", label: "Allow", description: "Let matching requests through" },
            { value: "deny", label: "Deny", description: "Reject matching requests" },
          ]}
        />
      );
    }
    render(<Harness />);
    const allow = screen.getByRole("radio", { name: /Allow/ });
    const deny = screen.getByRole("radio", { name: /Deny/ });
    expect(allow).toHaveAttribute("aria-checked", "true");
    expect(deny).toHaveAttribute("tabindex", "-1");

    allow.focus();
    await user.keyboard("{ArrowRight}");
    expect(deny).toHaveAttribute("aria-checked", "true");
    expect(deny).toHaveFocus();

    await user.click(allow);
    expect(allow).toHaveAttribute("aria-checked", "true");
  });

  test("inside a FormField the visible label names the group and the hint describes it", () => {
    render(
      <FormField label="Effect" description="Deny wins over allow">
        <ChoiceCards
          value="allow"
          onChange={() => undefined}
          options={[
            { value: "allow", label: "Allow" },
            { value: "deny", label: "Deny" },
          ]}
        />
      </FormField>,
    );
    const group = screen.getByRole("radiogroup", { name: "Effect" });
    expect(group).toHaveAccessibleDescription("Deny wins over allow");
  });
});

describe("SettingRow", () => {
  test("shows the description inline, links it to the control and offers revert when modified", async () => {
    const user = userEvent.setup();
    const onReset = vi.fn();
    render(
      <SettingGroup>
        <SettingRow
          label="Request log"
          description="Record every request"
          meta="request-log"
          modified
          onReset={onReset}
          controlWidth="auto"
          control={<ToggleSwitch checked ariaLabel="Request log" onCheckedChange={() => undefined} />}
        />
      </SettingGroup>,
    );
    expect(screen.getByText("Record every request")).toBeVisible();
    expect(screen.getByText("request-log")).toBeInTheDocument();
    expect(screen.getByRole("switch", { name: "Request log" })).toHaveAccessibleDescription(
      /Record every request/,
    );
    await user.click(screen.getByRole("button", { name: /revert|撤销/i }));
    expect(onReset).toHaveBeenCalledTimes(1);
  });
});

describe("DetailList / SecretValue / CheckboxField / Callout / FormSection", () => {
  test("renders a dash for empty values and a copy button when asked", () => {
    render(
      <DetailList
        items={[
          { label: "Name", value: "ada" },
          { label: "Email", value: "" },
          { label: "Key", value: "sk-1", copyValue: "sk-1", mono: true },
        ]}
      />,
    );
    expect(screen.getByText("—")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /copy|复制/i })).toHaveLength(1);
  });

  test("a maskable secret starts hidden and can be revealed", async () => {
    const user = userEvent.setup();
    render(<SecretValue label="Password" value="hunter2-very-secret" maskable />);
    expect(screen.queryByText("hunter2-very-secret")).toBeNull();
    await user.click(screen.getByRole("button", { name: /show|显示/i }));
    expect(screen.getByText("hunter2-very-secret")).toBeInTheDocument();
  });

  test("the whole checkbox row toggles", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <CheckboxField
        checked={false}
        onCheckedChange={onChange}
        label="Also delete logs"
        description="Request logs for this key are removed too"
      />,
    );
    await user.click(screen.getByText("Request logs for this key are removed too"));
    expect(onChange).toHaveBeenCalledWith(true);
    expect(screen.getByRole("checkbox", { name: "Also delete logs" })).toHaveAccessibleDescription(
      "Request logs for this key are removed too",
    );
  });

  test("callout and form section expose their headings", () => {
    render(
      <>
        <Callout tone="warning" title="Restart needed" role="status">
          Changes apply after restart.
        </Callout>
        <FormSection title="Basics" description="Who this is">
          <input aria-label="Name" />
        </FormSection>
      </>,
    );
    expect(screen.getByRole("status")).toHaveTextContent("Restart needed");
    expect(screen.getByRole("region", { name: "Basics" })).toContainElement(
      screen.getByRole("textbox", { name: "Name" }),
    );
  });
});

describe("NavList", () => {
  test("nav mode marks the current item and moves with arrow keys", async () => {
    const user = userEvent.setup();
    function Harness() {
      const [value, setValue] = useState("network");
      return (
        <NavList
          mode="nav"
          ariaLabel="Sections"
          value={value}
          onChange={setValue}
          groups={[
            {
              id: "g",
              items: [
                { id: "network", label: "Network" },
                { id: "storage", label: "Storage", dot: true, srHint: "has changes" },
              ],
            },
          ]}
        />
      );
    }
    render(<Harness />);
    const nav = screen.getByRole("navigation", { name: "Sections" });
    expect(nav).toBeInTheDocument();
    const network = screen.getByRole("button", { name: "Network" });
    expect(network).toHaveAttribute("aria-current", "true");
    network.focus();
    fireEvent.keyDown(network, { key: "ArrowDown" });
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /Storage/ })).toHaveAttribute(
        "aria-current",
        "true",
      ),
    );
    await user.click(network);
    expect(network).toHaveAttribute("aria-current", "true");
  });

  test("fades the ends of the narrow-screen strip while items overflow it", () => {
    render(
      <NavList
        ariaLabel="Providers"
        value="codex"
        onChange={() => {}}
        groups={[
          {
            id: "g",
            items: [
              { id: "codex", label: "Codex" },
              { id: "claude", label: "Claude" },
            ],
          },
        ]}
      />,
    );
    const list = screen.getByRole("tablist", { name: "Providers" });
    expect(list).not.toHaveClass("code-proxy-scroll-edge-fade-x");
    // 窄屏横排时列表自己横向滚动；竖排后没有横向溢出，遮罩随之收起。
    Object.defineProperty(list, "scrollWidth", { configurable: true, value: 500 });
    Object.defineProperty(list, "clientWidth", { configurable: true, value: 320 });
    act(() => {
      list.scrollLeft = 0;
      fireEvent.scroll(list);
    });
    expect(list).toHaveClass("code-proxy-scroll-edge-fade-x");
    expect(list.style.getPropertyValue("--scroll-fade-right")).toBe("24px");
    Object.defineProperty(list, "scrollWidth", { configurable: true, value: 320 });
    act(() => {
      fireEvent.scroll(list);
    });
    expect(list).not.toHaveClass("code-proxy-scroll-edge-fade-x");
  });
});
