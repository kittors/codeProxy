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
      <span className="text-xs text-slate-400 dark:text-white/40">
        {emptyLabel}
      </span>
    ) : null;
  }

  const visible = models.slice(0, maxVisible);
  const remaining = models.length - maxVisible;
  const formatModelLabel = (model: ProviderModel, arrow: string) => {
    const name = model.name ?? "";
    return model.alias && model.alias !== name
      ? `${name} ${arrow} ${model.alias}`
      : name;
  };

  return (
    <div className="flex flex-wrap gap-1">
      {visible.map((model) => {
        const modelLabel = formatModelLabel(model, "→");
        return (
          <span
            key={model.name}
            className="inline-flex max-w-full min-w-0 rounded-full bg-slate-900 px-2 py-0.5 text-[11px] text-white dark:bg-white dark:text-neutral-950"
            title={formatModelLabel(model, "=>")}
          >
            <span className="min-w-0 truncate">{modelLabel}</span>
          </span>
        );
      })}
      {remaining > 0 ? (
        <HoverTooltip
          content={models
            .slice(maxVisible)
            .map((model) => formatModelLabel(model, "=>"))
            .join("\n")}
          placement="top"
        >
          <span className="inline-flex max-w-full min-w-0 cursor-default rounded-full bg-slate-200 px-2 py-0.5 text-[11px] text-slate-500 dark:bg-neutral-800 dark:text-white/55">
            +{remaining}
          </span>
        </HoverTooltip>
      ) : null}
    </div>
  );
}
