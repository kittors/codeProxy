/**
 * 基于 Satin `.sn-sk` 的骨架屏占位：
 * 整列共用一道视口级微光扫过（纯 CSS，1.6s 节奏），尊重 prefers-reduced-motion。
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

  return <span aria-hidden className={["sn-sk", roundedClass, className].filter(Boolean).join(" ")} />;
}

/** 表格/列表的多行骨架。行宽递减，更贴近真实文本块节奏。 */
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
