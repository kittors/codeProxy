import type { CSSProperties, ReactNode } from "react";
import { Crown, Zap } from "lucide-react";
import { vendorBrand, vendorBrandStyle, VendorIcon } from "@code-proxy/assets";
import { cn } from "../utils/selectStyles";
import "./brandBadges.css";

/** 与 domain 的 PlanTier 同一组取值（ui 包不依赖 domain，这里单独声明）。 */
export type PlanBadgeTier = "free" | "entry" | "pro" | "max" | "ultra";

/**
 * 当前主题下的品牌变量，深浅色由 `dark:` 选出对应的一组；没有登记品牌色的厂商回落到墨色（中性）：
 * - `--brand` / `--brand-2`：品牌主色与第二色（深色界面里是亮一档的版本），用于描边、淡底、深色下的文字；
 * - `--brand-fill` / `--brand-fill-2`：实色与渐变底，白字对比度 ≥ 4.5:1；浅色界面的品牌文字也用它；
 * - `--brand-on`：实色底上的文字色。
 */
const BRAND_VARS = [
  "[--brand:var(--brand-l,var(--color-ink))] dark:[--brand:var(--brand-d,var(--color-ink))]",
  "[--brand-2:var(--brand-2-l,var(--color-ink-3))] dark:[--brand-2:var(--brand-2-d,var(--color-ink-3))]",
  "[--brand-fill:var(--brand-fill-l,var(--color-ink))] dark:[--brand-fill:var(--brand-fill-d,var(--color-ink))]",
  "[--brand-fill-2:var(--brand-fill-2-l,var(--color-ink-2))] dark:[--brand-fill-2:var(--brand-fill-2-d,var(--color-ink-2))]",
  "[--brand-on:var(--brand-on-l,var(--color-canvas))] dark:[--brand-on:var(--brand-on-d,var(--color-canvas))]",
].join(" ");

const brandStyle = (vendor: string | null | undefined, style?: CSSProperties): CSSProperties => {
  const colors = vendorBrand(vendor);
  return { ...(colors ? vendorBrandStyle(colors) : {}), ...style } as CSSProperties;
};

/**
 * 会员等级的样式，由低到高越来越「隆重」，颜色都来自厂商品牌色：
 * - free：品牌色细描边，字色偏淡；
 * - entry：品牌色淡底；
 * - pro：品牌实色；
 * - max：品牌主色到辅色的渐变 + 闪电；
 * - ultra：辅色—主色—辅色的双向渐变 + 皇冠 + 光晕 + 流光。
 */
const TIER_CLASS: Record<PlanBadgeTier, string> = {
  free: "text-[color-mix(in_oklab,var(--brand-fill)_72%,var(--color-ink-2))] ring-1 ring-inset ring-[color-mix(in_oklab,var(--brand)_32%,transparent)] dark:text-[color-mix(in_oklab,var(--brand)_75%,var(--color-ink-2))]",
  entry:
    "bg-[color-mix(in_oklab,var(--brand)_13%,transparent)] text-[var(--brand-fill)] ring-1 ring-inset ring-[color-mix(in_oklab,var(--brand)_24%,transparent)] dark:bg-[color-mix(in_oklab,var(--brand)_18%,transparent)] dark:text-[var(--brand)]",
  pro: "bg-[var(--brand-fill)] text-[var(--brand-on)] shadow-[inset_0_1px_0_rgb(255_255_255/0.2)]",
  max: "bg-[linear-gradient(120deg,var(--brand-fill),var(--brand-fill-2))] text-[var(--brand-on)] shadow-[inset_0_1px_0_rgb(255_255_255/0.22),0_2px_8px_-3px_color-mix(in_oklab,var(--brand)_70%,transparent)]",
  ultra:
    "brand-badge-shine bg-[linear-gradient(115deg,var(--brand-fill-2),var(--brand-fill)_48%,var(--brand-fill-2))] text-[var(--brand-on)] ring-1 ring-inset ring-white/25 shadow-[inset_0_1px_0_rgb(255_255_255/0.28),0_3px_12px_-3px_color-mix(in_oklab,var(--brand)_80%,transparent)]",
};

/**
 * 会员徽章（PRO 20X、MAX 5X、PLUS……）：厂商品牌色 × 等级档位。
 * 同一档在不同厂商之间颜色不同（Codex 蓝紫、Claude 珊瑚橙、Gemini 蓝……），同一厂商的不同档
 * 一眼分得出高低；文字仍写明套餐名，颜色只是帮助扫读。
 */
export function PlanBadge({
  vendor,
  tier,
  children,
  className,
  ...rest
}: {
  /** 厂商或供应商类型（codex、claude、gemini-cli、xai……），决定品牌色。 */
  vendor: string | null | undefined;
  tier: PlanBadgeTier;
  children: ReactNode;
  className?: string;
} & Omit<React.HTMLAttributes<HTMLSpanElement>, "children" | "className">) {
  const icon =
    tier === "ultra" ? (
      <Crown size={10} strokeWidth={2.4} aria-hidden="true" className="relative shrink-0" />
    ) : tier === "max" ? (
      <Zap size={10} strokeWidth={2.4} aria-hidden="true" className="relative shrink-0" />
    ) : null;
  return (
    <span
      {...rest}
      data-plan-tier={tier}
      style={brandStyle(vendor, rest.style)}
      className={cn(
        BRAND_VARS,
        "relative inline-flex shrink-0 items-center gap-1 overflow-hidden rounded-md px-1.5 py-px text-2xs font-bold tracking-wide whitespace-nowrap uppercase",
        TIER_CLASS[tier],
        className,
      )}
    >
      {icon}
      <span className="relative">{children}</span>
    </span>
  );
}

/**
 * 供应商标签（codex、claude、gemini-cli……）：品牌色淡底 + 品牌色文字，可带一个小 logo。
 * 以前所有供应商同一个灰色胶囊，扫一眼分不出是谁家的号。
 */
export function ProviderTag({
  vendor,
  children,
  withLogo = false,
  className,
  ...rest
}: {
  vendor: string | null | undefined;
  children: ReactNode;
  /** 在文字前放厂商 logo（列表很密时可以只用颜色）。 */
  withLogo?: boolean;
  className?: string;
} & Omit<React.HTMLAttributes<HTMLSpanElement>, "children" | "className">) {
  return (
    <span
      {...rest}
      style={brandStyle(vendor, rest.style)}
      className={cn(
        BRAND_VARS,
        "inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-px text-2xs font-medium whitespace-nowrap",
        "bg-[color-mix(in_oklab,var(--brand)_11%,transparent)] text-[var(--brand-fill)] dark:bg-[color-mix(in_oklab,var(--brand)_18%,transparent)] dark:text-[var(--brand)]",
        className,
      )}
    >
      {withLogo && vendor ? (
        // 没有 logo 的厂商 VendorIcon 什么也不渲染：空的这层要收起，不然多出一截间距。
        <span className="inline-flex shrink-0 items-center empty:hidden" aria-hidden="true">
          <VendorIcon modelId={vendor} size={11} />
        </span>
      ) : null}
      {children}
    </span>
  );
}

/** 供应商品牌色的 CSS 变量与类名，给需要自定义外观的地方（卡片强调条、进度条……）复用。 */
export function brandVars(vendor: string | null | undefined): {
  className: string;
  style: CSSProperties;
} {
  return { className: BRAND_VARS, style: brandStyle(vendor) };
}
