import type { ProviderModel } from "@code-proxy/api-client";
import { HoverTooltip, OverflowTooltip } from "@code-proxy/ui";

interface ProviderModelChipsProps {
  models: ProviderModel[];
  maxVisible?: number;
  emptyLabel?: string;
}

export function ProviderModelChips({
  models,
  maxVisible = 3,
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
  // The old inverted pill (black on white) was the loudest thing on the card
  // and made a row of model names read as a warning.
  //
  // Capped at one row: a second row of chips only appeared on the channels with
  // the most models, and because a grid row levels every card in it, those cards
  // pushed their whole row taller for a list nobody reads chip by chip. The
  // overflow count carries the rest, with the full list in its tooltip.
  return (
    <div className="grid max-h-5 grid-cols-3 gap-1 overflow-hidden">
      {visible.map((model) => {
        const modelLabel = formatModelLabel(model, "→");
        return (
          // Overflow-only: the chip is often truncated by the 3-column grid, but when
          // it fits, a tooltip would just repeat the mapping already on screen.
          <OverflowTooltip
            key={model.name}
            content={formatModelLabel(model, "=>")}
            placement="top"
            className="min-w-0"
          >
            <span className="inline-flex h-5 w-full min-w-0 cursor-default items-center rounded-md bg-slate-100 px-1.5 text-2xs font-semibold leading-none text-slate-700 dark:bg-white/10 dark:text-white/70">
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
          className="min-w-0"
        >
          <span className="inline-flex h-5 min-w-0 cursor-default items-center justify-center rounded-md bg-slate-100 px-1.5 text-2xs font-semibold leading-none tabular-nums text-slate-500 dark:bg-white/10 dark:text-white/55">
            +{remaining}
          </span>
        </HoverTooltip>
      ) : null}
    </div>
  );
}
