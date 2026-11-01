import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Plus, Shuffle, Trash2 } from "lucide-react";
import type { RoutingVirtualModel } from "@code-proxy/api-client/endpoints/routing-config";
import {
  Button,
  Callout,
  DataTable,
  FormField,
  Modal,
  SearchableSelect,
  SegmentedControl,
  Select,
  SettingGroup,
  SettingRow,
  TextInput,
  type DataTableColumn,
  type SearchableSelectOption,
} from "@code-proxy/ui";
import {
  MAX_VIRTUAL_MODEL_MEMBERS,
  checkDraft,
  emptyMemberDraft,
  firstPickShares,
  hasDraftIssues,
  type VirtualModelDraft,
  type VirtualModelMemberDraft,
} from "./virtualModelDrafts";

const FORM_ID = "virtual-model-form";

/**
 * 模型列表里没有的模型（手填的，或 /models 已不再列出）也要显示出来：下拉只认 options 里的值，
 * 否则会显示成占位符，看着像这个成员的模型丢了。
 */
function optionsWithModel(options: SearchableSelectOption[], model: string) {
  if (!model || options.some((option) => option.value === model)) return options;
  return [{ value: model, label: model }, ...options];
}

interface VirtualModelEditorModalProps {
  /** null 时关闭。 */
  draft: VirtualModelDraft | null;
  /** 列表里的其它虚拟模型，用来查重名和嵌套。 */
  others: RoutingVirtualModel[];
  /** 租户的渠道分组名（小写）。 */
  groups: string[];
  modelOptions: SearchableSelectOption[];
  saving: boolean;
  onChange: (draft: VirtualModelDraft) => void;
  onClose: () => void;
  onSave: (draft: VirtualModelDraft) => void;
}

/**
 * 新建 / 编辑一个虚拟模型：名字、按顺序还是按权重挑第一个成员、成员列表。成员的顺序就是尝试的顺序，
 * 用表格自带的拖动手柄排（手柄上按上下方向键也能移动）。校验和后端同一套规则，第一次点保存后才显示，
 * 免得刚打开就满屏报错。
 */
