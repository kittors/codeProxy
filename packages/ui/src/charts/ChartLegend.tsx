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
      className={["flex flex-wrap items-center justify-center gap-1.5", className]
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
            "sn-btn sn-ghost sn-xs sn-round !h-7 !px-2.5 !text-xs",
            item.enabled
              ? "text-[var(--sn-label2)]"
              : "text-[var(--sn-label3)] line-through opacity-50",
          ].join(" ")}
        >
          <span
            className={[
              "h-2 w-2 rounded-full ring-1 ring-black/5 dark:ring-white/10",
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
