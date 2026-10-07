import { render, screen } from "@testing-library/react";
import { Building2, KeyRound, ScrollText, Trash2, UserPlus } from "lucide-react";
import { describe, expect, test } from "vitest";
import { PlanBadge, ProviderTag } from "../../brand/BrandBadges";
import { chartGradient, withAlpha } from "../../charts/chartTheme";
import { DialogIcon } from "../../overlays/DialogIcon";
import { HUE_TILE, hueForIcon, hueForIconName } from "../hues";

describe("icon hues", () => {
  test("the same icon always gets the same hue, by its lucide name", () => {
    expect(hueForIcon(<UserPlus />)).toBe("blue");
    expect(hueForIcon(<Building2 />)).toBe("indigo");
    expect(hueForIcon(<KeyRound size={16} />)).toBe("amber");
    expect(hueForIcon(<ScrollText />)).toBe("orange");
  });

  test("unregistered icons hash to a stable hue; non-icons have none", () => {
    expect(hueForIconName("SomeFutureIcon")).toBe(hueForIconName("SomeFutureIcon"));
    expect(hueForIcon(<img alt="" src="logo.svg" />)).toBeNull();
    expect(hueForIcon("text")).toBeNull();
  });

  test("DialogIcon colours its tile from the icon unless a tone is given", () => {
    const { container, rerender } = render(
      <DialogIcon>
        <KeyRound />
      </DialogIcon>,
    );
    const tile = () => container.firstElementChild as HTMLElement;
    for (const cls of HUE_TILE.amber.split(" ").slice(0, 3)) expect(tile()).toHaveClass(cls);

    rerender(
      <DialogIcon tone="danger">
        <Trash2 />
      </DialogIcon>,
    );
    expect(tile()).toHaveClass("text-rose-600");

    rerender(
      <DialogIcon tone="teal">
        <KeyRound />
      </DialogIcon>,
    );
    expect(tile()).toHaveClass("text-teal-600");

    // 厂商 logo 自带品牌色：底块保持中性。
    rerender(
      <DialogIcon>
        <img alt="" src="logo.svg" />
      </DialogIcon>,
    );
    expect(tile()).toHaveClass("bg-surface");
  });
});

describe("brand badges", () => {
  test("plan badges carry the vendor colours and say which tier they are", () => {
    render(
      <>
        <PlanBadge vendor="codex" tier="ultra">
          PRO 20X
        </PlanBadge>
        <PlanBadge vendor="claude" tier="entry">
          PLUS
        </PlanBadge>
        <PlanBadge vendor="some-unknown-vendor" tier="pro">
          PRO
        </PlanBadge>
      </>,
    );
    const codex = screen.getByText("PRO 20X").closest("[data-plan-tier]") as HTMLElement;
    expect(codex).toHaveAttribute("data-plan-tier", "ultra");
    expect(codex.style.getPropertyValue("--brand-l")).toBe("#3941ff");
    expect(codex).toHaveClass("brand-badge-shine");

    const claude = screen.getByText("PLUS").closest("[data-plan-tier]") as HTMLElement;
    expect(claude.style.getPropertyValue("--brand-l")).toBe("#d97757");

    // 没有登记品牌色的厂商不设变量，样式回落到墨色。
    const unknown = screen.getByText("PRO").closest("[data-plan-tier]") as HTMLElement;
    expect(unknown.style.getPropertyValue("--brand-l")).toBe("");
  });

  test("provider tags use the brand of the longest matching vendor prefix", () => {
    render(<ProviderTag vendor="gemini-cli">gemini-cli</ProviderTag>);
    expect(screen.getByText("gemini-cli").style.getPropertyValue("--brand-l")).toBe("#3186ff");
  });
});

describe("chart colour helpers", () => {
  test("withAlpha turns hex into rgba and leaves other formats alone", () => {
    expect(withAlpha("#6366f1", 0.5)).toBe("rgba(99, 102, 241, 0.5)");
    expect(withAlpha("#fff", 1)).toBe("rgba(255, 255, 255, 1)");
    expect(withAlpha("rgba(0,0,0,0.1)", 0.5)).toBe("rgba(0,0,0,0.1)");
  });

  test("chartGradient fades the same colour top to bottom", () => {
    const gradient = chartGradient("#10b981", 0.3, 0);
    expect(gradient).toMatchObject({ type: "linear", x2: 0, y2: 1 });
    expect(gradient.colorStops.map((stop) => stop.color)).toEqual([
      "rgba(16, 185, 129, 0.3)",
      "rgba(16, 185, 129, 0)",
    ]);
  });
});