export function VirtualModelEditorModal({
  draft,
  others,
  groups,
  modelOptions,
  saving,
  onChange,
  onClose,
  onSave,
}: VirtualModelEditorModalProps) {
  const { t } = useTranslation();
  const open = draft !== null;
  const [attempted, setAttempted] = useState(false);
  useEffect(() => {
    if (open) setAttempted(false);
  }, [open]);

  const knownGroups = useMemo(() => new Set(groups), [groups]);
  const issues = useMemo(
    () => (draft ? checkDraft(draft, others, knownGroups) : null),
    [draft, knownGroups, others],
  );
  const shares = useMemo(() => (draft ? firstPickShares(draft) : {}), [draft]);

  const members = draft?.members;
  const groupOptions = useMemo(() => {
    const names = new Set(groups);
    // 已经删掉的分组也要能显示出来，否则下拉会悄悄显示成「按请求的路由」。
    members?.forEach((member) => {
      if (member.group) names.add(member.group);
    });
    return [
      { value: "", label: t("models_page.virtual.any_route") },
      ...Array.from(names)
        .sort((a, b) => a.localeCompare(b))
        .map((name) => ({ value: name, label: name })),
    ];
  }, [groups, members, t]);

  const updateMembers = useCallback(
    (next: (members: VirtualModelMemberDraft[]) => VirtualModelMemberDraft[]) => {
      if (draft) onChange({ ...draft, members: next(draft.members) });
    },
    [draft, onChange],
  );
  const updateMember = useCallback(
    (id: string, patch: Partial<VirtualModelMemberDraft>) =>
      updateMembers((list) =>
        list.map((member) => (member.id === id ? { ...member, ...patch } : member)),
      ),
    [updateMembers],
  );

  const weighted = draft?.weighted === true;
  const memberCount = members?.length ?? 0;
  const columns = useMemo<DataTableColumn<VirtualModelMemberDraft>[]>(
    () => [
      {
        key: "position",
        label: "#",
        width: "w-12 min-w-12",
        resizable: false,
        overflowTooltip: false,
        render: (_member, index) => (
          <span className="text-sm tabular-nums text-ink-3">{index + 1}</span>
        ),
      },
      {
        key: "group",
        label: t("models_page.virtual.member_group"),
        width: "w-48 min-w-48",
        overflowTooltip: false,
        render: (member, index) => (
          <Select
            value={member.group}
            onChange={(group) => updateMember(member.id, { group })}
            options={groupOptions}
            aria-label={t("models_page.virtual.member_group_aria", { index: index + 1 })}
            size="sm"
            fullWidth
            disabled={saving}
          />
        ),
      },
      {
        key: "model",
        label: t("models_page.virtual.member_model"),
        overflowTooltip: false,
        render: (member, index) => (
          <SearchableSelect
            value={member.model}
            onChange={(model) => updateMember(member.id, { model })}
            onCreate={(model) => updateMember(member.id, { model: model.trim() })}
            options={optionsWithModel(modelOptions, member.model)}
            allowCreate
            normalizeCreateValue={(value) => value.trim()}
            createLabel={(model) => t("models_page.virtual.model_create", { model: model.trim() })}
            placeholder={t("models_page.virtual.model_placeholder")}
            searchPlaceholder={t("models_page.virtual.model_search")}
            aria-label={t("models_page.virtual.member_model_aria", { index: index + 1 })}
            aria-invalid={attempted && issues?.member[member.id] !== undefined}
            size="sm"
            disabled={saving}
          />
        ),
      },
      ...(weighted
        ? [
            {
              key: "weight",
              label: t("models_page.virtual.member_weight"),
              width: "w-40 min-w-40",
              overflowTooltip: false,
              render: (member: VirtualModelMemberDraft, index: number) => (
                <div className="flex items-center gap-2">
                  <TextInput
                    value={member.weight}
                    onChange={(event) => {
                      const weight = event.currentTarget.value;
                      if (/^\d*$/.test(weight)) updateMember(member.id, { weight });
                    }}
                    placeholder="0"
                    inputMode="numeric"
                    aria-label={t("models_page.virtual.member_weight_aria", { index: index + 1 })}
                    className="!w-20"
                    disabled={saving}
                  />
                  {shares[member.id] !== undefined ? (
                    <span className="whitespace-nowrap text-xs tabular-nums text-ink-3">
                      {t("models_page.virtual.member_share", { share: shares[member.id] })}
                    </span>
                  ) : null}
                </div>
              ),
            },
          ]
        : []),
      {
        key: "remove",
        label: "",
        width: "w-14 min-w-14",
        resizable: false,
        overflowTooltip: false,
        render: (member, index) => (
          <Button
            variant="ghost"
            size="xs"
            onClick={() => updateMembers((list) => list.filter((m) => m.id !== member.id))}
            disabled={saving || memberCount <= 1}
            aria-label={t("models_page.virtual.remove_member", { index: index + 1 })}
            title={t("models_page.virtual.remove_member", { index: index + 1 })}
          >
            <Trash2 size={14} />
          </Button>
        ),
      },
    ],
    [
      attempted,
      groupOptions,
      issues,
      memberCount,
      modelOptions,
      saving,
      shares,
      t,
      updateMember,
      updateMembers,
      weighted,
    ],
  );

  const problems: string[] = [];
  if (draft && issues) {
    if (issues.members) problems.push(t(`models_page.virtual.errors.members_${issues.members}`));
    draft.members.forEach((member, index) => {
      const issue = issues.member[member.id];
      if (!issue) return;
      problems.push(
        t(`models_page.virtual.errors.member_${issue}`, {
          index: index + 1,
          model: member.model.trim(),
          group: member.group,
        }),
      );
    });
  }

  const submit = () => {
    if (!draft || !issues) return;
    setAttempted(true);
    if (hasDraftIssues(issues)) return;
    onSave(draft);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={
        draft?.originalName
          ? t("models_page.virtual.edit_title")
          : t("models_page.virtual.add_title")
      }
      description={t("models_page.virtual.editor_desc")}
      icon={<Shuffle />}
      size="xl"
      onSubmitShortcut={submit}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            {t("models_page.cancel")}
          </Button>
          <Button type="submit" form={FORM_ID} variant="primary" loading={saving}>
            {t("models_page.save")}
          </Button>
        </>
      }
    >
      {draft && issues ? (
        <form
          id={FORM_ID}
          noValidate
          className="space-y-5"
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <div className="grid gap-x-4 sm:grid-cols-2">
            <FormField
              label={t("models_page.virtual.name")}
              htmlFor="virtual-model-name"
              required
              description={t("models_page.virtual.name_hint")}
              error={
                attempted && issues.name ? t(`models_page.virtual.errors.name_${issues.name}`) : ""
              }
            >
              <TextInput
                value={draft.name}
                onChange={(event) => onChange({ ...draft, name: event.target.value })}
                placeholder="smart"
                spellCheck={false}
                autoComplete="off"
                className="font-mono"
                disabled={saving}
              />
            </FormField>
            <FormField
              label={t("models_page.virtual.description_label")}
              htmlFor="virtual-model-description"
              optional
              description={t("models_page.virtual.description_hint")}
            >
              <TextInput
                value={draft.description}
                onChange={(event) => onChange({ ...draft, description: event.target.value })}
                placeholder={t("models_page.virtual.description_placeholder")}
                disabled={saving}
              />
            </FormField>
          </div>

          <SettingGroup flat>
            <SettingRow
              label={t("models_page.virtual.strategy")}
              description={
                draft.weighted
                  ? t("models_page.virtual.strategy_weighted_hint")
                  : t("models_page.virtual.strategy_order_hint")
              }
              controlWidth="auto"
              control={
                <SegmentedControl<"order" | "weighted">
                  size="sm"
                  value={draft.weighted ? "weighted" : "order"}
                  onChange={(value) => onChange({ ...draft, weighted: value === "weighted" })}
                  options={[
                    { value: "order", label: t("models_page.virtual.strategy_order") },
                    { value: "weighted", label: t("models_page.virtual.strategy_weighted") },
                  ]}
                  ariaLabel={t("models_page.virtual.strategy")}
                  disabled={saving}
                />
              }
            />
          </SettingGroup>

          <section className="space-y-2" aria-labelledby="virtual-model-members-title">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div className="min-w-0">
                <h3 id="virtual-model-members-title" className="text-sm font-medium text-ink">
                  {t("models_page.virtual.members")}
                </h3>
                <p className="text-xs leading-5 text-ink-3">
                  {t("models_page.virtual.members_hint")}
                </p>
              </div>
              <span className="text-xs tabular-nums text-ink-3">
                {t("models_page.virtual.member_count", {
                  used: draft.members.length,
                  max: MAX_VIRTUAL_MODEL_MEMBERS,
                })}
              </span>
            </div>
            <DataTable<VirtualModelMemberDraft>
              rows={draft.members}
              columns={columns}
              rowKey={(member) => member.id}
              virtualize={false}
              rowHeight={52}
              height="h-auto"
              minHeight="min-h-0"
              minWidth={draft.weighted ? "min-w-[760px]" : "min-w-[600px]"}
              caption={t("models_page.virtual.members")}
              emptyText={t("models_page.virtual.errors.members_none")}
              columnResizable={false}
              columnReorderable={false}
              rowReorderable={!saving}
              onRowsChange={(next) => onChange({ ...draft, members: next })}
              naturalFlow
            />
            <Button
              variant="secondary"
              size="sm"
              onClick={() => updateMembers((list) => [...list, emptyMemberDraft()])}
              disabled={saving || draft.members.length >= MAX_VIRTUAL_MODEL_MEMBERS}
            >
              <Plus size={14} />
              {t("models_page.virtual.add_member")}
            </Button>
          </section>

          {attempted && problems.length > 0 ? (
            <Callout tone="danger" role="alert" title={t("models_page.virtual.errors.title")}>
              <ul className="list-disc space-y-0.5 pl-4">
                {problems.map((problem) => (
                  <li key={problem}>{problem}</li>
                ))}
              </ul>
            </Callout>
          ) : null}
        </form>
      ) : null}
    </Modal>
  );
}
