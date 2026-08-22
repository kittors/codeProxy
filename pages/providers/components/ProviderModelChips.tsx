import type { ProviderModel } from "@code-proxy/api-client";
import { HoverTooltip, OverflowTooltip } from "@code-proxy/ui";

interface ProviderModelChipsProps {
  models: ProviderModel[];
  maxVisible?: number;
  emptyLabel?: string;
}

export function ProviderModelChips({
  models,
  maxVisible = 4,
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

  // Same flat, squared, 2xs badge as the metric chips and the AI account card.
  //
  // Chips are sized by their text, not by an equal-width track. On a 3-column
  // grid every chip was as wide as a third of the card, so "gpt-5.2" sat in a
  // box with more empty space than label and the "+3" count was stretched to
  // match. One row: names shrink and truncate to share it, the count never
  // does, and the full list stays in the tooltip.
  return (
    <div className="flex max-h-5 items-center gap-1 overflow-hidden">
      {visible.map((model) => {
        const modelLabel = formatModelLabel(model, "→");
        return (
          // Overflow-only: a chip that fits needs no tooltip, since it would
          // just repeat the mapping already on screen.
          <OverflowTooltip
            key={model.name}
            content={formatModelLabel(model, "=>")}
            placement="top"
            className="min-w-0"
          >
            <span className="inline-flex h-5 min-w-0 max-w-full cursor-default items-center rounded-md bg-slate-100 px-1.5 text-2xs font-semibold leading-none text-slate-700 dark:bg-white/10 dark:text-white/70">
              <span className="min-w-0 truncate">{modelLabel}</span>
            </span>
          </OverflowTooltip>
        );
      })}
      {remaining > 0 ? (
        <HoverTooltip
          content={models
            .slice(visibleLimit)
            .map((model) => formatModelLabel(model, "=>"))
            .join("\n")}
          placement="top"
          className="shrink-0"
        >
          <span className="inline-flex h-5 shrink-0 cursor-default items-center rounded-md bg-slate-100 px-1.5 text-2xs font-semibold leading-none tabular-nums text-slate-500 dark:bg-white/10 dark:text-white/55">
            +{remaining}
          </span>
        </HoverTooltip>
      ) : null}
    </div>
  );
}
