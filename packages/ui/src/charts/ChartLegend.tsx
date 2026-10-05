export interface ChartLegendItem {
  key: string;
  label: string;
  colorClass?: string;
  colorHex?: string;
  enabled: boolean;
  onToggle: (key: string) => void;
}

export function ChartLegend({
  items,
  className,
}: {
  items: ChartLegendItem[];
  className?: string;
}) {
  return (
    <div
      className={["flex flex-wrap items-center justify-center gap-2", className]
        .filter(Boolean)
        .join(" ")}
    >
      {items.map((item) => (
        <button
          key={item.key}
          type="button"
          aria-pressed={item.enabled}
          onClick={() => item.onToggle(item.key)}
          className={[
            "inline-flex cursor-pointer items-center gap-2 rounded-full px-3 py-1 text-xs font-medium transition-colors hover:bg-hover",
            // 关闭的序列整体压淡（色点一起），并划线，表示「已从图上隐藏」。
            item.enabled ? "text-ink-2" : "text-ink-3 line-through opacity-50",
          ].join(" ")}
        >
          <span
            className={[
              "h-2.5 w-2.5 rounded-full ring-1 ring-black/5 dark:ring-white/10",
              item.colorClass,
            ]
              .filter(Boolean)
              .join(" ")}
            style={item.colorHex ? { backgroundColor: item.colorHex } : undefined}
          />
          {item.label}
        </button>
      ))}
    </div>
  );
}
