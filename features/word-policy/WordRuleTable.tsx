import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Pencil, Search, Trash2 } from "lucide-react";
import type { WordPolicyLimits, WordRuleKind } from "@code-proxy/api-client";
import {
  Button,
  DataGrid,
  DataGridPagination,
  GRID_ROW_ACTIONS_COLUMN,
  GRID_WIDTH,
  Select,
  GridRowActions,
  TextInput,
  ToggleSwitch,
  type DataGridColumn,
} from "@code-proxy/ui";
import { filterRules, type DraftRule } from "./wordPolicyModel";

const PAGE_SIZE = 20;

export interface WordRuleTableProps {
  rules: readonly DraftRule[];
  limits: WordPolicyLimits;
  readOnly: boolean;
  /** 上次保存被拒时，每条问题规则（按草稿里的 key）对应的原因。 */
  problems: ReadonlyMap<string, string>;
  /** 匹配长度不限、流式回复里可能漏掉跨事件匹配的正则（草稿里的 key）；回复过滤没开时传空集合。 */
  unbounded: ReadonlySet<string>;
  onEdit: (rule: DraftRule) => void;
  onToggle: (rule: DraftRule, enabled: boolean) => void;
  onDelete: (rule: DraftRule) => void;
}

function KindBadge({ kind }: { kind: WordRuleKind }) {
  const { t } = useTranslation();
  return (
    <span
      className={[
        "rounded-full px-2.5 py-1 text-xs font-medium",
        kind === "regex"
          ? "bg-accent-soft text-accent-ink colorful:bg-sky-500/10 colorful:text-sky-700 colorful:dark:text-sky-300"
          : "bg-ink/[0.05] text-ink-2 dark:bg-white/[0.07]",
      ].join(" ")}
    >
      {t(`content_moderation.words.kind_${kind}`)}
    </span>
  );
}

/** 规则下面的小标签：忽略分隔符、匹配长度不限。 */
function RuleTag({
  children,
  title,
  warning = false,
}: {
  children: string;
  title?: string;
  warning?: boolean;
}) {
  return (
    <span
      title={title}
      className={[
        "rounded-full px-2 py-0.5 text-2xs font-medium",
        warning
          ? "bg-amber-500/10 text-amber-700 dark:text-amber-300"
          : "bg-ink/[0.05] text-ink-2 dark:bg-white/[0.07]",
      ].join(" ")}
    >
      {children}
    </span>
  );
}

/**
 * 规则列表：搜索、按类型筛选、分页（一份策略最多上万条，不能一次全画出来），
 * 行内启停、编辑、删除。添加和导入在列表上方的快速添加栏里。所有改动只落在草稿里，保存由上层统一做。
 */
