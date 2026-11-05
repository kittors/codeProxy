import { useEffect, useId, useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { FlaskConical, RotateCcw, Save, Trash2 } from "lucide-react";
import type {
  WordPolicyInput,
  WordPolicyLimits,
  WordPolicyScope,
  WordRuleKind,
  WordTestResult,
} from "@code-proxy/api-client";
import {
  Button,
  Callout,
  ConfirmModal,
  ScrollFade,
  SkeletonLines,
  Tabs,
  TabsList,
  TabsTrigger,
  ToggleSwitch,
  surface,
  useToast,
} from "@code-proxy/ui";
import { WordActionPicker } from "./WordActionPicker";
import { WordAdvancedSettings } from "./WordAdvancedSettings";
import { WordImportModal } from "./WordImportModal";
import { WordQuickAdd } from "./WordQuickAdd";
import { WordRuleModal } from "./WordRuleModal";
import { WordRuleTable } from "./WordRuleTable";
import { WordTestDialog } from "./WordTestDialog";
import type { WordPolicyDraftState } from "./useWordPolicyDraft";
import {
  applyRuleFields,
  createDraftRule,
  inputFromDraft,
  unboundedRegexKeys,
  type DraftRule,
  type WordRuleFields,
  type WordRuleValidator,
} from "./wordPolicyModel";

export interface WordPolicyRemoval {
  /** 按钮上的字（「删除这一层的规则」「取消 Key 专属规则」）。 */
  label: string;
  title: string;
  consequence: string;
}

export interface WordPolicyEditorProps {
  editor: WordPolicyDraftState;
  /** 哪一层的策略：决定有哪些设置（Key 层能「跟随租户」）。 */
  scope: WordPolicyScope;
  title: ReactNode;
  description?: ReactNode;
  /** 一份策略能放多少规则；视图里自带的上限优先（门户账号的更小）。 */
  limits: WordPolicyLimits;
  readOnly: boolean;
  canTest: boolean;
  validate: WordRuleValidator;
  /** draft 是尚未保存的修改；没有修改时测已保存的规则。 */
  runTest: (input: string, draft: WordPolicyInput | undefined) => Promise<WordTestResult>;
  /** 测试弹窗里说明这次会检查哪些规则。 */
  testDescription: string;
  /** 放在编辑器最上面的提示（例如「这个账号还没有权限，规则不会生效」）。 */
  notices?: ReactNode;
  /** 不传就不提供删除。 */
  removal?: WordPolicyRemoval;
  /** 保存或删除成功之后（上层用它刷新概览里的计数）。 */
  onChanged?: () => void;
}

type RuleModalState = { open: boolean; rule: DraftRule | null; kind: WordRuleKind };
type EditorPanel = "rules" | "handling";

/**
 * 一份敏感词策略的编辑器，管理端各层级和门户共用。
 *
 * 分两页：「词表」是最常做的事（输入框回车即加，可一次粘贴很多个；列表搜索、分页），
 * 「命中处理」放命中后怎么处理和不常改的高级选项。分开是为了让词表独占剩余高度：上层给出
 * 确定高度时，列表在内部滚动，分页条和保存栏始终看得见；以前三段上下堆在一起，规则一多，
 * 分页条和处理方式都得把整页滚到底才找得到。
 *
 * 所有改动先进同一份草稿，有改动时底部才出现「保存 / 放弃」栏，两页都看得见；
 * 保存被拒（规则不合法）时在对应的行上标出原因，别处同时改过（版本冲突）则提示重新载入。
 */
export function WordPolicyEditor({
  editor,
  scope,
  title,
  description,
  limits: fallbackLimits,
  readOnly: readOnlyProp,
  canTest,
  validate,
  runTest,
  testDescription,
  notices,
  removal,
  onChanged,
}: WordPolicyEditorProps) {
  const { t } = useTranslation();
  const { notify } = useToast();
  const { view, draft } = editor;
  const [ruleModal, setRuleModal] = useState<RuleModalState>({ open: false, rule: null, kind: "keyword" });
  const [importOpen, setImportOpen] = useState(false);
  const [removeOpen, setRemoveOpen] = useState(false);
  const [testOpen, setTestOpen] = useState(false);
  const [panel, setPanel] = useState<EditorPanel>("rules");
  const panelIds = useId();
  const limits = view?.limits ?? fallbackLimits;
  const readOnly = readOnlyProp || view?.can_edit === false;

  // 关闭或刷新浏览器标签页会丢掉草稿：交给浏览器的离开确认。
  useEffect(() => {
    if (!editor.dirty) return;
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [editor.dirty]);

  // 回复过滤开着时，匹配长度不限的正则在流式回复里可能漏掉跨两个事件的匹配：在规则上标出来。
  const replyFilterOn = draft && view ? (draft.replyFilter ?? view.effective.reply_filter) : false;
  const unbounded = useMemo(
    () => (view && draft && replyFilterOn ? unboundedRegexKeys(view, draft) : new Set<string>()),
    [draft, replyFilterOn, view],
  );

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

  if (editor.loadError) {
    return (
      <Callout
        tone="danger"
        role="alert"
        actions={
          <Button variant="secondary" size="sm" onClick={() => void editor.reload()}>
            {t("common.retry")}
          </Button>
        }
      >
        {editor.loadError instanceof Error && editor.loadError.message
          ? editor.loadError.message
          : t("content_moderation.words.load_failed")}
      </Callout>
    );
  }
  if (!view || !draft) return <SkeletonLines rows={6} />;

  const save = async () => {
    const outcome = await editor.save();
    if (outcome === "saved") {
      notify({ type: "success", message: t("content_moderation.words.saved") });
      onChanged?.();
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
      onChanged?.();
    } else {
      notify({ type: "error", message: t("content_moderation.words.remove_failed") });
    }
  };

  const applyRule = (fields: WordRuleFields) => {
    const target = ruleModal.rule;
    editor.updateRules((rules) =>
      target
        ? rules.map((rule) => (rule.key === target.key ? applyRuleFields(rule, fields) : rule))
        : [createDraftRule(fields), ...rules],
    );
    setRuleModal({ open: false, rule: null, kind: "keyword" });
  };

  // 状态说的是现在真正在生效的东西（已保存的版本）；有改动时只说「保存后生效」，不拿草稿冒充。
  const savedActive = view.rules.filter((rule) => rule.enabled).length;
  const status = editor.dirty
    ? t("content_moderation.words.status_pending", { count: draft.rules.length })
    : !view.exists || view.rule_count === 0
      ? t("content_moderation.words.status_empty")
      : !view.enabled
        ? t("content_moderation.words.status_disabled", { count: view.rule_count })
        : t("content_moderation.words.status_active", { count: view.rules_hidden ? view.rule_count : savedActive });

  // 标签上直接写出现在命中后会怎么处理，停在词表页也知道。
  const actionLabel =
    scope === "key" && draft.action === ""
      ? t("content_moderation.words.action_inherit")
      : t(`content_moderation.words.action_${draft.action || view.effective.action}`);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <h3 className="text-base font-semibold text-ink">{title}</h3>
          {description ? <p className="text-xs leading-5 text-ink-3">{description}</p> : null}
          <p className="text-xs text-ink-2" data-testid="word-policy-status">
            {status}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="inline-flex items-center gap-2 text-sm text-ink-2">
            <ToggleSwitch
              checked={draft.enabled}
              disabled={readOnly}
              ariaLabel={t("content_moderation.words.setting_enabled")}
              onCheckedChange={(enabled) => editor.update({ enabled })}
            />
            {t("content_moderation.words.setting_enabled")}
          </label>
          {canTest ? (
            <Button variant="secondary" size="sm" onClick={() => setTestOpen(true)}>
              <FlaskConical size={14} />
              {t("content_moderation.words.test")}
            </Button>
          ) : null}
          {removal && !readOnly && view.exists ? (
            <Button
              variant="secondary-danger"
              size="sm"
              disabled={editor.saving || editor.removing}
              onClick={() => setRemoveOpen(true)}
            >
              <Trash2 size={14} />
              {removal.label}
            </Button>
          ) : null}
        </div>
      </header>

      {notices}

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
          title={t("content_moderation.words.problems_title", { count: editor.problems.total })}
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
              {t("content_moderation.words.problems_more", { count: editor.problems.total - 5 })}
            </p>
          ) : null}
        </Callout>
      ) : null}

      {editor.saveError ? (
        <Callout tone="danger" role="alert">
          {editor.saveError}
        </Callout>
      ) : null}

      <Tabs value={panel} onValueChange={(next) => setPanel(next as EditorPanel)} size="sm">
        <TabsList aria-label={t("content_moderation.words.panels_label")}>
          <TabsTrigger value="rules" id={`${panelIds}-tab-rules`} aria-controls={`${panelIds}-rules`}>
            {t("content_moderation.words.tab_rules")}{" "}
            <span className="tabular-nums text-ink-3">{view.rules_hidden ? view.rule_count : draft.rules.length}</span>
          </TabsTrigger>
          <TabsTrigger value="handling" id={`${panelIds}-tab-handling`} aria-controls={`${panelIds}-handling`}>
            {t("content_moderation.words.tab_handling")}{" "}
            <span className="text-ink-3">{actionLabel}</span>
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {/* 两页都保持挂载（只隐藏）：切过去再切回来，列表的搜索词和页码还在。 */}
      <div
        role="tabpanel"
        id={`${panelIds}-rules`}
        aria-labelledby={`${panelIds}-tab-rules`}
        hidden={panel !== "rules"}
        className="flex min-h-0 flex-1 flex-col gap-3"
      >
        {view.rules_hidden ? (
          // 平台的词表不给租户看：只说有多少条，免得把空列表读成「平台没设规则」。
          <Callout tone="info" title={t("content_moderation.words.rules_hidden_title", { count: view.rule_count })}>
            {t("content_moderation.words.rules_hidden_description")}
          </Callout>
        ) : (
          <>
            {readOnly ? null : (
              <WordQuickAdd
                rules={draft.rules}
                limits={limits}
                onAdd={(fresh) => editor.updateRules((rules) => [...fresh, ...rules])}
                onAddRegex={() => setRuleModal({ open: true, rule: null, kind: "regex" })}
                onImport={() => setImportOpen(true)}
              />
            )}
            <WordRuleTable
              rules={draft.rules}
              limits={limits}
              readOnly={readOnly}
              problems={problemByRule}
              unbounded={unbounded}
              onEdit={(rule) => setRuleModal({ open: true, rule, kind: rule.kind })}
              onToggle={(rule, enabled) =>
                editor.updateRules((rules) =>
                  rules.map((item) => (item.key === rule.key ? { ...item, enabled } : item)),
                )
              }
              onDelete={(rule) => editor.updateRules((rules) => rules.filter((item) => item.key !== rule.key))}
            />
          </>
        )}
      </div>

      {/* 卡片的投影伸出盒子一点：这一页自己滚动时用等量内边距和负边距留出位置，不被裁掉。 */}
      <ScrollFade
        role="tabpanel"
        id={`${panelIds}-handling`}
        aria-labelledby={`${panelIds}-tab-handling`}
        hidden={panel !== "handling"}
        className="-m-1 min-h-0 flex-1 space-y-6 overflow-y-auto p-1"
      >
        <WordActionPicker
          draft={draft}
          view={view}
          limits={limits}
          inheritable={scope === "key"}
          readOnly={readOnly}
          onChange={editor.update}
        />
        <WordAdvancedSettings
          draft={draft}
          view={view}
          keyScope={scope === "key"}
          readOnly={readOnly}
          unboundedRegex={unbounded.size}
          onChange={editor.update}
        />
      </ScrollFade>

      {!readOnly && editor.dirty ? (
        // 有改动才出现，贴在可视区底部：改了什么都不会因为滚动而找不到保存按钮。
        <div
          role="region"
          aria-label={t("content_moderation.words.status_unsaved")}
          className={`${surface({ tone: "card", radius: "2xl" })} sticky bottom-3 z-10 flex flex-wrap items-center justify-between gap-3 px-4 py-3`}
        >
          <p className="text-sm text-ink-2">{t("content_moderation.words.status_unsaved")}</p>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" disabled={editor.saving} onClick={editor.discard}>
              <RotateCcw size={14} />
              {t("content_moderation.words.discard")}
            </Button>
            <Button variant="primary" size="sm" loading={editor.saving} onClick={() => void save()}>
              <Save size={14} />
              {t("content_moderation.words.save")}
            </Button>
          </div>
        </div>
      ) : null}

      <WordRuleModal
        open={ruleModal.open}
        rule={ruleModal.rule}
        initialKind={ruleModal.kind}
        validate={validate}
        rules={draft.rules}
        limits={limits}
        onClose={() => setRuleModal({ open: false, rule: null, kind: "keyword" })}
        onSubmit={applyRule}
      />
      <WordImportModal
        open={importOpen}
        validate={validate}
        limits={limits}
        rules={draft.rules}
        onClose={() => setImportOpen(false)}
        onImport={(rules) => {
          editor.updateRules((current) => [...rules, ...current]);
          setImportOpen(false);
          notify({ type: "success", message: t("content_moderation.words.import_added", { count: rules.length }) });
        }}
      />
      <WordTestDialog
        open={testOpen}
        usesDraft={editor.dirty && !readOnly}
        description={testDescription}
        // 有未保存的改动就试草稿，让用户在保存前看到效果。
        run={(input) =>
          runTest(input, editor.dirty && !readOnly ? inputFromDraft(draft, view.version) : undefined)
        }
        onClose={() => setTestOpen(false)}
      />
      {removal ? (
        <ConfirmModal
          open={removeOpen}
          title={removal.title}
          description={t("content_moderation.words.remove_lead")}
          consequences={[removal.consequence]}
          confirmText={t("content_moderation.words.remove_confirm")}
          busy={editor.removing}
          onClose={() => setRemoveOpen(false)}
          onConfirm={() => void remove()}
        />
      ) : null}
    </div>
  );
}
