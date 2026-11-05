import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ListChecks, Search } from "lucide-react";
import { wordPolicyApi, type WordPortalUser, type WordPortalView } from "@code-proxy/api-client";
import {
  Button,
  COLUMN_WIDTH,
  Callout,
  DataTable,
  PaginationBar,
  Select,
  SettingGroup,
  SettingRow,
  SkeletonLines,
  TextInput,
  ToggleSwitch,
  useToast,
  type DataTableColumn,
} from "@code-proxy/ui";

const PAGE_SIZE = 20;
/** 权限下拉的取值：跟随租户默认、单独允许、单独禁止。 */
type AccessChoice = "default" | "allow" | "deny";

const choiceOf = (user: WordPortalUser): AccessChoice =>
  user.override === null ? "default" : user.override ? "allow" : "deny";

export interface PortalAccessPanelProps {
  canWrite: boolean;
  /** 打开某个门户账号自己的敏感词。 */
  onOpenUser: (user: WordPortalUser) => void;
  /** 权限变了之后（上层刷新左侧的计数）。 */
  onChanged: () => void;
}

/**
 * 门户账号的敏感词权限：一个总开关决定门户账号默认能不能在门户里设置自己的敏感词，
 * 下面的列表可以给单个账号单独允许或禁止，并看到每个账号设了多少词、点进去查看或修改。
 *
 * 门户账号自己的词只对它自己的 API Key 生效，而且只能额外拦截：平台和租户的规则照常检查，
 * 账号改不了也关不掉。收回权限后账号的词保留但立即停止生效，重新允许后恢复。
 */
