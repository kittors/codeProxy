import type { CSSProperties, ReactNode } from "react";
import { Crown, Zap } from "lucide-react";
import { vendorBrand, vendorBrandStyle, VendorIcon } from "@code-proxy/assets";
import { cn } from "../utils/selectStyles";

/** 与 domain 的 PlanTier 同一组取值（ui 包不依赖 domain，这里单独声明）。 */
export type PlanBadgeTier = "free" | "entry" | "pro" | "max" | "ultra";

/**
 * 当前主题下的品牌变量，深浅色由 `dark:` 选出对应的一组；没有登记品牌色的厂商回落到墨色（中性）：
 * - `--brand` / `--brand-2`：品牌主色与第二色（深色界面里是亮一档的版本），用于描边、淡底的色源；
 * - `--brand-text`：淡底上的品牌色文字，深浅两套都在最深一档淡底上 ≥ 4.5:1。淡底上的字一律用它，
 *   不要拿 `--brand` / `--brand-fill` 当字色——它们在淡底上多数只有 3–4:1（见 vendorBrands 的说明）；
 * - `--brand-fill` / `--brand-fill-2`：实色与渐变底，白字对比度 ≥ 4.5:1；
 * - `--brand-on`：实色底上的文字色。
 */
const BRAND_VARS = [
  "[--brand:var(--brand-l,var(--color-ink))] dark:[--brand:var(--brand-d,var(--color-ink))]",
  "[--brand-2:var(--brand-2-l,var(--color-ink-3))] dark:[--brand-2:var(--brand-2-d,var(--color-ink-3))]",
  "[--brand-text:var(--brand-text-l,var(--color-ink))] dark:[--brand-text:var(--brand-text-d,var(--color-ink))]",
  "[--brand-fill:var(--brand-fill-l,var(--color-ink))] dark:[--brand-fill:var(--brand-fill-d,var(--color-ink))]",
  "[--brand-fill-2:var(--brand-fill-2-l,var(--color-ink-2))] dark:[--brand-fill-2:var(--brand-fill-2-d,var(--color-ink-2))]",
  "[--brand-on:var(--brand-on-l,var(--color-canvas))] dark:[--brand-on:var(--brand-on-d,var(--color-canvas))]",
].join(" ");

const brandStyle = (vendor: string | null | undefined, style?: CSSProperties): CSSProperties => {
  const colors = vendorBrand(vendor);
  return { ...(colors ? vendorBrandStyle(colors) : {}), ...style } as CSSProperties;
};

/**
 * 会员等级的样式：颜色来自厂商品牌色，等级只靠「填充有多重」和小图标区分——
 * - free：极淡的品牌底、偏灰的字；
 * - entry：品牌淡底 + 品牌色字；
 * - pro：品牌实色；
 * - max：品牌实色 + 闪电；
 * - ultra：品牌实色 + 皇冠。
 *
 * 以前高阶档是渐变 + 外发光 + 描边 + 循环流光，一张卡片上它是最抢眼的东西，比账号状态还
 * 显眼；全站收敛到「一个强调色 + 状态色」之后，徽章保留品牌色但去掉这些装饰，一张卡里
 * 只有它一块实色，仍然一眼看得出档位。
 */
const TIER_CLASS: Record<PlanBadgeTier, string> = {
  free: "bg-[color-mix(in_oklab,var(--brand)_7%,transparent)] text-[color-mix(in_oklab,var(--brand-text)_70%,var(--color-ink-2))] dark:bg-[color-mix(in_oklab,var(--brand)_12%,transparent)]",
  entry:
    "bg-[color-mix(in_oklab,var(--brand)_13%,transparent)] text-[var(--brand-text)] dark:bg-[color-mix(in_oklab,var(--brand)_18%,transparent)]",
  pro: "bg-[var(--brand-fill)] text-[var(--brand-on)]",
  max: "bg-[var(--brand-fill)] text-[var(--brand-on)]",
  ultra: "bg-[var(--brand-fill)] text-[var(--brand-on)]",
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
 * 供应商标签（codex、claude、gemini-cli……）：中性淡底 + 厂商 logo。
 *
 * 认厂商靠 logo（它本身就是品牌色），胶囊不再整块染成品牌色：一张账号卡上供应商标签、
 * 会员徽章、用量标签各染一种颜色，正是「色太杂」的来源。没有 logo 的厂商只显示名字。
 */
export function ProviderTag({
  vendor,
  children,
  withLogo = true,
  className,
  ...rest
}: {
  vendor: string | null | undefined;
  children: ReactNode;
  /** 在文字前放厂商 logo；极密的列表可以关掉，只留名字。 */
  withLogo?: boolean;
  className?: string;
} & Omit<React.HTMLAttributes<HTMLSpanElement>, "children" | "className">) {
  return (
    <span
      {...rest}
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-md bg-ink/[0.05] px-1.5 py-px text-2xs font-medium whitespace-nowrap text-ink-2 dark:bg-white/[0.07]",
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
