import "./FloatingPanel.css";
import {
  controlHeightBySize,
  controlMultilineSurfaceTrigger,
  controlPaddingBySize,
  controlSurfaceTrigger,
  controlTextBySize,
  type ControlSize,
} from "../utils/controlStyles";

export const cn = (...classes: (string | false | undefined | null)[]) =>
  classes.filter(Boolean).join(" ");

export const getSelectTriggerBase = (
  size: ControlSize = "default",
  shape: "pill" | "multiline" = "pill",
) =>
  [
    "inline-flex min-w-0 items-center justify-between gap-1.5 font-medium",
    controlHeightBySize[size],
    controlTextBySize[size],
    controlPaddingBySize[size],
    shape === "multiline" ? controlMultilineSurfaceTrigger : controlSurfaceTrigger,
  ].join(" ");

export const selectTriggerBase = getSelectTriggerBase();

/**
 * 触发器的展开/禁用态不再由组件条件拼接类名，改由 `data-state` 与原生 `disabled`
 * 属性驱动（见 controlSurfaceTrigger）。每个下拉触发器只需带上这个属性即可。
 */
export const selectTriggerState = (open: boolean) => (open ? "open" : "closed");

/** 紧凑型触发器（分页条的每页条数等）：小号胶囊，白底细描边，和默认按钮同一套轮廓。 */
export const selectTriggerChip = [
  "inline-flex h-7 items-center justify-center gap-1.5 rounded-full border border-line-strong bg-surface px-2.5",
  "text-xs font-medium text-ink-2 shadow-xs outline-none transition-colors duration-150 ease-soft",
  "hover:bg-hover hover:text-ink data-[state=open]:text-ink",
  "disabled:cursor-not-allowed disabled:text-ink-4 disabled:shadow-none disabled:hover:bg-surface disabled:hover:text-ink-4",
  "dark:shadow-none",
].join(" ");

/** 幽灵触发器（顶栏里的切换租户）：无边框无底色，悬停与展开共用同一层浅灰。 */
export const selectTriggerGhost = [
  "inline-flex h-9 min-w-0 items-center justify-between gap-1.5 rounded-full border-0 bg-transparent px-3",
  "text-sm font-medium text-ink-2 outline-none transition-colors duration-150 ease-soft",
  "hover:bg-hover hover:text-ink data-[state=open]:bg-hover data-[state=open]:text-ink",
  "disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent",
].join(" ");

export const selectChevron =
  "ml-auto shrink-0 text-ink-3 transition-transform duration-200 ease-soft";

/**
 * 所有浮层（下拉、菜单、日期面板）共用的表面：16px 圆角、实心底、一层很轻的投影。
 * 不再画 border——shadow-pop 里第一层 0.5px 的描边阴影负责轮廓，深浅色各自一套。
 */
export const floatingPanelSurface =
  "code-proxy-floating-surface rounded-2xl bg-elevated text-ink shadow-pop";

export const selectPanel = `fixed z-[9999] overflow-hidden p-1.5 ${floatingPanelSurface}`;

export const searchableSelectPanel = `fixed z-[9999] flex flex-col overflow-hidden ${floatingPanelSurface}`;

export const selectSearchRow = "flex items-center gap-2 border-b border-line px-3.5 py-2.5";

export const selectSearchInput =
  "h-6 w-full bg-transparent text-sm text-ink outline-none placeholder:text-ink-3";

/** 选项：圆角行，悬停铺浅灰叠层；选中项不改底色，只在右侧放一个对勾。 */
export const selectOptionBase =
  "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm text-ink outline-none transition-colors duration-100 hover:bg-hover focus-visible:bg-hover";

export const selectOptionSelected = "font-medium text-ink";

export const selectOptionIdle = "text-ink";

/** 选中项右侧的对勾。 */
export const selectOptionCheck = "ml-auto shrink-0 text-ink";

/**
 * 多选列表里的方形勾选框：选中是实心强调色（深色模式反转），未选中只留一圈描边。
 * 未选中描边用 ink-3 而不是更浅的 ink-4，保证和白底之间有 3:1 的非文字对比度。
 */
export const selectCheckboxBox = (checked: boolean) =>
  cn(
    "flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors duration-100",
    checked ? "border-accent bg-accent text-accent-fg" : "border-ink-3",
  );

/** 浮层里的轻量文字操作（全选、清空、取消）：无底色，悬停才出现浅灰叠层。 */
export const selectTextAction =
  "rounded-full px-2.5 py-1 text-xs font-medium text-ink-2 transition-colors hover:bg-hover hover:text-ink disabled:cursor-not-allowed disabled:text-ink-4 disabled:hover:bg-transparent";

export const selectEmptyState = "px-2.5 py-3 text-center text-xs text-ink-3";

/**
 * 浮层进入：从触发器那条边轻微放大、滑出；退出更快、位移更小，让关闭显得干脆。
 * 曲线与 FloatingPanel.css 里 Radix 菜单的关键帧保持一致。
 *
 * 进入时刻意不从透明开始（#604 的修复）：选项一打开就要可见、可点，测试里打开后立刻
 * 断言 toBeVisible / 点击选项也依赖这一点。淡入只留给退出。
 * originY 让放大从贴着触发器的那条边开始，而不是从面板中心。
 */
export const getSelectDropdownMotion = (placement: "bottom" | "top" = "bottom") => {
  const offset = placement === "top" ? 4 : -4;
  const originY = placement === "top" ? 1 : 0;

  return {
    initial: { opacity: 1, scale: 0.96, y: offset, originY },
    animate: { opacity: 1, scale: 1, y: 0, originY },
    exit: { opacity: 0, scale: 0.98, y: offset / 2, originY, transition: { duration: 0.12 } },
  } as const;
};

export const selectDropdownTransition = {
  duration: 0.18,
  ease: [0.2, 0.8, 0.2, 1],
} as const;