export function PortalAccessPanel({ canWrite, onOpenUser, onChanged }: PortalAccessPanelProps) {
  const { t } = useTranslation();
  const { notify } = useToast();
  const [view, setView] = useState<WordPortalView | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "with_words" | "allowed">("all");
  const [page, setPage] = useState(1);

  const load = useCallback(async () => {
    try {
      setView(await wordPolicyApi.portal());
      setError("");
    } catch (loadError) {
      setError(loadError instanceof Error && loadError.message ? loadError.message : t("content_moderation.words.portal_load_failed"));
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  const setDefault = async (allowed: boolean) => {
    setBusy("default");
    try {
      await wordPolicyApi.setPortalDefault(allowed);
      await load();
      onChanged();
      notify({ type: "success", message: t("content_moderation.words.portal_saved") });
    } catch (saveError) {
      notify({ type: "error", message: saveError instanceof Error ? saveError.message : t("content_moderation.words.portal_save_failed") });
    } finally {
      setBusy(null);
    }
  };

  const setUser = useCallback(
    async (user: WordPortalUser, choice: AccessChoice) => {
      setBusy(user.id);
      try {
        const allowed = choice === "default" ? null : choice === "allow";
        const result = await wordPolicyApi.setPortalUser(user.id, allowed);
        setView((current) =>
          current
            ? {
                ...current,
                users: current.users.map((item) =>
                  item.id === user.id ? { ...item, override: allowed, allowed: result.allowed } : item,
                ),
              }
            : current,
        );
        onChanged();
      } catch (saveError) {
        notify({ type: "error", message: saveError instanceof Error ? saveError.message : t("content_moderation.words.portal_save_failed") });
      } finally {
        setBusy(null);
      }
    },
    [notify, onChanged, t],
  );

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return (view?.users ?? []).filter((user) => {
      if (filter === "with_words" && !user.policy) return false;
      if (filter === "allowed" && !user.allowed) return false;
      if (!needle) return true;
      return `${user.display_name} ${user.username}`.toLowerCase().includes(needle);
    });
  }, [filter, query, view?.users]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const current = Math.min(page, totalPages);
  const pageUsers = filtered.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);

  const columns = useMemo<DataTableColumn<WordPortalUser>[]>(() => {
    const defaultLabel = view?.default_allowed
      ? t("content_moderation.words.portal_follow_allowed")
      : t("content_moderation.words.portal_follow_denied");
    return [
      {
        key: "user",
        label: t("content_moderation.words.portal_col_user"),
        width: COLUMN_WIDTH.name,
        render: (user) => (
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-ink">{user.display_name || user.username}</p>
            <p className="truncate text-xs text-ink-3">{user.username}</p>
          </div>
        ),
      },
      {
        key: "access",
        label: t("content_moderation.words.portal_col_access"),
        width: "w-[220px] min-w-[220px]",
        render: (user) => (
          <Select
            value={choiceOf(user)}
            disabled={!canWrite || busy !== null}
            aria-label={t("content_moderation.words.portal_access_for", { name: user.display_name || user.username })}
            options={[
              { value: "default", label: defaultLabel },
              { value: "allow", label: t("content_moderation.words.portal_allow") },
              { value: "deny", label: t("content_moderation.words.portal_deny") },
            ]}
            onChange={(next) => void setUser(user, next as AccessChoice)}
          />
        ),
      },
      {
        key: "words",
        label: t("content_moderation.words.portal_col_words"),
        width: COLUMN_WIDTH.badgeStacked,
        render: (user) =>
          user.policy ? (
            <div className="text-xs">
              <p className="text-ink-2">{t("content_moderation.words.word_count", { count: user.policy.rule_count })}</p>
              <p className={user.allowed && user.policy.enabled ? "mt-0.5 text-emerald-600 dark:text-emerald-400" : "mt-0.5 text-ink-3"}>
                {!user.allowed
                  ? t("content_moderation.words.portal_words_inactive")
                  : user.policy.enabled
                    ? t("content_moderation.words.portal_words_active")
                    : t("content_moderation.words.portal_words_disabled")}
              </p>
            </div>
          ) : (
            <span className="text-xs text-ink-3">{t("content_moderation.words.portal_words_none")}</span>
          ),
      },
      {
        key: "open",
        label: t("content_moderation.actions"),
        width: COLUMN_WIDTH.name,
        // 右栏放不下全部列时（1280 宽左右）固定在右侧，「代为设置」不会被横向滚动藏起来。
        lockOrder: "end",
        headerClassName: "md:sticky md:z-40 md:bg-slate-100 md:dark:bg-neutral-800",
        cellClassName: "whitespace-nowrap md:sticky md:z-30 md:bg-backdrop",
        render: (user) => (
          <Button variant="secondary" size="sm" onClick={() => onOpenUser(user)}>
            <ListChecks size={14} />
            {user.policy ? t("content_moderation.words.portal_view_words") : t("content_moderation.words.portal_set_words")}
          </Button>
        ),
      },
    ];
  }, [busy, canWrite, onOpenUser, setUser, t, view?.default_allowed]);

  if (error) {
    return (
      <Callout
        tone="danger"
        role="alert"
        actions={
          <Button variant="secondary" size="sm" onClick={() => void load()}>
            {t("common.retry")}
          </Button>
        }
      >
        {error}
      </Callout>
    );
  }
  if (!view) return <SkeletonLines rows={5} />;

  return (
    // 宽屏下上层把这一栏钉满一屏：开关和筛选不动，账号表铺满剩余高度（fill）、在内部滚动，
    // 分页条在下面不随行数移动；窄屏随页面流动。
    <div className="flex min-h-0 flex-1 flex-col gap-6">
      <header className="space-y-1">
        <h3 className="text-base font-semibold text-ink">{t("content_moderation.words.portal_title")}</h3>
        <p className="text-xs leading-5 text-ink-3">{t("content_moderation.words.portal_description")}</p>
      </header>

      <SettingGroup>
        <SettingRow
          label={t("content_moderation.words.portal_default_label")}
          description={t("content_moderation.words.portal_default_hint", { max: view.limits.max_rules })}
          controlWidth="auto"
          control={
            <ToggleSwitch
              checked={view.default_allowed}
              disabled={!canWrite || busy !== null}
              ariaLabel={t("content_moderation.words.portal_default_label")}
              onCheckedChange={(next) => void setDefault(next)}
            />
          }
        />
      </SettingGroup>

      <section className="flex min-h-0 flex-1 flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <h4 className="mr-auto text-sm font-semibold text-ink">{t("content_moderation.words.portal_users_title")}</h4>
          <div className="w-full sm:w-64">
            <TextInput
              value={query}
              startAdornment={<Search size={15} className="text-ink-3" aria-hidden="true" />}
              placeholder={t("content_moderation.words.portal_search")}
              aria-label={t("content_moderation.words.portal_search")}
              onChange={(event) => {
                setQuery(event.currentTarget.value);
                setPage(1);
              }}
            />
          </div>
          <div className="w-40">
            <Select
              value={filter}
              aria-label={t("content_moderation.words.portal_filter")}
              options={[
                { value: "all", label: t("content_moderation.words.portal_filter_all") },
                { value: "with_words", label: t("content_moderation.words.portal_filter_with_words") },
                { value: "allowed", label: t("content_moderation.words.portal_filter_allowed") },
              ]}
              onChange={(next) => {
                setFilter(next as typeof filter);
                setPage(1);
              }}
            />
          </div>
        </div>

        <DataTable<WordPortalUser>
          fill
          tableId="word-policy-portal-users"
          rows={pageUsers}
          columns={columns}
          rowKey={(user) => user.id}
          virtualize={false}
          columnResizable={false}
          columnReorderable={false}
          minWidth="min-w-[680px]"
          caption={t("content_moderation.words.portal_users_title")}
          emptyText={
            view.users.length === 0
              ? t("content_moderation.words.portal_users_empty")
              : t("content_moderation.words.portal_users_no_match")
          }
          showAllLoadedMessage={false}
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
              pageInfo: ({ start, end, total }) => t("content_moderation.page_info", { start, end, total }),
            }}
          />
        ) : null}
      </section>
    </div>
  );
}
