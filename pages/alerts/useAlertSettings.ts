import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ApiError,
  alertsApi,
  extractApiErrorCode,
  extractApiErrorDetails,
  type AlertSettings,
} from "@code-proxy/api-client";
import {
  buildUpdate,
  channelToWire,
  draftFromSettings,
  isDirty,
  validateDraft,
  type AlertDraft,
} from "./model";

export interface SaveError {
  message: string;
  code: string;
  /** 后端 details.field：能对上某个字段时在字段旁边再提示一次。 */
  field: string;
}

const toSaveError = (error: unknown): SaveError => {
  if (error instanceof ApiError) {
    const field = extractApiErrorDetails(error.payload).field;
    return {
      message: error.message,
      code: extractApiErrorCode(error.payload),
      field: typeof field === "string" ? field : "",
    };
  }
  return { message: error instanceof Error ? error.message : String(error), code: "", field: "" };
};

/**
 * 告警设置的读取、草稿和保存。
 *
 * 草稿放在页面这一层，而不是各个页签里：页签切换会卸载内容，改到一半的通道和阈值不能因此丢掉。
 * `baseline` 是后端最近一次给出的设置，「有没有改动」「放弃修改」「只提交改过的部分」都对着它。
 */
export function useAlertSettings(uiLanguage: string) {
  const [settings, setSettings] = useState<AlertSettings | null>(null);
  const [baseline, setBaseline] = useState<AlertDraft | null>(null);
  const [draft, setDraft] = useState<AlertDraft | null>(null);
  const [loadError, setLoadError] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<SaveError | null>(null);
  const [attempt, setAttempt] = useState(0);
  // 界面语言只用来给「从没保存过」的设置定语言的起点，取打开页面那一刻的值：之后切换界面语言
  // 不应该让草稿变脏，也不该触发重新读取。
  const [initialUiLanguage] = useState(uiLanguage);

  const apply = useCallback(
    (next: AlertSettings) => {
      const nextDraft = draftFromSettings(next, initialUiLanguage);
      setSettings(next);
      setBaseline(nextDraft);
      setDraft(nextDraft);
    },
    [initialUiLanguage],
  );

  useEffect(() => {
    const controller = new AbortController();
    setLoadError("");
    alertsApi
      .getSettings({ signal: controller.signal })
      .then((next) => {
        if (!controller.signal.aborted) apply(next);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setLoadError(error instanceof Error ? error.message : String(error));
      });
    return () => controller.abort();
  }, [apply, attempt]);

  const update = useCallback((producer: (current: AlertDraft) => AlertDraft) => {
    setDraft((current) => (current ? producer(current) : current));
    setSaveError(null);
  }, []);

  const dirty = useMemo(
    () => (baseline && draft ? isDirty(baseline, draft) : false),
    [baseline, draft],
  );
  const issues = useMemo(() => (draft ? validateDraft(draft) : {}), [draft]);
  // 通道行上的「未保存」标记：新增的，或和后端那份不一样的。
  const changedChannelKeys = useMemo(() => {
    if (!baseline || !draft) return new Set<string>();
    const saved = new Map(baseline.channels.map((c) => [c.key, JSON.stringify(channelToWire(c))]));
    return new Set(
      draft.channels
        .filter((c) => saved.get(c.key) !== JSON.stringify(channelToWire(c)))
        .map((c) => c.key),
    );
  }, [baseline, draft]);

  const save = useCallback(async (): Promise<boolean> => {
    if (!settings || !baseline || !draft) return false;
    setSaving(true);
    setSaveError(null);
    try {
      apply(
        await alertsApi.updateSettings(
          buildUpdate(baseline, draft, { firstSave: !settings.updated_at }),
        ),
      );
      return true;
    } catch (error: unknown) {
      setSaveError(toSaveError(error));
      return false;
    } finally {
      setSaving(false);
    }
  }, [apply, baseline, draft, settings]);

  const discard = useCallback(() => {
    setDraft(baseline);
    setSaveError(null);
  }, [baseline]);

  const reload = useCallback(() => setAttempt((value) => value + 1), []);

  return {
    status: draft ? ("ready" as const) : loadError ? ("error" as const) : ("loading" as const),
    loadError,
    settings,
    draft,
    dirty,
    issues,
    changedChannelKeys,
    saving,
    saveError,
    update,
    save,
    discard,
    reload,
  };
}
