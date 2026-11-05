import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  isWordPolicyVersionConflict,
  readWordRuleProblems,
  type WordPolicyInput,
  type WordPolicyView,
  type WordRuleProblems,
} from "@code-proxy/api-client";
import { draftFromView, inputFromDraft, type WordPolicyDraft } from "./wordPolicyModel";

export type WordSaveOutcome = "saved" | "invalid" | "conflict" | "failed";

/**
 * 一份敏感词策略从哪里读、存到哪里。管理端（平台 / 租户 / Key / 门户账号）和门户（账号自己的）
 * 各给一个，编辑逻辑共用。`id` 换了就是换了一份策略：草稿丢弃、重新载入。
 */
export interface WordPolicySource<View extends WordPolicyView = WordPolicyView> {
  id: string;
  load: () => Promise<View>;
  save: (input: WordPolicyInput) => Promise<View>;
  remove: () => Promise<unknown>;
}

const messageOf = (error: unknown): string => (error instanceof Error ? error.message : "");

/**
 * 编辑一份敏感词策略：载入、本地草稿、整份保存、删除。
 *
 * - 保存发送整份策略并带上读到的 version：别处改过就是 409，不会悄悄覆盖别人的修改；
 * - 规则不合法时服务端返回 422 和每条问题规则的位置，这里原样保留，由界面标到对应的行上；
 * - 切换策略时旧响应可能晚于新请求返回，用序号丢掉过期的响应，避免把 A 的草稿画在 B 上。
 *
 * source 为 null 表示还没选中要编辑的策略（例如还没选 Key）。调用方每次渲染可以新建 source 对象，
 * 只有 id 变化才会重新载入。
 */
export function useWordPolicyDraft<View extends WordPolicyView = WordPolicyView>(
  source: WordPolicySource<View> | null,
) {
  const [view, setView] = useState<View | null>(null);
  const [draft, setDraft] = useState<WordPolicyDraft | null>(null);
  const [baseline, setBaseline] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [problems, setProblems] = useState<WordRuleProblems | null>(null);
  const [saveError, setSaveError] = useState("");
  const [conflict, setConflict] = useState(false);
  const sequence = useRef(0);
  const sourceRef = useRef(source);
  sourceRef.current = source;
  const sourceId = source?.id ?? "";

  const adopt = useCallback((next: View) => {
    const nextDraft = draftFromView(next);
    setView(next);
    setDraft(nextDraft);
    setBaseline(JSON.stringify(nextDraft));
    setProblems(null);
    setSaveError("");
    setConflict(false);
  }, []);

  const load = useCallback(async () => {
    const mine = ++sequence.current;
    setView(null);
    setDraft(null);
    setBaseline("");
    setProblems(null);
    setSaveError("");
    setConflict(false);
    setLoadError(null);
    const current = sourceRef.current;
    if (!current) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const next = await current.load();
      if (mine === sequence.current) adopt(next);
    } catch (error) {
      if (mine === sequence.current) setLoadError(error ?? new Error(""));
    } finally {
      if (mine === sequence.current) setLoading(false);
    }
    // sourceId 代表 source：同一份策略的 source 对象每次渲染都可能是新的，不能因此重新载入。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adopt, sourceId]);

  useEffect(() => {
    void load();
    // 组件卸载后到达的响应不再写状态。
    return () => {
      sequence.current += 1;
    };
  }, [load]);

  const dirty = useMemo(
    () => draft !== null && JSON.stringify(draft) !== baseline,
    [baseline, draft],
  );

  const update = useCallback((patch: Partial<WordPolicyDraft>) => {
    setDraft((current) => (current ? { ...current, ...patch } : current));
  }, []);

  const updateRules = useCallback(
    (change: (rules: WordPolicyDraft["rules"]) => WordPolicyDraft["rules"]) => {
      setDraft((current) => (current ? { ...current, rules: change(current.rules) } : current));
      // 被拒的规则是按提交时的位置报的，列表一变位置就对不上了：不再指着可能错位的行。
      setProblems(null);
    },
    [],
  );

  const discard = useCallback(() => {
    if (!view) return;
    adopt(view);
  }, [adopt, view]);

  const save = useCallback(async (): Promise<WordSaveOutcome> => {
    const current = sourceRef.current;
    if (!view || !draft || !current) return "failed";
    setSaving(true);
    setSaveError("");
    setProblems(null);
    setConflict(false);
    try {
      adopt(await current.save(inputFromDraft(draft, view.version)));
      return "saved";
    } catch (error) {
      const found = readWordRuleProblems(error);
      if (found) {
        setProblems(found);
        return "invalid";
      }
      if (isWordPolicyVersionConflict(error)) {
        setConflict(true);
        return "conflict";
      }
      setSaveError(messageOf(error));
      return "failed";
    } finally {
      setSaving(false);
    }
  }, [adopt, draft, view]);

  /** 删除整份策略；成功后回到未保存过的初始状态。 */
  const remove = useCallback(async (): Promise<boolean> => {
    const current = sourceRef.current;
    if (!view || !current) return false;
    setRemoving(true);
    setSaveError("");
    try {
      await current.remove();
      await load();
      return true;
    } catch (error) {
      setSaveError(messageOf(error));
      return false;
    } finally {
      setRemoving(false);
    }
  }, [load, view]);

  return {
    selected: source !== null,
    view,
    draft,
    dirty,
    loading,
    /** 载入失败的原始错误（门户要据此认出 403「管理员没有允许」）；没有失败时为 null。 */
    loadError,
    saving,
    removing,
    problems,
    saveError,
    conflict,
    reload: load,
    update,
    updateRules,
    discard,
    save,
    remove,
  };
}

export type WordPolicyDraftState<View extends WordPolicyView = WordPolicyView> = ReturnType<
  typeof useWordPolicyDraft<View>
>;
