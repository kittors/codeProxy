import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { FileUp, Pencil, Plus, Search, Trash2 } from "lucide-react";
import type { WordPolicyLimits, WordRuleKind } from "@code-proxy/api-client";
import {
  Button,
  COLUMN_WIDTH,
  DataTable,
  PaginationBar,
  Select,
  TABLE_ROW_ACTIONS_COLUMN,
  TableRowActions,
  TextInput,
  ToggleSwitch,
  type DataTableColumn,
} from "@code-proxy/ui";
import { filterRules, type DraftRule } from "./wordPolicyModel";

const PAGE_SIZE = 20;

export interface WordRuleListProps {
  rules: readonly DraftRule[];
  limits: WordPolicyLimits;
  readOnly: boolean;
  /** 上次保存被拒时，每条问题规则（按草稿里的 key）对应的原因。 */
  problems: ReadonlyMap<string, string>;
  /** 匹配长度不限、流式回复里可能漏掉跨事件匹配的正则（草稿里的 key）；回复过滤没开时传空集合。 */
  unbounded: ReadonlySet<string>;
  onAdd: () => void;
  onImport: () => void;
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
 * 行内启停、编辑、删除。所有改动只落在草稿里，保存由上层统一做。
 */
export function WordRuleList({
  rules,
  limits,
  readOnly,
  problems,
  unbounded,
  onAdd,
  onImport,
  onEdit,
  onToggle,
  onDelete,
}: WordRuleListProps) {
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

  const columns = useMemo<DataTableColumn<DraftRule>[]>(
    () => [
      {
        key: "kind",
        label: t("content_moderation.words.col_kind"),
        width: COLUMN_WIDTH.badge,
        render: (rule) => <KindBadge kind={rule.kind} />,
      },
      {
        key: "pattern",
        label: t("content_moderation.words.col_pattern"),
        width: COLUMN_WIDTH.composite,
        render: (rule) => {
          const problem = problems.get(rule.key);
          return (
            <div className="min-w-0">
              <p className="truncate font-mono text-xs text-ink" title={rule.pattern}>
                {rule.pattern}
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
        key: "note",
        label: t("content_moderation.words.col_note"),
        width: COLUMN_WIDTH.name,
        cellClassName: "text-xs text-ink-2",
        render: (rule) => rule.note ?? "",
      },
      {
        key: "enabled",
        label: t("content_moderation.words.col_enabled"),
        width: COLUMN_WIDTH.toggle,
        render: (rule) => (
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
              key: "actions",
              label: t("content_moderation.actions"),
              ...TABLE_ROW_ACTIONS_COLUMN,
              render: (rule: DraftRule) => (
                <TableRowActions
                  align="start"
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
            } satisfies DataTableColumn<DraftRule>,
          ]),
    ],
    [onDelete, onEdit, onToggle, problems, readOnly, t, unbounded],
  );

  return (
    <div className="space-y-3">
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
        {/* 窄屏上计数单独占一行排在最后；否则它在筛选框和按钮之间被挤成一字一行。 */}
        <p
          className="order-last min-w-0 basis-full text-xs text-ink-3 sm:order-none sm:basis-0 sm:flex-1"
          aria-live="polite"
        >
          {t("content_moderation.words.rule_counts", {
            count: rules.length,
            max: limits.max_rules,
            regex: regexCount,
            maxRegex: limits.max_regex,
          })}
        </p>
        {readOnly ? null : (
          <div className="ml-auto flex gap-2">
            <Button variant="secondary" size="sm" onClick={onImport}>
              <FileUp size={14} />
              {t("content_moderation.words.import")}
            </Button>
            <Button variant="primary" size="sm" onClick={onAdd}>
              <Plus size={14} />
              {t("content_moderation.words.add_rule")}
            </Button>
          </div>
        )}
      </div>

      <DataTable<DraftRule>
        tableId="content-moderation-word-rules"
        rows={pageRules}
        columns={columns}
        rowKey={(rule) => rule.key}
        virtualize={false}
        naturalFlow
        columnResizable={false}
        columnReorderable={false}
        minWidth="min-w-[760px]"
        caption={t("content_moderation.words.table_caption")}
        emptyText={
          rules.length === 0
            ? t("content_moderation.words.empty_rules")
            : t("content_moderation.words.no_match")
        }
        emptyDescription={
          rules.length === 0 && !readOnly
            ? t("content_moderation.words.empty_rules_hint")
            : undefined
        }
        showAllLoadedMessage={false}
        rowClassName={(rule) => (problems.has(rule.key) ? "bg-rose-500/[0.05]" : "")}
      />

      {filtered.length > PAGE_SIZE ? (
        <PaginationBar
          currentPage={current}
          totalPages={totalPages}
          totalCount={filtered.length}
          pageSize={PAGE_SIZE}
          onPageChange={setPage}
          labels={{
            firstPage: t("content_moderation.first_page"),
            previousPage: t("content_moderation.previous_page"),
            nextPage: t("content_moderation.next_page"),
            lastPage: t("content_moderation.last_page"),
            pageInfo: ({ start, end, total }) =>
              t("content_moderation.page_info", { start, end, total }),
          }}
        />
      ) : null}
    </div>
  );
}
