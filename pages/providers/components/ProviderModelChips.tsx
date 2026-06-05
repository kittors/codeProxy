import type { ProviderModel } from "@code-proxy/api-client";

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

  const visible = models.slice(0, maxVisible);
  const remaining = models.length - maxVisible;

  return (
    <div className="flex flex-wrap gap-1">
      {visible.map((model) => {
        const modelLabel =
          model.alias && model.alias !== model.name ? `${model.name} → ${model.alias}` : model.name;
        return (
          <span
            key={model.name}
            className="inline-flex max-w-full min-w-0 rounded-full bg-slate-900 px-2 py-0.5 text-[11px] text-white dark:bg-white dark:text-neutral-950"
            title={
              model.alias && model.alias !== model.name
                ? `${model.name} => ${model.alias}`
                : model.name
            }
          >
            <span className="min-w-0 truncate">{modelLabel}</span>
          </span>
        );
      })}
      {remaining > 0 ? (
        <span
          className="inline-flex max-w-full min-w-0 cursor-default rounded-full bg-slate-200 px-2 py-0.5 text-[11px] text-slate-500 dark:bg-neutral-800 dark:text-white/55"
          title={models
            .slice(maxVisible)
            .map((m) => m.name)
            .join(", ")}
        >
          +{remaining}
        </span>
      ) : null}
    </div>
  );
}
