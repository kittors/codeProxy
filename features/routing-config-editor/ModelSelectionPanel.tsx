import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { X } from "lucide-react";
import { Button, COLUMN_WIDTH, surface } from "@code-proxy/ui";
import { Checkbox } from "@code-proxy/ui";
import { ToggleSwitch } from "@code-proxy/ui";
import { OverflowTooltip } from "@code-proxy/ui";
import { DataTable, type DataTableColumn } from "@code-proxy/ui";
import { VendorIcon } from "@code-proxy/assets";
import { emptyModelPricing, formatModelPrice } from "@features/model-availability";
import type { RoutingModelOption } from "./types";
import {
  clearAllModels,
  lockedModelRules,
  modelRulesOutsideList,
  removeModelRule,
  selectAllModels,
  selectedModelIds,
  setAutoAllowNewModels,
  toggleModelSelection,
  type ModelListName,
  type ModelSelectionDraft,
} from "./modelSelectionDraft";

export type ModelSelectionPanelProps = {
  selection: ModelSelectionDraft;
  modelOptions: RoutingModelOption[];
  modelsLoading: boolean;
  modelsError: string;
  /** The group matches no channel yet, so there is nothing to list. */
  needsChannels: boolean;
  disabled?: boolean;
  /** Applies one of the pure updates from modelSelectionDraft.ts to the group's draft. */
  onChange: (update: (current: ModelSelectionDraft) => ModelSelectionDraft) => void;
};

const NOTICE_CLASS =
  "rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-800 dark:border-amber-400/25 dark:bg-amber-500/10 dark:text-amber-200";

type RuleChip = { list: ModelListName; entry: string; tagKey: string };

