import { render, screen } from "@testing-library/react";
import { KeyRound, Trash2 } from "lucide-react";
import { describe, expect, test } from "vitest";
import { PlanBadge, ProviderTag } from "../../brand/BrandBadges";
import { chartGradient, withAlpha } from "../../charts/chartTheme";
import { DialogIcon } from "../../overlays/DialogIcon";
import { hueHex, isHue } from "../hues";

describe("icon tiles", () => {
  test("tiles are neutral at base and take the icon's hue only through the icon-hue variant", () => {
    const { container, rerender } = render(
      <DialogIcon>
        <KeyRound />
      </DialogIcon>,
    );
    const tile = () => container.firstElementChild as HTMLElement;
    // 单色图标（基础类）：一层中性淡底；多彩图标（icon-hue: 变体）：按图标取色相的渐变块，
    // 钥匙是琥珀。两套类名都在元素上，由 <html data-icons> 决定哪套生效。
    expect(tile()).toHaveClass("text-ink-2", "icon-hue:bg-gradient-to-b", "icon-hue:text-amber-600");
    // 不描边：盒子的边一律用阴影表达。
    expect(tile().className).not.toMatch(/(^|\s)border(\s|$)|border-/);

    rerender(
      <DialogIcon tone="danger">
        <Trash2 />
      </DialogIcon>,
    );
    // 语义色调两种风格都带颜色，多彩时再叠同色渐变。
    expect(tile()).toHaveClass("text-rose-600", "icon-hue:from-rose-500/[0.13]");

    rerender(
      <DialogIcon tone="violet">
        <KeyRound />
      </DialogIcon>,
    );
    expect(tile()).toHaveClass("text-ink-2", "icon-hue:text-violet-600");

    // 明确要中性、或内容不是 lucide 图标（厂商 logo 自带品牌色）时，不叠任何色相。
    for (const node of [
      <DialogIcon key="neutral" tone="neutral">
        <KeyRound />
      </DialogIcon>,
      <DialogIcon key="logo">
        <img alt="" src="data:," />
      </DialogIcon>,
    ]) {
      rerender(node);
      expect(tile()).toHaveClass("text-ink-2");
      expect(tile().className).not.toContain("icon-hue:");
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
  test("plan badges carry the vendor colours, and the flagship tiers glow only in the colourful palette", () => {
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
    // 旗舰档：简约风格是品牌实色 + 皇冠；多彩风格叠双向渐变与光晕，流光由 brandBadges.css
    // 只在 data-palette="colorful" 下播放。
    expect(codex).toHaveClass("bg-[var(--brand-fill)]", "brand-badge-shine");
    expect(codex.className).toContain("colorful:bg-[linear-gradient(115deg");
    expect(codex.className).not.toMatch(/(^|\s)bg-\[linear-gradient/);
    expect(codex.querySelector("svg.lucide-crown")).not.toBeNull();

    const claude = screen.getByText("PLUS").closest("[data-plan-tier]") as HTMLElement;
    expect(claude.style.getPropertyValue("--brand-l")).toBe("#d97757");

    // 没有登记品牌色的厂商不设变量，样式回落到墨色。
    const unknown = screen.getByText("PRO").closest("[data-plan-tier]") as HTMLElement;
    expect(unknown.style.getPropertyValue("--brand-l")).toBe("");
  });

  test("provider tags are neutral chips that take the brand tint in the colourful palette", () => {
    render(<ProviderTag vendor="claude">claude</ProviderTag>);
    const tag = screen.getByText("claude");
    expect(tag).toHaveClass("text-ink-2", "colorful:text-[var(--brand-text)]");
    expect(tag.style.getPropertyValue("--brand-l")).toBe("#d97757");
    // logo 默认不画：只放图标的紧凑卡片会把 VendorIcon 当内容传进来，再画一个就成了两个。
    expect(tag.querySelector("img, svg")).toBeNull();
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
