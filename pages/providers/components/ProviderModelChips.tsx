import type { ProviderModel } from "@code-proxy/api-client";
import { HoverTooltip } from "@code-proxy/ui";

interface ProviderModelChipsProps {
  models: ProviderModel[];
  maxVisible?: number;
  emptyLabel?: string;
}

export function ProviderModelChips({
  models,
  maxVisible = 6,
  emptyLabel,
}: ProviderModelChipsProps) {
  if (!models.length) {
    return emptyLabel ? (
      <span className="text-xs text-slate-400 dark:text-white/40">{emptyLabel}</span>
    ) : null;
  }

  const visibleLimit = models.length > maxVisible ? Math.max(1, maxVisible - 1) : maxVisible;
  const visible = models.slice(0, visibleLimit);
  const remaining = models.length - visibleLimit;
  const formatModelLabel = (model: ProviderModel, arrow: string) => {
    const name = model.name ?? "";
    return model.alias && model.alias !== name ? `${name} ${arrow} ${model.alias}` : name;
  };

  return (
    <div className="grid max-h-[3.25rem] grid-cols-3 gap-1 overflow-hidden">
      {visible.map((model) => {
        const modelLabel = formatModelLabel(model, "→");
        return (
          <HoverTooltip
            key={model.name}
            content={formatModelLabel(model, "=>")}
            placement="top"
            className="min-w-0"
          >
            <span className="inline-flex w-full min-w-0 cursor-default rounded-full bg-slate-900 px-2 py-0.5 text-[11px] text-white dark:bg-white dark:text-neutral-950">
              <span className="min-w-0 truncate">{modelLabel}</span>
            </span>
          </HoverTooltip>
        );
      })}
      {remaining > 0 ? (
        <HoverTooltip
          content={models
            .slice(visibleLimit)
            .map((model) => formatModelLabel(model, "=>"))
            .join("\n")}
          placement="top"
          className="min-w-0"
        >
          <span className="inline-flex min-w-0 cursor-default justify-center rounded-full bg-slate-200 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-slate-500 dark:bg-neutral-800 dark:text-white/55">
            +{remaining}
          </span>
        </HoverTooltip>
      ) : null}
    </div>
  );
}