export function WordRuleTable({
  rules,
  limits,
  readOnly,
  problems,
  unbounded,
  onEdit,
  onToggle,
  onDelete,
}: WordRuleTableProps) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<WordRuleKind | "all">("all");
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => filterRules(rules, { query, kind }), [kind, query, rules]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  // 删除或筛选之后页数可能变少：当前页越界时回到最后一页，而不是显示一张空表。
  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);
  const current = Math.min(page, totalPages);
  const pageRules = useMemo(
    () => filtered.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE),
    [current, filtered],
  );
  const regexCount = useMemo(() => rules.filter((rule) => rule.kind === "regex").length, [rules]);

  const columns = useMemo<DataGridColumn<DraftRule>[]>(
    () => [
      {
        id: "pattern",
        header: t("content_moderation.words.col_pattern"),
        width: GRID_WIDTH.composite,
        cell: (rule) => {
          const problem = problems.get(rule.key);
          // 绝大多数规则是关键词：只给正则挂类型标签，免得每一行都重复「关键词」三个字。
          return (
            <div className="min-w-0">
              <p className="flex min-w-0 items-center gap-2">
                {rule.kind === "regex" ? <KindBadge kind={rule.kind} /> : null}
                <span
                  className={[
                    "truncate text-ink",
                    rule.kind === "regex" ? "font-mono text-xs" : "text-sm",
                    rule.enabled ? "" : "text-ink-3 line-through",
                  ].join(" ")}
                  title={rule.pattern}
                >
                  {rule.pattern}
                </span>
              </p>
              {rule.ignore_separators || unbounded.has(rule.key) ? (
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {rule.ignore_separators ? (
                    <RuleTag title={t("content_moderation.words.badge_ignore_separators_hint")}>
                      {t("content_moderation.words.badge_ignore_separators")}
                    </RuleTag>
                  ) : null}
                  {unbounded.has(rule.key) ? (
                    <RuleTag warning title={t("content_moderation.words.badge_unbounded_hint")}>
                      {t("content_moderation.words.badge_unbounded")}
                    </RuleTag>
                  ) : null}
                </div>
              ) : null}
              {problem ? (
                <p role="alert" className="mt-1 text-xs text-rose-600 dark:text-rose-400">
                  {problem}
                </p>
              ) : null}
            </div>
          );
        },
      },
      {
        id: "note",
        header: t("content_moderation.words.col_note"),
        width: GRID_WIDTH.name,
        className: "text-xs text-ink-2",
        cell: (rule) => rule.note ?? "",
      },
      {
        id: "enabled",
        header: t("content_moderation.words.col_enabled"),
        width: GRID_WIDTH.toggle,
        cell: (rule) => (
          <ToggleSwitch
            checked={rule.enabled}
            disabled={readOnly}
            ariaLabel={t("content_moderation.words.toggle_rule", { pattern: rule.pattern })}
            onCheckedChange={(enabled) => onToggle(rule, enabled)}
          />
        ),
      },
      ...(readOnly
        ? []
        : [
            {
              id: "actions",
              header: t("content_moderation.actions"),
              ...GRID_ROW_ACTIONS_COLUMN,
              cell: (rule: DraftRule) => (
                <GridRowActions
                  moreLabel={t("content_moderation.more_actions")}
                  actions={[
                    {
                      key: "edit",
                      label: t("content_moderation.words.edit_rule"),
                      icon: <Pencil size={15} />,
                      onClick: () => onEdit(rule),
                    },
                    {
                      key: "delete",
                      label: t("content_moderation.words.delete_rule"),
                      icon: <Trash2 size={15} />,
                      onClick: () => onDelete(rule),
                      destructive: true,
                    },
                  ]}
                />
              ),
            } satisfies DataGridColumn<DraftRule>,
          ]),
    ],
    [onDelete, onEdit, onToggle, problems, readOnly, t, unbounded],
  );

  return (
    // 一页最多 20 行。上层给出确定高度时（管理端敏感词页宽屏两栏）撑满它、表格铺满（fill）并在
    // 内部滚动，分页条在下面不随行数移动；随页面流动时（门户、窄屏）表格跟着行数走。
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="w-full min-w-48 sm:w-72">
          <TextInput
            value={query}
            startAdornment={<Search size={15} className="text-ink-3" aria-hidden="true" />}
            placeholder={t("content_moderation.words.search_placeholder")}
            aria-label={t("content_moderation.words.search_placeholder")}
            onChange={(event) => {
              setQuery(event.currentTarget.value);
              setPage(1);
            }}
          />
        </div>
        <div className="w-40">
          <Select
            value={kind}
            aria-label={t("content_moderation.words.filter_kind")}
            options={[
              { value: "all", label: t("content_moderation.words.kind_all") },
              { value: "keyword", label: t("content_moderation.words.kind_keyword") },
              { value: "regex", label: t("content_moderation.words.kind_regex") },
            ]}
            onChange={(next) => {
              setKind(next as WordRuleKind | "all");
              setPage(1);
            }}
          />
        </div>
        <p className="min-w-0 text-xs text-ink-3 sm:ml-auto" aria-live="polite">
          {t("content_moderation.words.rule_counts", {
            count: rules.length,
            max: limits.max_rules,
            regex: regexCount,
            maxRegex: limits.max_regex,
          })}
        </p>
      </div>

      <DataGrid<DraftRule>
        fill
        id="word-policy-rules"
        label={t("content_moderation.words.table_caption")}
        rows={pageRules}
        columns={columns}
        rowKey={(rule) => rule.key}
        resizable={false}
        columnReorder={false}
        empty={
          rules.length === 0
            ? {
                title: t("content_moderation.words.empty_rules"),
                description: readOnly ? undefined : t("content_moderation.words.empty_rules_hint"),
              }
            : {
                title: t("content_moderation.words.no_match"),
                action: (
                  <Button
                    size="sm"
                    onClick={() => {
                      setQuery("");
                      setKind("all");
                      setPage(1);
                    }}
                  >
                    {t("common.clear_filters")}
                  </Button>
                ),
              }
        }
        // 有问题的规则整行淡红。
        rowTone={(rule) => (problems.has(rule.key) ? "danger" : undefined)}
        resetScrollKey={`${current}|${kind}|${query}`}
        // 分页一直在：筛选让条数跨过一页时，框的高度不会因为分页出现、消失而跳动。
        footer={
          <DataGridPagination
            page={current}
            pageSize={PAGE_SIZE}
            total={filtered.length}
            onPageChange={setPage}
          />
        }
      />

    </div>
  );
}