export function ModelSelectionPanel({
  selection,
  modelOptions,
  modelsLoading,
  modelsError,
  needsChannels,
  disabled,
  onChange,
}: ModelSelectionPanelProps) {
  const { t } = useTranslation();
  const [confirmingAutoAllow, setConfirmingAutoAllow] = useState(false);

  const modelOptionIds = useMemo(() => modelOptions.map((model) => model.id), [modelOptions]);
  const selected = useMemo(
    () => selectedModelIds(selection, modelOptionIds),
    [modelOptionIds, selection],
  );
  const locked = useMemo(
    () => lockedModelRules(selection, modelOptionIds),
    [modelOptionIds, selection],
  );
  // What an entry "is not in the list" means is only known once a list loaded.
  const listReady = !needsChannels && !modelsLoading && !modelsError;
  const ruleChips = useMemo<RuleChip[]>(() => {
    const outside = modelRulesOutsideList(selection, modelOptionIds);
    return [
      ...outside.unlistedExclusions.map((entry) => ({
        list: "excluded" as const,
        entry,
        tagKey: "channel_groups_page.models_rule_excluded_unlisted",
      })),
      ...outside.wildcardExclusions.map((entry) => ({
        list: "excluded" as const,
        entry,
        tagKey: "channel_groups_page.models_rule_excluded_wildcard",
      })),
      ...outside.unlistedAllowed.map((entry) => ({
        list: "allowed" as const,
        entry,
        tagKey: "channel_groups_page.models_rule_allowed_unlisted",
      })),
    ];
  }, [modelOptionIds, selection]);

  const rowsDisabled = Boolean(disabled) || modelsLoading;
  const selectable = modelOptionIds.filter((id) => !locked.has(id));
  const selectedCount = selectable.filter((id) => selected.has(id)).length;
  const allSelected = selectable.length > 0 && selectedCount === selectable.length;
  const someSelected = selectedCount > 0 && !allSelected;
  // Flipping the switch rewrites the stored lists from the model list, so it
  // needs a loaded, non-empty one: an empty or failed list reads as "nothing
  // checked" and would store the group as blocking everything.
  const canSwitch =
    selection.exclusionsSupported && listReady && modelOptionIds.length > 0 && !disabled;
  const confirming = confirmingAutoAllow && canSwitch && !selection.autoAllowNewModels;
  const modeHintKey = !selection.exclusionsSupported
    ? "channel_groups_page.auto_allow_new_models_unsupported"
    : selection.autoAllowNewModels
      ? "channel_groups_page.auto_allow_new_models_on_hint"
      : "channel_groups_page.auto_allow_new_models_off_hint";

  const columns = useMemo<DataTableColumn<RoutingModelOption>[]>(
    () => [
      {
        key: "select",
        label: "",
        width: COLUMN_WIDTH.checkbox,
        headerClassName: "text-center",
        cellClassName: "text-center",
        headerRender: () => (
          <Checkbox
            checked={allSelected}
            indeterminate={someSelected}
            disabled={rowsDisabled || selectable.length === 0}
            onCheckedChange={(checked) =>
              onChange((current) =>
                checked
                  ? selectAllModels(current, modelOptionIds)
                  : clearAllModels(current, modelOptionIds),
              )
            }
            aria-label={t("channel_groups_page.allowed_models_label")}
          />
        ),
        render: (model) => {
          const rule = locked.get(model.id);
          return (
            <Checkbox
              checked={selected.has(model.id)}
              onCheckedChange={(checked) =>
                onChange((current) =>
                  toggleModelSelection(current, modelOptionIds, model.id, checked),
                )
              }
              disabled={rowsDisabled || Boolean(rule)}
              title={rule ? t("channel_groups_page.model_locked_by_rule", { rule }) : undefined}
              aria-label={model.id}
            />
          );
        },
      },
      {
        key: "model",
        label: t("models_page.col_model"),
        width: "w-[28rem]",
        minWidthPx: 220,
        maxWidthPx: 640,
        cellClassName: "min-w-0",
        render: (model) => (
          <div className="flex min-w-0 items-center gap-2">
            <VendorIcon modelId={model.id} size={16} />
            <div className="min-w-0">
              <OverflowTooltip content={model.id} className="block min-w-0">
                <span className="block min-w-0 truncate font-medium">{model.id}</span>
              </OverflowTooltip>
              {model.description ? (
                <OverflowTooltip content={model.description} className="block min-w-0">
                  <span className="block min-w-0 truncate text-xs text-slate-500 dark:text-white/45">
                    {model.description}
                  </span>
                </OverflowTooltip>
              ) : null}
            </div>
          </div>
        ),
      },
      {
        key: "owner",
        label: t("models_page.col_owner"),
        width: COLUMN_WIDTH.numericWide,
        minWidthPx: 120,
        maxWidthPx: 360,
        cellClassName: "min-w-0 whitespace-nowrap text-slate-600 dark:text-white/60",
        render: (model) => model.owned_by || "-",
        overflowTooltip: (model) => model.owned_by || "-",
      },
      {
        key: "price",
        label: t("models_page.col_price"),
        width: "w-56",
        minWidthPx: 180,
        maxWidthPx: 420,
        cellClassName:
          "whitespace-nowrap font-mono text-xs tabular-nums text-slate-700 dark:text-slate-200",
        render: (model) =>
          formatModelPrice(model.pricing ?? emptyModelPricing(), t("models_page.not_priced")),
      },
    ],
    [
      allSelected,
      locked,
      modelOptionIds,
      onChange,
      rowsDisabled,
      selectable.length,
      selected,
      someSelected,
      t,
    ],
  );

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-1">
          <div className="text-sm font-semibold text-slate-900 dark:text-white">
            {t("channel_groups_page.allowed_models_label")}
          </div>
          <div className="text-xs text-slate-500 dark:text-white/55">
            {t("channel_groups_page.allowed_models_hint")}
          </div>
          <div
            data-testid="model-gate-mode-hint"
            className={
              selection.exclusionsSupported
                ? "text-xs text-slate-600 dark:text-white/65"
                : "text-xs text-amber-700 dark:text-amber-200"
            }
          >
            {t(modeHintKey)}
          </div>
        </div>
        {/* A backend that drops excluded-models cannot store the switch's "on"
            state, so it is not offered there at all. */}
        {selection.exclusionsSupported ? (
          <ToggleSwitch
            checked={selection.autoAllowNewModels}
            onCheckedChange={(next) => {
              if (next) {
                setConfirmingAutoAllow(true);
                return;
              }
              onChange((current) => setAutoAllowNewModels(current, modelOptionIds, false));
            }}
            disabled={!canSwitch}
            label={t("channel_groups_page.auto_allow_new_models_label")}
          />
        ) : null}
      </div>

      {/* Turning the switch on is the one step here that widens the group
          beyond what the list shows, so it is spelled out and confirmed. */}
      {confirming ? (
        <div role="alert" data-testid="auto-allow-confirm" className={NOTICE_CLASS}>
          <p>
            {t("channel_groups_page.auto_allow_new_models_confirm", {
              total: modelOptionIds.length - selected.size,
            })}
          </p>
          <div className="mt-2 flex flex-wrap justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setConfirmingAutoAllow(false)}>
              {t("common.cancel")}
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => {
                onChange((current) => setAutoAllowNewModels(current, modelOptionIds, true));
                setConfirmingAutoAllow(false);
              }}
            >
              {t("channel_groups_page.auto_allow_new_models_confirm_action")}
            </Button>
          </div>
        </div>
      ) : null}

      {/* Entries the list has no row for are kept on save; they are listed here
          so they are neither silently kept nor silently lost. */}
      {listReady && ruleChips.length > 0 ? (
        <div data-testid="model-rules-outside-list" className={NOTICE_CLASS}>
          <p>{t("channel_groups_page.models_outside_list_hint")}</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {ruleChips.map(({ list, entry, tagKey }) => (
              <span
                key={`${list}:${entry}`}
                className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-white/80 py-0.5 pl-2.5 pr-1 dark:bg-neutral-950/50"
              >
                <span className="truncate font-mono">{entry}</span>
                <span className="shrink-0 rounded-full bg-amber-100 px-1.5 text-2xs font-semibold dark:bg-amber-500/15">
                  {t(tagKey)}
                </span>
                <button
                  type="button"
                  onClick={() => onChange((current) => removeModelRule(current, list, entry))}
                  disabled={disabled}
                  aria-label={t("channel_groups_page.models_rule_remove", { rule: entry })}
                  className="shrink-0 rounded-full p-0.5 transition-colors hover:bg-amber-100 disabled:opacity-40 dark:hover:bg-amber-500/20"
                >
                  <X size={12} />
                </button>
              </span>
            ))}
          </div>
        </div>
      ) : null}

      {needsChannels ? (
        <div
          className={[
            surface({ tone: "inset", radius: "2xl" }),
            "px-4 py-6 text-sm text-slate-500 dark:text-white/55",
          ].join(" ")}
        >
          {t("channel_groups_page.models_need_channels")}
        </div>
      ) : modelsError ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-400/25 dark:bg-rose-500/10 dark:text-rose-200">
          {modelsError}
        </div>
      ) : (
        <div data-testid="group-editor-model-list" className="min-h-0 flex-1 -mx-5">
          <div data-testid="group-editor-model-list-content" className="h-full min-h-0 px-5">
            <DataTable<RoutingModelOption>
              tableId="routing-model-options-v2"
              rows={modelOptions}
              columns={columns}
              rowKey={(model) => model.id}
              loading={modelsLoading}
              virtualize={false}
              rowHeight={58}
              height="h-full"
              minHeight="min-h-[360px]"
              minWidth="min-w-[760px]"
              caption={t("channel_groups_page.allowed_models_label")}
              emptyText={t("channel_groups_page.no_channel_models")}
              showAllLoadedMessage={false}
            />
          </div>
        </div>
      )}
    </>
  );
}
