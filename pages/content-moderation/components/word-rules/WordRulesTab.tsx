import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { FlaskConical, RefreshCw, RotateCcw, Save, ShieldCheck, Trash2 } from "lucide-react";
import {
  apiKeyEntriesApi,
  wordPolicyApi,
  type ApiKeyEntry,
  type WordPolicyOverview,
  type WordPolicyScope,
} from "@code-proxy/api-client";
import { maskApiKey } from "@code-proxy/domain";
import {
  Button,
  Callout,
  Card,
  ConfirmModal,
  EmptyState,
  SearchableSelect,
  SegmentedControl,
  SkeletonLines,
  useToast,
  type SearchableSelectOption,
} from "@code-proxy/ui";
import type { WordTestTarget } from "../ModerationTestModal";
import { WordImportModal } from "./WordImportModal";
import { WordPolicySettings } from "./WordPolicySettings";
import { WordRuleList } from "./WordRuleList";
import { WordRuleModal, type WordRuleFields } from "./WordRuleModal";
import { createDraftRule, inputFromDraft, type DraftRule } from "./wordPolicyModel";
import { useWordPolicyEditor } from "./useWordPolicyEditor";

export interface WordRulesTabProps {
  canWrite: boolean;
  canTest: boolean;
  /** 测试弹窗由页面持有（和审核配置的测试共用同一个弹窗）。 */
  onTest: (target: WordTestTarget) => void;
}

interface PendingSwitch {
  scope: WordPolicyScope;
  keyId: string;
}

const SCOPES: readonly WordPolicyScope[] = ["platform", "tenant", "key"];

const messageOf = (error: unknown, fallback: string) =>
  error instanceof Error && error.message ? error.message : fallback;

/**
 * 「敏感词规则」：平台（所有租户共用，租户只读）、租户默认、单把 API Key 的覆盖，三层各一份策略。
 *
 * 改动先落在本地草稿里，点「保存」才整份提交；切换层级或 Key 时有未保存的改动会先确认，
 * 保存被拒（规则不合法）时在对应的行上标出原因，别处同时改过（版本冲突）则提示重新载入。
 * 只有后端声明支持（`capabilities.word_guard`）时页面才会显示这一页——旧后端没有这些接口。
 */
