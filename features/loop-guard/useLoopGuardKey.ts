import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ApiError, loopGuardApi, type LoopGuardKeyView } from "@code-proxy/api-client";
import { draftFromKey, loopGuardWriteOf, type LoopGuardDraft } from "./loopGuardDraft";
import { useLoopGuardDraft } from "./useLoopGuardDraft";

type KeyState =
  /** 还没发请求，或弹窗是关着的。 */
  | { status: "idle" }
  | { status: "loading" }
  /** 这个后端没有循环保护，或当前账号读不到：这一节整个不显示，Key 编辑照旧。 */
  | { status: "unavailable" }
  /** 读取失败（网络、5xx）：提示一句，Key 本身仍可保存。 */
  | { status: "failed"; message: string }
  | { status: "ready"; view: LoopGuardKeyView };

/** 旧后端没有这条路由（404），没有读权限是 403：都不是「出错」，是「没有这个功能」。 */
const isUnavailable = (error: unknown): boolean =>
  error instanceof ApiError && (error.status === 404 || error.status === 403);

const EMPTY_DRAFT: LoopGuardDraft = {
  replyMode: "inherit",
  replyWindow: "",
  replyMaxDistinct: "",
  toolMode: "inherit",
  toolRepeats: "",
};

const NO_INFO = {
  persistent: true,
  updated_at: "",
  defaults: { reply_window: 0, reply_max_distinct: 0, tool_repeats: 0 },
  bounds: {
    min_reply_window: 0,
    max_reply_window: 0,
    min_reply_distinct: 0,
    reply_distinct_window_share: 0,
    min_tool_repeats: 0,
    max_tool_repeats: 0,
  },
};

/**
 * 一把 API Key 的循环保护覆盖：在 Key 编辑弹窗打开时读取，保存由弹窗的提交流程调用。
 *
 * 弹窗每次打开都重新读（别人可能刚改过租户一层），关闭后丢弃。保存只在草稿有改动时才发请求：
 * 只改名称、不碰这一节的人不会产生一次多余的写入，也不会因为这一节读不到而保存失败。
 */
export function useLoopGuardKey(keyId: string | undefined, active: boolean) {
  const [state, setState] = useState<KeyState>({ status: "idle" });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [reloads, setReloads] = useState(0);
  // 保存按钮在写入期间会置灰，但键盘提交快捷键不看按钮：同一份草稿不能并发写两次。
  const writing = useRef(false);

  const view = state.status === "ready" ? state.view : null;
  const baseline = useMemo(() => (view ? draftFromKey(view) : EMPTY_DRAFT), [view]);
  const form = useLoopGuardDraft(baseline, view ?? NO_INFO);
  const { reset } = form;

  useEffect(() => {
    if (!active || !keyId) {
      setState({ status: "idle" });
      return;
    }
    let cancelled = false;
    setState({ status: "loading" });
    setSaveError("");
    void loopGuardApi
      .getKey(keyId)
      .then((next) => {
        if (cancelled) return;
        if (!next) {
          setState({ status: "unavailable" });
          return;
        }
        setState({ status: "ready", view: next });
        reset(draftFromKey(next));
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setState(
          isUnavailable(error)
            ? { status: "unavailable" }
            : {
                status: "failed",
                message: error instanceof Error ? error.message : "",
              },
        );
      });
    return () => {
      cancelled = true;
    };
  }, [active, keyId, reloads, reset]);

  const reload = useCallback(() => setReloads((count) => count + 1), []);

  /**
   * 保存这一节的改动。返回 false 表示不要继续保存 Key 本身：草稿无效（错误已显示出来），
   * 写入失败（原因在 saveError），或另一次保存还没结束（那一次自己会接着保存 Key）。
   * 没有要保存的东西（没读到、没改动）返回 true。
   */
  const save = useCallback(async (): Promise<boolean> => {
    if (writing.current) return false;
    if (!keyId || !view || !form.dirty) return true;
    if (!form.validate()) return false;
    writing.current = true;
    setSaving(true);
    setSaveError("");
    try {
      const saved = await loopGuardApi.putKey(keyId, loopGuardWriteOf(form.draft, "key"));
      setState({ status: "ready", view: saved });
      reset(draftFromKey(saved));
      return true;
    } catch (error: unknown) {
      setSaveError(error instanceof Error ? error.message : "");
      return false;
    } finally {
      writing.current = false;
      setSaving(false);
    }
  }, [form, keyId, reset, view]);

  return { state, view, form, saving, saveError, reload, save };
}

export type LoopGuardKeyOverride = ReturnType<typeof useLoopGuardKey>;
