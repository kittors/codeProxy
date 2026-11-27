import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { X } from "@code-proxy/ui/icons";
import { Button, GRID_WIDTH, surface } from "@code-proxy/ui";
import { Checkbox } from "@code-proxy/ui";
import { ToggleSwitch } from "@code-proxy/ui";
import { OverflowTooltip } from "@code-proxy/ui";
import { DataGrid, type DataGridColumn } from "@code-proxy/ui";
import { VendorIcon } from "@code-proxy/assets";
import { emptyModelPricing, formatModelPrice } from "@features/model-availability";
import type { RoutingModelOption } from "./types";
import {
  clearAllModels,
  followsUpstreamModels,
  lockedModelRules,
  modelRulesOutsideList,
  removeModelRule,
  selectAllModels,
  selectedModelIds,
  setAutoAllowNewModels,
  setFollowUpstreamModels,
  toggleModelSelection,
  upstreamModelsBeyondList,
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

// 提醒条只用琥珀淡底、不描边（同 Callout）。
const NOTICE_CLASS =
  "rounded-xl bg-amber-500/[0.09] px-4 py-3 text-xs leading-5 text-amber-800 dark:text-amber-200";

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
  // Following upstream only means something on a fixed list: with exclusions the
  // group already takes every new model.
  const showFollowSwitch = selection.followUpstreamSupported && !selection.autoAllowNewModels;
  const following = showFollowSwitch && followsUpstreamModels(selection);
  const upstreamPreview = useMemo(() => upstreamModelsBeyondList(selection), [selection]);
  const modeHintKey = !selection.exclusionsSupported
    ? "channel_groups_page.auto_allow_new_models_unsupported"
    : selection.autoAllowNewModels
      ? "channel_groups_page.auto_allow_new_models_on_hint"
      : following
        ? "channel_groups_page.auto_allow_new_models_off_following_hint"
        : "channel_groups_page.auto_allow_new_models_off_hint";

  const columns = useMemo<DataGridColumn<RoutingModelOption>[]>(
    () => [
      {
        // 勾选的是「允许的模型」这份持久设置，不是批量操作的临时选择，所以不用表格自带的多选：
        // 那会在有勾选时把表头换成选择条。全选框放在表头的附加控件里。
        id: "select",
        header: t("channel_groups_page.allowed_models_label"),
        hideHeaderLabel: true,
        align: "center",
        width: 56,
        resizable: false,
        reorderable: false,
        hideable: false,
        overflowTooltip: false,
        headerAccessory: (
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
        cell: (model) => {
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
        id: "model",
        header: t("models_page.col_model"),
        width: 448,
        minWidth: 220,
        maxWidth: 640,
        grow: true,
        cell: (model) => (
          <div className="flex min-w-0 items-center gap-2">
            <VendorIcon modelId={model.id} size={16} />
            <div className="min-w-0">
              <OverflowTooltip content={model.id} className="block min-w-0">
                <span className="block min-w-0 truncate font-medium">{model.id}</span>
              </OverflowTooltip>
              {model.description ? (
                <OverflowTooltip content={model.description} className="block min-w-0">
                  <span className="block min-w-0 truncate text-xs text-sn-label3">
                    {model.description}
                  </span>
                </OverflowTooltip>
              ) : null}
            </div>
          </div>
        ),
      },
      {
        id: "owner",
        header: t("models_page.col_owner"),
        width: GRID_WIDTH.numericWide,
        minWidth: 120,
        maxWidth: 360,
        cell: (model) => (
          <span className="truncate whitespace-nowrap text-sn-label2">{model.owned_by || "-"}</span>
        ),
        overflowTooltip: (model) => model.owned_by || "-",
      },
      {
        id: "price",
        header: t("models_page.col_price"),
        width: 224,
        minWidth: 180,
        maxWidth: 420,
        cell: (model) => (
          <span className="truncate whitespace-nowrap font-mono text-xs tabular-nums text-sn-label2">
            {formatModelPrice(model.pricing ?? emptyModelPricing(), t("models_page.not_priced"))}
          </span>
        ),
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
          <div className="text-sm font-semibold text-sn-label">
            {t("channel_groups_page.allowed_models_label")}
          </div>
          <div className="text-xs text-sn-label3">
            {t("channel_groups_page.allowed_models_hint")}
          </div>
          <div
            data-testid="model-gate-mode-hint"
            className={
              selection.exclusionsSupported
                ? "text-xs text-sn-label2"
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

      {/* The models it would open are listed before it is turned on: discovery
          may list models this list leaves unchecked, and those pass too. */}
      {showFollowSwitch ? (
        <div
          data-testid="follow-upstream-models"
          className={[surface({ tone: "inset", radius: "2xl" }), "space-y-2 px-4 py-3"].join(" ")}
        >
          <ToggleSwitch
            checked={following}
            onCheckedChange={(next) =>
              onChange((current) => setFollowUpstreamModels(current, next))
            }
            disabled={Boolean(disabled)}
            label={t("channel_groups_page.follow_upstream_models_label")}
            description={t("channel_groups_page.follow_upstream_models_hint")}
          />
          {upstreamPreview.length > 0 ? (
            <p data-testid="follow-upstream-models-preview" className="text-xs text-sn-label2">
              {t(
                following
                  ? "channel_groups_page.follow_upstream_models_preview_on"
                  : "channel_groups_page.follow_upstream_models_preview_off",
                { models: upstreamPreview.join(", ") },
              )}
            </p>
          ) : null}
        </div>
      ) : null}

      {/* Turning auto-allow on widens the group to every model its channels
          serve, now and later, so it is spelled out and confirmed. Following
          upstream widens it less, by the models listed above. */}
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
                className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-sn-raised py-0.5 pl-2.5 pr-1"
              >
                <span className="truncate font-mono">{entry}</span>
                <span className="shrink-0 rounded-full bg-amber-500/15 px-1.5 text-2xs font-semibold">
                  {t(tagKey)}
                </span>
                <button
                  type="button"
                  onClick={() => onChange((current) => removeModelRule(current, list, entry))}
                  disabled={disabled}
                  aria-label={t("channel_groups_page.models_rule_remove", { rule: entry })}
                  className="shrink-0 rounded-full p-0.5 transition-colors hover:bg-amber-500/15 disabled:opacity-40"
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
            "px-4 py-6 text-sm text-sn-label3",
          ].join(" ")}
        >
          {t("channel_groups_page.models_need_channels")}
        </div>
      ) : (
        <div data-testid="group-editor-model-list" className="flex min-h-0 flex-col -mx-5">
          <div data-testid="group-editor-model-list-content" className="flex min-h-0 flex-col px-5">
            {/* 编辑器里的列表：不套外框，按行收高；读不到模型列表时错误落在同一个框里。 */}
            <DataGrid<RoutingModelOption>
              id="routing-model-options-v2"
              frame={false}
              rows={modelOptions}
              columns={columns}
              rowKey={(model) => model.id}
              loading={modelsLoading}
              error={modelsError || null}
              label={t("channel_groups_page.allowed_models_label")}
              empty={{ title: t("channel_groups_page.no_channel_models") }}
            />
          </div>
        </div>
      )}
    </>
  );
}
