import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ArrowLeft, KeyRound } from "lucide-react";
import {
  apiKeyEntriesApi,
  wordPolicyApi,
  type ApiKeyEntry,
  type WordPolicyOverview,
  type WordPolicyScope,
  type WordPortalUser,
} from "@code-proxy/api-client";
import { maskApiKey } from "@code-proxy/domain";
import {
  Button,
  Callout,
  ConfirmModal,
  EmptyState,
  SearchableSelect,
  SkeletonLines,
  type SearchableSelectOption,
} from "@code-proxy/ui";
import {
  useWordPolicyDraft,
  WordPolicyEditor,
  type WordPolicySource,
  type WordRuleValidator,
} from "@features/word-policy";
import { PortalAccessPanel } from "./PortalAccessPanel";
import { WordScopeRail, type WordRailItem } from "./WordScopeRail";

export interface WordPoliciesTabProps {
  canWrite: boolean;
  canTest: boolean;
  /** 后端支持门户账号自定义敏感词（capabilities.word_portal）。 */
  portalSupported: boolean;
  /**
   * 草稿有没有未保存的改动。切到页面的另一个标签会卸载这一页、丢掉草稿，所以页面要知道，
   * 并在那之前确认。卸载时会再报一次 false。
   */
  onDirtyChange?: (dirty: boolean) => void;
}

/** 正在编辑哪一份策略。keys / portal 下没选具体对象时是列表，不是编辑器。 */
interface Selection {
  rail: WordRailItem;
  keyId: string;
  endUser: { id: string; name: string } | null;
}

/** 选中项对应的策略层级与对象；没有选中具体策略时为 null。 */
function policyOf(selection: Selection): { scope: WordPolicyScope; id?: string } | null {
  switch (selection.rail) {
    case "platform":
    case "tenant":
      return { scope: selection.rail };
    case "keys":
      return selection.keyId ? { scope: "key", id: selection.keyId } : null;
    case "portal":
      return selection.endUser ? { scope: "end_user", id: selection.endUser.id } : null;
  }
}

const messageOf = (error: unknown, fallback: string) =>
  error instanceof Error && error.message ? error.message : fallback;

/**
 * 「敏感词」标签：左边是规则集清单（平台、本租户、API Key 专属、门户账号），右边编辑选中的那一份。
 *
 * 检查顺序是平台 → 本租户（含 Key 的调整）→ 门户账号自己的词，后面的层只能在前面的基础上增加，
 * 不能关掉前面的。切换规则集时如果有未保存的修改，先确认再丢弃。
 */
