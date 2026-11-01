import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ApiError, loopGuardApi, type LoopGuardTenantView } from "@code-proxy/api-client";
import { Button, Callout, useToast } from "@code-proxy/ui";
import {
  draftFromTenant,
  LoopGuardFields,
  loopGuardWriteOf,
  useLoopGuardDraft,
} from "@features/loop-guard";
import { useOptionalAuth } from "@app/providers/AuthProvider";

/**
 * 「循环保护」分区：租户一层的两个开关和阈值，两项默认都关。
 *
 * 和同页的 Codex 准入、指标接口一样直接调用接口、不走页面底部的保存条，但这里有自己的「保存」：
 * 一次改几项再一起生效，比每拨一下开关就立刻改变线上行为稳妥——打开它会截断用户收到的回复。
 * 只在后端有这个接口时由配置页挂上（见 useLoopGuardTenant）。
 */
export function LoopGuardPanel({ initial }: { initial: LoopGuardTenantView }) {
  const { t } = useTranslation();
  const { notify } = useToast();
  const auth = useOptionalAuth();
  const canWrite = auth?.can("tenant_settings.write") ?? true;
  const [saved, setSaved] = useState(initial);
  const [saving, setSaving] = useState(false);
  const baseline = useMemo(() => draftFromTenant(saved), [saved]);
  const form = useLoopGuardDraft(baseline, saved);
  // 没接数据库的后端写不进设置（后端回 503），控件直接锁住并说明原因。
  const locked = !saved.persistent || !canWrite;

  const save = async () => {
    if (!form.validate()) return;
    setSaving(true);
    try {
      const next = await loopGuardApi.putTenant(loopGuardWriteOf(form.draft, "tenant"));
      setSaved(next);
      form.reset(draftFromTenant(next));
      notify({ type: "success", message: t("loop_guard.saved") });
    } catch (error: unknown) {
      if (error instanceof ApiError && error.status === 409) {
        // 别人在这期间改过：保住用户正在编辑的内容，只把「已保存」的基准换成最新的，
        // 用户核对后再点一次保存就是有意覆盖。
        try {
          const latest = await loopGuardApi.getTenant();
          if (latest) setSaved(latest);
        } catch {
          // 读不到最新值也不影响提示：再点一次保存会再读到冲突或成功。
        }
        notify({ type: "error", message: t("loop_guard.conflict") });
      } else {
        notify({
          type: "error",
          message:
            error instanceof Error && error.message ? error.message : t("loop_guard.save_failed"),
        });
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div data-testid="loop-guard-panel" className="space-y-3">
      {!saved.persistent ? (
        <Callout tone="warning">{t("loop_guard.not_persistent")}</Callout>
      ) : !canWrite ? (
        <Callout tone="neutral">{t("loop_guard.read_only")}</Callout>
      ) : null}

      <LoopGuardFields
        scope="tenant"
        idPrefix="loop-guard-tenant"
        draft={form.draft}
        info={saved}
        errors={form.errors}
        fallbacks={{
          replyWindow: saved.defaults.reply_window,
          replyMaxDistinct: saved.defaults.reply_max_distinct,
          toolRepeats: saved.defaults.tool_repeats,
        }}
        disabled={locked || saving}
        onChange={form.patch}
        onTouch={form.touch}
      />

      {saved.key_overrides > 0 ? (
        <p className="px-1 text-xs text-ink-3">
          {t("loop_guard.key_overrides", { count: saved.key_overrides })}
        </p>
      ) : null}

      {locked ? null : (
        <div className="flex justify-end gap-2">
          <Button
            variant="secondary"
            disabled={!form.dirty || saving}
            onClick={() => form.reset(baseline)}
          >
            {t("loop_guard.revert")}
          </Button>
          <Button
            variant="primary"
            loading={saving}
            disabled={!form.dirty}
            onClick={() => void save()}
          >
            {t("common.save")}
          </Button>
        </div>
      )}
    </div>
  );
}
