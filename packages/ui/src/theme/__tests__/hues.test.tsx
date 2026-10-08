import { render, screen } from "@testing-library/react";
import { KeyRound, Trash2 } from "lucide-react";
import { describe, expect, test } from "vitest";
import { PlanBadge, ProviderTag } from "../../brand/BrandBadges";
import { chartGradient, withAlpha } from "../../charts/chartTheme";
import { DialogIcon } from "../../overlays/DialogIcon";
import { hueHex, isHue } from "../hues";

describe("icon tiles", () => {
  test("only semantic tones carry colour; everything else is the neutral tile", () => {
    const { container, rerender } = render(
      <DialogIcon>
        <KeyRound />
      </DialogIcon>,
    );
    const tile = () => container.firstElementChild as HTMLElement;
    expect(tile()).toHaveClass("text-ink-2");
    // 不描边、不渐变：图标块只有一层淡底。
    expect(tile().className).not.toMatch(/\bborder\b|gradient/);

    rerender(
      <DialogIcon tone="danger">
        <Trash2 />
      </DialogIcon>,
    );
    expect(tile()).toHaveClass("text-rose-600");

    // 旧的「自动取色」和色相名都落到中性，不再按图标名上色。
    for (const tone of ["auto", "teal", "violet"] as const) {
      rerender(
        <DialogIcon tone={tone}>
          <KeyRound />
        </DialogIcon>,
      );
      expect(tile()).toHaveClass("text-ink-2");
    }
  });
});

describe("chart hues", () => {
  test("data series colours brighten one step on dark backgrounds", () => {
    expect(isHue("emerald")).toBe(true);
    expect(isHue("grey")).toBe(false);
    expect(hueHex("emerald", false)).toBe("#10b981");
    expect(hueHex("emerald", true)).toBe("#34d399");
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
    // 旗舰档：品牌实色 + 皇冠，不再叠渐变、外发光和循环流光。
    expect(codex).toHaveClass("bg-[var(--brand-fill)]");
    expect(codex.className).not.toMatch(/gradient|shine|ring-/);
    expect(codex.querySelector("svg.lucide-crown")).not.toBeNull();

    const claude = screen.getByText("PLUS").closest("[data-plan-tier]") as HTMLElement;
    expect(claude.style.getPropertyValue("--brand-l")).toBe("#d97757");

    // 没有登记品牌色的厂商不设变量，样式回落到墨色。
    const unknown = screen.getByText("PRO").closest("[data-plan-tier]") as HTMLElement;
    expect(unknown.style.getPropertyValue("--brand-l")).toBe("");
  });

  test("provider tags are neutral chips; the vendor logo carries the brand", () => {
    render(<ProviderTag vendor="gemini-cli">gemini-cli</ProviderTag>);
    const tag = screen.getByText("gemini-cli");
    expect(tag).toHaveClass("text-ink-2");
    expect(tag.style.getPropertyValue("--brand-l")).toBe("");
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