export function WordRulesTab({ canWrite, canTest, onTest }: WordRulesTabProps) {
  const { t } = useTranslation();
  const { notify } = useToast();
  const [overview, setOverview] = useState<WordPolicyOverview | null>(null);
  const [overviewError, setOverviewError] = useState("");
  const [scope, setScope] = useState<WordPolicyScope>("tenant");
  const [keyId, setKeyId] = useState("");
  const [keyEntries, setKeyEntries] = useState<ApiKeyEntry[] | null>(null);
  const [keyListError, setKeyListError] = useState(false);
  const [ruleModal, setRuleModal] = useState<{ open: boolean; rule: DraftRule | null }>({
    open: false,
    rule: null,
  });
  const [importOpen, setImportOpen] = useState(false);
  const [removeOpen, setRemoveOpen] = useState(false);
  const [pending, setPending] = useState<PendingSwitch | null>(null);
  const editor = useWordPolicyEditor(scope, keyId);
  const { view, draft } = editor;

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
    if (scope !== "key" || keyEntries !== null) return;
    let cancelled = false;
    apiKeyEntriesApi
      .list()
      .then((entries) => {
        if (!cancelled) setKeyEntries(entries);
      })
      .catch(() => {
        if (cancelled) return;
        // 取不到清单（例如没有查看 Key 的权限）时，仍可编辑已有覆盖的那些 Key。
        setKeyEntries([]);
        setKeyListError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [keyEntries, scope]);

  const keyOptions = useMemo<SearchableSelectOption[]>(() => {
    const withPolicy = new Map((overview?.keys ?? []).map((item) => [item.key_id, item]));
    const seen = new Set<string>();
    const options: SearchableSelectOption[] = [];
    const trailing = (id: string) => {
      const brief = withPolicy.get(id);
      return brief ? (
        <span className="text-xs text-ink-3">
          {t("content_moderation.words.key_rule_count", { count: brief.rule_count })}
        </span>
      ) : undefined;
    };
    for (const entry of keyEntries ?? []) {
      if (!entry.id) continue;
      seen.add(entry.id);
      const name = entry.name?.trim() || t("content_moderation.words.unnamed_key");
      const masked = maskApiKey(entry.key);
      options.push({
        value: entry.id,
        label: `${name} · ${masked}`,
        searchText: `${name} ${masked} ${entry.id}`,
        trailing: trailing(entry.id),
      });
    }
    // 清单里没有、但库里有覆盖的 Key（清单取不到，或 Key 已被删除）也要能选到，才有办法清理。
    for (const brief of overview?.keys ?? []) {
      if (seen.has(brief.key_id)) continue;
      const name = brief.key_name || brief.key_id;
      options.push({
        value: brief.key_id,
        label: name,
        searchText: `${name} ${brief.key_id}`,
        trailing: trailing(brief.key_id),
      });
    }
    return options;
  }, [keyEntries, overview?.keys, t]);

  const requestSwitch = (next: PendingSwitch) => {
    if (next.scope === scope && next.keyId === keyId) return;
    if (editor.dirty) {
      setPending(next);
      return;
    }
    setScope(next.scope);
    setKeyId(next.keyId);
  };

  const readOnly = !canWrite || !view?.can_edit;
  const limits = overview?.limits;

  // 上次保存被拒时，把原因按位置对到草稿里的规则上。
  const problemByRule = useMemo(() => {
    const map = new Map<string, string>();
    if (!editor.problems || !draft) return map;
    for (const problem of editor.problems.problems) {
      const rule = draft.rules[problem.index];
      if (rule) map.set(rule.key, problem.message);
    }
    return map;
  }, [draft, editor.problems]);

  const save = async () => {
    const outcome = await editor.save();
    if (outcome === "saved") {
      notify({ type: "success", message: t("content_moderation.words.saved") });
      void loadOverview();
    } else if (outcome === "invalid") {
      notify({ type: "error", message: t("content_moderation.words.save_refused") });
    } else if (outcome === "failed") {
      notify({ type: "error", message: t("content_moderation.words.save_failed") });
    }
  };

  const remove = async () => {
    const removed = await editor.remove();
    setRemoveOpen(false);
    if (removed) {
      notify({ type: "success", message: t("content_moderation.words.removed") });
      void loadOverview();
    } else {
      notify({ type: "error", message: t("content_moderation.words.remove_failed") });
    }
  };

  const applyRule = (fields: WordRuleFields) => {
    const target = ruleModal.rule;
    editor.updateRules((rules) =>
      target
        ? rules.map((rule) =>
            rule.key === target.key
              ? { ...rule, ...fields, note: fields.note === "" ? undefined : fields.note }
              : rule,
          )
        : [createDraftRule(fields), ...rules],
    );
    setRuleModal({ open: false, rule: null });
  };

  const startTest = () => {
    if (!view || !draft) return;
    onTest({
      scope,
      ...(scope === "key" ? { keyId } : {}),
      // 有未保存的改动就试草稿，让用户在保存前看到效果。
      ...(editor.dirty && !readOnly ? { draft: inputFromDraft(draft, view.version) } : {}),
    });
  };

  const scopeTitle = t(`content_moderation.words.scope_${scope}`);
  const selectedKeyName = keyOptions.find((option) => option.value === keyId)?.label;

  return (
    <>
      <Card
        flat
        title={t("content_moderation.words.title")}
        description={t("content_moderation.words.description")}
        actions={
          <Button
            variant="secondary"
            size="sm"
            disabled={editor.loading || editor.saving}
            onClick={() => {
              void loadOverview();
              void editor.reload();
            }}
          >
            <RefreshCw size={14} className={editor.loading ? "animate-spin" : ""} />
            {t("common.refresh")}
          </Button>
        }
      >
        {overviewError ? (
          <Callout
            tone="danger"
            role="alert"
            actions={
              <Button variant="secondary" size="sm" onClick={() => void loadOverview()}>
                {t("common.retry", { defaultValue: "Retry" })}
              </Button>
            }
          >
            {overviewError}
          </Callout>
        ) : !overview || !limits ? (
          <SkeletonLines rows={4} />
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <SegmentedControl<WordPolicyScope>
                value={scope}
                ariaLabel={t("content_moderation.words.scope_label")}
                options={SCOPES.map((value) => ({
                  value,
                  label: t(`content_moderation.words.scope_${value}`),
                }))}
                onChange={(next) => requestSwitch({ scope: next, keyId: next === "key" ? keyId : "" })}
              />
              {scope === "key" ? (
                <div className="w-full min-w-64 sm:w-96">
                  <SearchableSelect
                    value={keyId}
                    options={keyOptions}
                    placeholder={t("content_moderation.words.key_placeholder")}
                    searchPlaceholder={t("content_moderation.words.key_search")}
                    aria-label={t("content_moderation.words.key_label")}
                    onChange={(next) => requestSwitch({ scope: "key", keyId: next })}
                  />
                </div>
              ) : null}
            </div>
            <p className="text-xs leading-5 text-ink-3">
              {t(`content_moderation.words.scope_hint_${scope}`)}
            </p>

            {scope === "key" && keyListError ? (
              <Callout tone="warning">{t("content_moderation.words.key_list_failed")}</Callout>
            ) : null}

            {!editor.selected ? (
              <EmptyState
                title={t("content_moderation.words.key_empty_title")}
                description={t("content_moderation.words.key_empty_description")}
                icon={<ShieldCheck size={32} />}
              />
            ) : editor.loadError ? (
              <Callout
                tone="danger"
                role="alert"
                actions={
                  <Button variant="secondary" size="sm" onClick={() => void editor.reload()}>
                    {t("common.retry", { defaultValue: "Retry" })}
                  </Button>
                }
              >
                {editor.loadError}
              </Callout>
            ) : !view || !draft ? (
              <SkeletonLines rows={6} />
            ) : (
              <div className="space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h4 className="text-sm font-semibold text-ink">
                      {scope === "key" && selectedKeyName
                        ? t("content_moderation.words.editor_title_key", { name: selectedKeyName })
                        : scopeTitle}
                    </h4>
                    <p className="mt-0.5 text-xs text-ink-3">
                      {view.exists
                        ? t("content_moderation.words.status_saved", {
                            version: view.version,
                          })
                        : t("content_moderation.words.status_new")}
                      {editor.dirty ? ` · ${t("content_moderation.words.status_unsaved")}` : ""}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {canTest ? (
                      <Button variant="secondary" size="sm" onClick={startTest}>
                        <FlaskConical size={14} />
                        {t("content_moderation.words.test")}
                      </Button>
                    ) : null}
                    {!readOnly && editor.dirty ? (
                      <Button
                        variant="secondary"
                        size="sm"
                        disabled={editor.saving}
                        onClick={editor.discard}
                      >
                        <RotateCcw size={14} />
                        {t("content_moderation.words.discard")}
                      </Button>
                    ) : null}
                    {!readOnly && view.exists ? (
                      <Button
                        variant="secondary-danger"
                        size="sm"
                        disabled={editor.saving || editor.removing}
                        onClick={() => setRemoveOpen(true)}
                      >
                        <Trash2 size={14} />
                        {scope === "key"
                          ? t("content_moderation.words.remove_override")
                          : t("content_moderation.words.remove_policy")}
                      </Button>
                    ) : null}
                    {!readOnly ? (
                      <Button
                        variant="primary"
                        size="sm"
                        loading={editor.saving}
                        disabled={!editor.dirty}
                        onClick={() => void save()}
                      >
                        <Save size={14} />
                        {t("content_moderation.words.save")}
                      </Button>
                    ) : null}
                  </div>
                </div>

                {scope === "platform" && readOnly ? (
                  <Callout tone="info">{t("content_moderation.words.platform_read_only")}</Callout>
                ) : null}

                {editor.conflict ? (
                  <Callout
                    tone="warning"
                    role="alert"
                    title={t("content_moderation.words.conflict_title")}
                    actions={
                      <Button variant="secondary" size="sm" onClick={() => void editor.reload()}>
                        {t("content_moderation.words.conflict_reload")}
                      </Button>
                    }
                  >
                    {t("content_moderation.words.conflict_description")}
                  </Callout>
                ) : null}

                {editor.problems ? (
                  <Callout
                    tone="danger"
                    role="alert"
                    title={t("content_moderation.words.problems_title", {
                      count: editor.problems.total,
                    })}
                  >
                    <ul className="mt-1 space-y-0.5 text-xs">
                      {editor.problems.problems.slice(0, 5).map((problem) => (
                        <li key={`${problem.index}:${problem.pattern}`}>
                          <span className="break-all font-mono text-ink">{problem.pattern}</span>
                          {" — "}
                          {problem.message}
                        </li>
                      ))}
                    </ul>
                    {editor.problems.total > 5 ? (
                      <p className="mt-1 text-xs">
                        {t("content_moderation.words.problems_more", {
                          count: editor.problems.total - 5,
                        })}
                      </p>
                    ) : null}
                  </Callout>
                ) : null}

                {editor.saveError ? (
                  <Callout tone="danger" role="alert">
                    {editor.saveError}
                  </Callout>
                ) : null}

                <WordPolicySettings
                  scope={scope}
                  draft={draft}
                  view={view}
                  limits={limits}
                  readOnly={readOnly}
                  onChange={editor.update}
                />

                <WordRuleList
                  rules={draft.rules}
                  limits={limits}
                  readOnly={readOnly}
                  problems={problemByRule}
                  onAdd={() => setRuleModal({ open: true, rule: null })}
                  onImport={() => setImportOpen(true)}
                  onEdit={(rule) => setRuleModal({ open: true, rule })}
                  onToggle={(rule, enabled) =>
                    editor.updateRules((rules) =>
                      rules.map((item) => (item.key === rule.key ? { ...item, enabled } : item)),
                    )
                  }
                  onDelete={(rule) =>
                    editor.updateRules((rules) => rules.filter((item) => item.key !== rule.key))
                  }
                />
              </div>
            )}
          </div>
        )}
      </Card>

      {limits && draft ? (
        <>
          <WordRuleModal
            open={ruleModal.open}
            rule={ruleModal.rule}
            scope={scope}
            keyId={keyId}
            rules={draft.rules}
            limits={limits}
            onClose={() => setRuleModal({ open: false, rule: null })}
            onSubmit={applyRule}
          />
          <WordImportModal
            open={importOpen}
            scope={scope}
            keyId={keyId}
            limits={limits}
            rules={draft.rules}
            onClose={() => setImportOpen(false)}
            onImport={(rules) => {
              editor.updateRules((current) => [...rules, ...current]);
              setImportOpen(false);
              notify({
                type: "success",
                message: t("content_moderation.words.import_added", { count: rules.length }),
              });
            }}
          />
        </>
      ) : null}

      <ConfirmModal
        open={removeOpen}
        title={
          scope === "key"
            ? t("content_moderation.words.remove_override_title")
            : t("content_moderation.words.remove_policy_title", { scope: scopeTitle })
        }
        description={t("content_moderation.words.remove_lead")}
        consequences={[
          scope === "key"
            ? t("content_moderation.words.remove_consequence_key")
            : t("content_moderation.words.remove_consequence_policy"),
        ]}
        confirmText={t("content_moderation.words.remove_confirm")}
        busy={editor.removing}
        onClose={() => setRemoveOpen(false)}
        onConfirm={() => void remove()}
      />

      <ConfirmModal
        open={pending !== null}
        title={t("content_moderation.words.discard_title")}
        description={t("content_moderation.words.discard_description")}
        confirmText={t("content_moderation.words.discard_confirm")}
        variant="warning"
        onClose={() => setPending(null)}
        onConfirm={() => {
          if (pending) {
            setScope(pending.scope);
            setKeyId(pending.keyId);
          }
          setPending(null);
        }}
      />
    </>
  );
}
