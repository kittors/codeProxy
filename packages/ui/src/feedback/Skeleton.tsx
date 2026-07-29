/**
 * 骨架屏占位。
 *
 * 相比转圈 spinner，骨架屏能提前把版面撑开，内容到位时不会整页跳动——
 * 这对表格、卡片这类高度可预测的区域是更好的等待反馈。
 *
 * 微光扫过用 CSS 动画（`skeleton-sweep`），不进 JS 主线程；
 * prefers-reduced-motion 下退化为静态底色，仍然保留占位作用。
 */
export function Skeleton({
  className,
  rounded = "md",
}: {
  className?: string;
  rounded?: "sm" | "md" | "lg" | "full";
}) {
  const roundedClass = {
    sm: "rounded-sm",
    md: "rounded-lg",
    lg: "rounded-2xl",
    full: "rounded-full",
  }[rounded];

  return (
    <span
      aria-hidden
      className={[
        "block bg-slate-200/70 dark:bg-white/[0.07]",
        "motion-safe:animate-[skeleton-sweep_1.6s_ease-in-out_infinite]",
        roundedClass,
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    />
  );
}

/** 表格/列表的多行骨架。行宽递减，读起来更像真实文本块而不是一排等长灰条。 */
export function SkeletonLines({ rows = 3, className }: { rows?: number; className?: string }) {
  const widths = ["w-full", "w-11/12", "w-9/12", "w-10/12", "w-8/12"];
  return (
    <div className={["space-y-2.5", className].filter(Boolean).join(" ")} role="presentation">
      {Array.from({ length: rows }, (_, index) => (
        <Skeleton key={index} className={`h-3.5 ${widths[index % widths.length]}`} />
      ))}
    </div>
  );
}
