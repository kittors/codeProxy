import { useCallback, useEffect, useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { accessFreezesApi, type AccessFreezeSettings } from "@code-proxy/api-client";
import { Button, Callout, FormField, SkeletonLines, TextInput, useToast } from "@code-proxy/ui";
import { describeFreezeError } from "./format";

/** 「3」「0」这样的非负整数；留空、小数、负数、带字母的都不是。 */
function parseThreshold(draft: string): number | null {
  const trimmed = draft.trim();
  return /^\d{1,6}$/.test(trimmed) ? Number(trimmed) : null;
}

/**
 * 租户的冻结阈值：从上次解冻起，被上游以内容安全拒绝几次就冻结。0 只记录、不冻结。
 * 默认值和上限随响应来（后端定的），不在前端抄数字；没有写权限的只能看。
 *
 * 自己读取、自己保存：放在总览弹窗里，弹窗每次打开都是新的一份。
 */
export function FreezeThresholdSetting({ canWrite }: { canWrite: boolean }) {
  const { t } = useTranslation();
  const { notify } = useToast();
  const inputId = useId();
  const hintId = `${inputId}-hint`;
  const [settings, setSettings] = useState<AccessFreezeSettings | null>(null);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const loaded = await accessFreezesApi.getSettings();
      setSettings(loaded);
      setDraft(String(loaded.threshold));
    } catch (err) {
      setLoadError(err);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loadError) {
    return (
      <Callout
        tone="danger"
        role="alert"
        title={t("access_freeze.threshold_load_failed")}
        actions={
          <Button size="sm" variant="secondary" onClick={() => void load()}>
            {t("common.retry")}
          </Button>
        }
      >
        {describeFreezeError(t, loadError, t("access_freeze.threshold_load_failed"))}
      </Callout>
    );
  }
  if (!settings) {
    return (
      <div aria-busy="true">
        <SkeletonLines rows={3} />
      </div>
    );
  }

  const parsed = parseThreshold(draft);
  const outOfRange = parsed === null || parsed > settings.max_threshold;
  const unchanged = parsed === settings.threshold;

  const save = async () => {
    if (parsed === null || outOfRange) {
      setError(t("access_freeze.error_invalid_threshold_range", { max: settings.max_threshold }));
      return;
    }
    setSaving(true);
    setError("");
    try {
      const saved = await accessFreezesApi.putSettings(parsed);
      setSettings(saved);
      setDraft(String(saved.threshold));
      notify({ type: "success", message: t("access_freeze.threshold_saved") });
    } catch (err) {
      setError(describeFreezeError(t, err, t("access_freeze.threshold_save_failed")));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <p id={hintId} className="text-sm leading-6 text-ink-2">
        {t("access_freeze.threshold_hint", {
          default: settings.default_threshold,
          max: settings.max_threshold,
        })}
      </p>
      <form
        className="mt-3 flex flex-wrap items-end gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          if (canWrite && !unchanged) void save();
        }}
      >
        <FormField
          label={t("access_freeze.threshold_label")}
          reserveMeta={false}
          htmlFor={inputId}
          className="w-56"
        >
          <TextInput
            inputMode="numeric"
            autoComplete="off"
            value={draft}
            disabled={!canWrite || saving}
            aria-describedby={hintId}
            aria-invalid={error ? true : undefined}
            onChange={(event) => {
              setDraft(event.target.value);
              setError("");
            }}
          />
        </FormField>
        {canWrite ? (
          <Button type="submit" variant="primary" loading={saving} disabled={unchanged}>
            {t("access_freeze.threshold_save")}
          </Button>
        ) : (
          <span className="pb-2 text-xs text-ink-3">{t("access_freeze.threshold_read_only")}</span>
        )}
      </form>
      {error ? (
        <p role="alert" className="mt-2 text-xs leading-5 text-rose-600 dark:text-rose-400">
          {error}
        </p>
      ) : null}
      {parsed === 0 ? (
        <p className="mt-2 text-xs leading-5 text-ink-3">
          {t("access_freeze.threshold_zero_note")}
        </p>
      ) : null}
    </div>
  );
}