export function WordPoliciesTab({ canWrite, canTest, portalSupported, onDirtyChange }: WordPoliciesTabProps) {
  const { t } = useTranslation();
  const [overview, setOverview] = useState<WordPolicyOverview | null>(null);
  const [overviewError, setOverviewError] = useState("");
  const [selection, setSelection] = useState<Selection>({ rail: "tenant", keyId: "", endUser: null });
  const [pending, setPending] = useState<Selection | null>(null);
  const [keyEntries, setKeyEntries] = useState<ApiKeyEntry[] | null>(null);
  const [keyListError, setKeyListError] = useState(false);

  const target = policyOf(selection);
  const targetKey = target ? `${target.scope}:${target.id ?? ""}` : "";
  const source = useMemo<WordPolicySource | null>(
    () =>
      target
        ? {
            id: targetKey,
            load: () => wordPolicyApi.get(target.scope, target.id),
            save: (input) => wordPolicyApi.put(target.scope, input, target.id),
            remove: () => wordPolicyApi.remove(target.scope, target.id),
          }
        : null,
    // targetKey 已经代表 target 的全部内容。
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [targetKey],
  );
  const editor = useWordPolicyDraft(source);

  useEffect(() => {
    onDirtyChange?.(editor.dirty);
    return () => onDirtyChange?.(false);
  }, [editor.dirty, onDirtyChange]);

  const loadOverview = useCallback(async () => {
    try {
      setOverview(await wordPolicyApi.overview());
      setOverviewError("");
    } catch (error) {
      setOverviewError(messageOf(error, t("content_moderation.words.load_failed")));
    }
  }, [t]);

  useEffect(() => {
    void loadOverview();
  }, [loadOverview]);

  // Key 的清单只在要选 Key 时才取：明文密钥也在这个接口里，没必要为不用它的人拉一遍。
  useEffect(() => {
    if (selection.rail !== "keys" || keyEntries !== null) return;
    let cancelled = false;
    apiKeyEntriesApi
      .list()
      .then((entries) => {
        if (!cancelled) setKeyEntries(entries);
      })
      .catch(() => {
        if (cancelled) return;
        // 取不到清单（例如没有查看 Key 的权限）时，仍可编辑已有专属规则的那些 Key。
        setKeyEntries([]);
        setKeyListError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [keyEntries, selection.rail]);

  const keyOptions = useMemo<SearchableSelectOption[]>(() => {
    const withPolicy = new Map((overview?.keys ?? []).map((item) => [item.key_id, item]));
    const seen = new Set<string>();
    const options: SearchableSelectOption[] = [];
    const trailing = (id: string) => {
      const brief = withPolicy.get(id);
      return brief ? (
        <span className="text-xs text-ink-3">{t("content_moderation.words.word_count", { count: brief.rule_count })}</span>
      ) : undefined;
    };
    for (const entry of keyEntries ?? []) {
      if (!entry.id) continue;
      seen.add(entry.id);
      const name = entry.name?.trim() || t("content_moderation.words.unnamed_key");
      const masked = maskApiKey(entry.key);
      options.push({ value: entry.id, label: `${name} · ${masked}`, searchText: `${name} ${masked} ${entry.id}`, trailing: trailing(entry.id) });
    }
    // 清单里没有、但库里有专属规则的 Key（清单取不到，或 Key 已被删除）也要能选到，才有办法清理。
    for (const brief of overview?.keys ?? []) {
      if (seen.has(brief.key_id)) continue;
      const name = brief.key_name || brief.key_id;
      options.push({ value: brief.key_id, label: name, searchText: `${name} ${brief.key_id}`, trailing: trailing(brief.key_id) });
    }
    return options;
  }, [keyEntries, overview?.keys, t]);

  const select = (next: Selection) => {
    if (next.rail === selection.rail && next.keyId === selection.keyId && next.endUser?.id === selection.endUser?.id) {
      return;
    }
    if (editor.dirty) {
      setPending(next);
      return;
    }
    setSelection(next);
  };

  const validate: WordRuleValidator = (rules) =>
    wordPolicyApi.validate({
      scope: target?.scope ?? "tenant",
      ...(target?.scope === "key" ? { key_id: target.id } : {}),
      ...(target?.scope === "end_user" ? { end_user_id: target.id } : {}),
      rules,
    });

  if (overviewError) {
    return (
      <Callout
        tone="danger"
        role="alert"
        actions={
          <Button variant="secondary" size="sm" onClick={() => void loadOverview()}>
            {t("common.retry")}
          </Button>
        }
      >
        {overviewError}
      </Callout>
    );
  }
  if (!overview) return <SkeletonLines rows={6} />;

  const scopeTitle = (() => {
    if (!target) return "";
    if (target.scope === "key") {
      const label = keyOptions.find((option) => option.value === target.id)?.label;
      return t("content_moderation.words.editor_title_key", { name: label ?? target.id });
    }
    if (target.scope === "end_user") {
      return t("content_moderation.words.editor_title_end_user", {
        name: editor.view?.end_user_name || selection.endUser?.name || target.id,
      });
    }
    return t(`content_moderation.words.rail_${target.scope}`);
  })();

  const removal =
    target?.scope === "key"
      ? {
          label: t("content_moderation.words.remove_override"),
          title: t("content_moderation.words.remove_override_title"),
          consequence: t("content_moderation.words.remove_consequence_key"),
        }
      : target?.scope === "end_user"
        ? {
            label: t("content_moderation.words.remove_end_user"),
            title: t("content_moderation.words.remove_end_user_title"),
            consequence: t("content_moderation.words.remove_consequence_end_user"),
          }
        : {
            label: t("content_moderation.words.remove_policy"),
            title: t("content_moderation.words.remove_policy_title", { scope: scopeTitle }),
            consequence: t("content_moderation.words.remove_consequence_policy"),
          };

  const notices = (
    <>
      {/* 运营方用 CLIRELAY_WORD_GUARD 关掉了检查：这里存的规则不会生效，别让人以为在拦。 */}
      {overview.guard_enabled === false ? (
        <Callout tone="warning" role="status" title={t("content_moderation.words.guard_off_title")}>
          {t("content_moderation.words.guard_off_description")}
        </Callout>
      ) : null}
      {target?.scope === "platform" && !overview.can_manage_platform ? (
        <Callout tone="info">{t("content_moderation.words.platform_read_only")}</Callout>
      ) : null}
      {target?.scope === "end_user" && editor.view?.end_user_allowed === false ? (
        <Callout tone="warning" role="status">
          {t("content_moderation.words.end_user_not_allowed")}
        </Callout>
      ) : null}
    </>
  );

  return (
    // 宽屏两栏钉满一屏（页面声明 data-page-fill="lg"）：顶部标签和左侧规则集清单不动，右侧内容自己
    // 占满剩余高度——列表在内部滚动，分页条和保存栏始终看得见。以前整页一起滚，左栏靠 sticky
    // 勉强留住，顶部标签却被滚走，分页条也要滚到底才看得到。窄屏上下堆叠，随页面流动。
    <div className="flex flex-col gap-6 lg:min-h-0 lg:flex-1 lg:flex-row">
      <aside className="lg:w-64 lg:shrink-0">
        <WordScopeRail
          overview={overview}
          value={selection.rail}
          showPortal={portalSupported}
          onChange={(rail) => select({ rail, keyId: rail === "keys" ? selection.keyId : "", endUser: null })}
        />
        <p className="mt-3 hidden px-3 text-xs leading-5 text-ink-3 lg:block">{t("content_moderation.words.rail_order_hint")}</p>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col gap-4 lg:min-h-0">
        {selection.rail === "keys" ? (
          <div className="space-y-3">
            <div className="w-full sm:w-96">
              <SearchableSelect
                value={selection.keyId}
                options={keyOptions}
                placeholder={t("content_moderation.words.key_placeholder")}
                searchPlaceholder={t("content_moderation.words.key_search")}
                aria-label={t("content_moderation.words.key_label")}
                onChange={(keyId) => select({ rail: "keys", keyId, endUser: null })}
              />
            </div>
            {keyListError ? <Callout tone="warning">{t("content_moderation.words.key_list_failed")}</Callout> : null}
          </div>
        ) : null}

        {selection.rail === "portal" && selection.endUser ? (
          <Button
            variant="ghost"
            size="sm"
            className="self-start"
            onClick={() => select({ rail: "portal", keyId: "", endUser: null })}
          >
            <ArrowLeft size={14} />
            {t("content_moderation.words.back_to_portal")}
          </Button>
        ) : null}

        {selection.rail === "portal" && !selection.endUser ? (
          <PortalAccessPanel
            canWrite={canWrite}
            onOpenUser={(user: WordPortalUser) =>
              select({ rail: "portal", keyId: "", endUser: { id: user.id, name: user.display_name || user.username } })
            }
            onChanged={() => void loadOverview()}
          />
        ) : selection.rail === "keys" && !selection.keyId ? (
          <EmptyState
            title={t("content_moderation.words.key_empty_title")}
            description={t("content_moderation.words.key_empty_description")}
            icon={<KeyRound size={32} />}
          />
        ) : target ? (
          <WordPolicyEditor
            editor={editor}
            scope={target.scope}
            title={scopeTitle}
            description={t(`content_moderation.words.scope_hint_${target.scope}`)}
            limits={overview.limits}
            readOnly={!canWrite}
            canTest={canTest}
            validate={validate}
            runTest={(input, draft) =>
              wordPolicyApi.test({
                input,
                scope: target.scope,
                ...(target.scope === "key" ? { key_id: target.id } : {}),
                ...(target.scope === "end_user" ? { end_user_id: target.id } : {}),
                ...(draft ? { draft } : {}),
              })
            }
            testDescription={t("content_moderation.words.test_description_admin")}
            notices={notices}
            removal={removal}
            onChanged={() => void loadOverview()}
          />
        ) : null}
      </div>

      <ConfirmModal
        open={pending !== null}
        title={t("content_moderation.words.discard_title")}
        description={t("content_moderation.words.discard_description")}
        confirmText={t("content_moderation.words.discard_confirm")}
        variant="warning"
        onClose={() => setPending(null)}
        onConfirm={() => {
          if (pending) setSelection(pending);
          setPending(null);
        }}
      />
    </div>
  );
}
