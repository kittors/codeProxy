import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Plus, Shuffle, Trash2 } from "@code-proxy/ui/icons";
import type { RoutingVirtualModel } from "@code-proxy/api-client/endpoints/routing-config";
import {
  Button,
  Callout,
  DataGrid,
  FormField,
  Modal,
  SearchableSelect,
  SegmentedControl,
  Select,
  SettingGroup,
  SettingRow,
  GridRowActions,
  TextInput,
  gridRowActionsColumn,
  moveGridRow,
  type DataGridColumn,
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
  // 每格都是表单控件：不要截断提示，列宽也不用拖（resizable={false} 在表格上统一关掉）。
  const columns = useMemo<DataGridColumn<VirtualModelMemberDraft>[]>(
    () => [
      {
        id: "position",
        header: "#",
        align: "end",
        width: 48,
        overflowTooltip: false,
        cell: (_member, { rowIndex: index }) => (
          <span className="text-sm tabular-nums text-ink-3">{index + 1}</span>
        ),
      },
      {
        id: "group",
        header: t("models_page.virtual.member_group"),
        width: 192,
        overflowTooltip: false,
        cell: (member, { rowIndex: index }) => (
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
        id: "model",
        header: t("models_page.virtual.member_model"),
        width: 220,
        grow: true,
        overflowTooltip: false,
        cell: (member, { rowIndex: index }) => (
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
              id: "weight",
              header: t("models_page.virtual.member_weight"),
              width: 160,
              overflowTooltip: false,
              cell: (member: VirtualModelMemberDraft, { rowIndex: index }: { rowIndex: number }) => (
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
        id: "remove",
        header: t("common.action"),
        // 一个图标按钮加单元格左右内边距正好放下（表头文字只给读屏）；删除和其它表格的行操作同一种按钮、红色区分。
        ...gridRowActionsColumn(1),
        hideHeaderLabel: true,
        width: 64,
        minWidth: 64,
        maxWidth: 64,
        cell: (member, { rowIndex: index }) => (
          <GridRowActions
            actions={[
              {
                key: "remove",
                label: t("models_page.virtual.remove_member", { index: index + 1 }),
                icon: <Trash2 />,
                destructive: true,
                disabled: saving || memberCount <= 1,
                onClick: () => updateMembers((list) => list.filter((m) => m.id !== member.id)),
              },
            ]}
          />
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
            {/* 成员的先后就是回退顺序：拖行首把手（或聚焦把手按 ↑/↓）调整。表单里的小表，不套外框、按行收高。 */}
            <DataGrid<VirtualModelMemberDraft>
              frame={false}
              rows={draft.members}
              columns={columns}
              rowKey={(member) => member.id}
              label={t("models_page.virtual.members")}
              empty={{ title: t("models_page.virtual.errors.members_none") }}
              resizable={false}
              columnReorder={false}
              rowReorder={{
                disabled: saving,
                onMove: (from, to) =>
                  onChange({ ...draft, members: moveGridRow(draft.members, from, to) }),
              }}
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
