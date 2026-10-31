import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  isWordPolicyVersionConflict,
  readWordRuleProblems,
  wordPolicyApi,
  type WordPolicyScope,
  type WordPolicyView,
  type WordRuleProblems,
} from "@code-proxy/api-client";
import { draftFromView, inputFromDraft, type WordPolicyDraft } from "./wordPolicyModel";

export type WordSaveOutcome = "saved" | "invalid" | "conflict" | "failed";

const messageOf = (error: unknown): string => (error instanceof Error ? error.message : "");

/**
 * 编辑一份敏感词策略（平台 / 租户默认 / 某把 Key 的覆盖）：载入、本地草稿、整份保存、删除。
 *
 * - 保存发送整份策略并带上读到的 version：别处改过就是 409，不会悄悄覆盖别人的修改；
 * - 规则不合法时服务端返回 422 和每条问题规则的位置，这里原样保留，由页面标到对应的行上；
 * - 切换策略时旧响应可能晚于新请求返回，用序号丢掉过期的响应，避免把 A 的草稿画在 B 上。
 */
export function useWordPolicyEditor(scope: WordPolicyScope, keyId: string) {
  const [view, setView] = useState<WordPolicyView | null>(null);
  const [draft, setDraft] = useState<WordPolicyDraft | null>(null);
  const [baseline, setBaseline] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [problems, setProblems] = useState<WordRuleProblems | null>(null);
  const [saveError, setSaveError] = useState("");
  const [conflict, setConflict] = useState(false);
  const sequence = useRef(0);
  // Key 层要先选了一把 Key 才有策略可编辑。
  const selected = scope !== "key" || keyId !== "";

  const adopt = useCallback((next: WordPolicyView) => {
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
    setLoadError("");
    if (!selected) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const next = await wordPolicyApi.get(scope, keyId);
      if (mine === sequence.current) adopt(next);
    } catch (error) {
      if (mine === sequence.current) setLoadError(messageOf(error));
    } finally {
      if (mine === sequence.current) setLoading(false);
    }
  }, [adopt, keyId, scope, selected]);

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
    if (!view || !draft) return "failed";
    setSaving(true);
    setSaveError("");
    setProblems(null);
    setConflict(false);
    try {
      const saved = await wordPolicyApi.put(
        scope,
        inputFromDraft(draft, view.version),
        keyId || undefined,
      );
      adopt(saved);
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
  }, [adopt, draft, keyId, scope, view]);

  /** 删除整份策略（Key 层即「取消覆盖」）；成功后回到未保存过的初始状态。 */
  const remove = useCallback(async (): Promise<boolean> => {
    if (!view) return false;
    setRemoving(true);
    setSaveError("");
    try {
      await wordPolicyApi.remove(scope, keyId || undefined);
      await load();
      return true;
    } catch (error) {
      setSaveError(messageOf(error));
      return false;
    } finally {
      setRemoving(false);
    }
  }, [keyId, load, scope, view]);

  return {
    selected,
    view,
    draft,
    dirty,
    loading,
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

export type WordPolicyEditorState = ReturnType<typeof useWordPolicyEditor>;
