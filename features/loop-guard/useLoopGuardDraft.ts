import { useCallback, useMemo, useState } from "react";
import type { LoopGuardInfo } from "@code-proxy/api-client";
import {
  hasLoopGuardErrors,
  loopGuardDraftsEqual,
  validateLoopGuardDraft,
  type LoopGuardDraft,
  type LoopGuardDraftErrors,
  type LoopGuardField,
} from "./loopGuardDraft";

/**
 * 一份循环保护草稿的编辑状态：草稿本身、是否有改动、校验错误。
 *
 * 错误只在用户离开过那个输入框、或试过保存之后才显示——边输入边报「窗口太小」会在输入 128 的
 * 中途闪出 1、12 的错误。baseline 是已保存的值，换了新的（保存成功、重新读取）由持有者调用
 * reset 同时换掉草稿；没有这个自动同步是有意的：保存冲突时要保住用户的改动，只更新 baseline。
 */
export function useLoopGuardDraft(baseline: LoopGuardDraft, info: LoopGuardInfo) {
  const [draft, setDraft] = useState(baseline);
  const [touched, setTouched] = useState<ReadonlySet<LoopGuardField>>(() => new Set());
  const [attempted, setAttempted] = useState(false);

  const allErrors = useMemo(() => validateLoopGuardDraft(draft, info), [draft, info]);
  const errors = useMemo<LoopGuardDraftErrors>(() => {
    if (attempted) return allErrors;
    const shown: LoopGuardDraftErrors = {};
    for (const field of touched) {
      const error = allErrors[field];
      if (error) shown[field] = error;
    }
    return shown;
  }, [allErrors, attempted, touched]);

  const patch = useCallback((next: Partial<LoopGuardDraft>) => {
    setDraft((current) => ({ ...current, ...next }));
  }, []);

  const touch = useCallback((field: LoopGuardField) => {
    setTouched((current) => (current.has(field) ? current : new Set(current).add(field)));
  }, []);

  const reset = useCallback((next: LoopGuardDraft) => {
    setDraft(next);
    setTouched(new Set());
    setAttempted(false);
  }, []);

  /** 保存前调用：有错误时让所有错误显示出来并返回 false。 */
  const validate = useCallback((): boolean => {
    if (!hasLoopGuardErrors(allErrors)) return true;
    setAttempted(true);
    return false;
  }, [allErrors]);

  return {
    draft,
    patch,
    touch,
    reset,
    validate,
    errors,
    dirty: !loopGuardDraftsEqual(draft, baseline),
  };
}
