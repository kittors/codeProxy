import { useEffect, useState } from "react";
import type { EndUserAPIKey } from "@code-proxy/api-client";
import { Callout, ConfirmModal } from "@code-proxy/ui";

/**
 * 门户里删除自己的一把 API Key。
 *
 * 对象卡片写清删的是哪一把（名称 + 掩码），后果单独列出。删除失败时把原因留在弹窗里
 * （以前失败了没有任何提示，弹窗一直转圈后恢复原样）。账号至少要保留一把 Key：
 * 表格里的删除入口在只剩一把时已经置灰并写明原因；弹窗打开期间列表若刷新成只剩一把，
 * 这里也会说明为什么不能删，而不是点了没反应。
 */
export function PortalDeleteKeyModal({
  t,
  target,
  busy,
  isLastKey,
  describeError,
  onConfirm,
  onClose,
}: {
  t: (key: string, options?: Record<string, unknown>) => string;
  target: EndUserAPIKey | null;
  busy: boolean;
  /** 账号只剩这一把 Key：后端不允许删除最后一把。 */
  isLastKey: boolean;
  describeError: (error: unknown) => string;
  onConfirm: (key: EndUserAPIKey) => Promise<void>;
  onClose: () => void;
}) {
  const [error, setError] = useState("");
  const blockedReason = isLastKey ? t("apikey_lookup.keep_one_key_desc") : "";

  useEffect(() => {
    if (target) setError("");
  }, [target]);

  return (
    <ConfirmModal
      open={Boolean(target)}
      title={t("apikey_lookup.confirm_delete_title")}
      description={t("apikey_lookup.delete_key_lead")}
      subject={
        target ? (
          <span className="flex min-w-0 items-center justify-between gap-3">
            <span className="truncate font-medium">{target.name || target.id.slice(0, 8)}</span>
            {target.key_masked ? (
              <code className="shrink-0 font-mono text-xs text-ink-3">{target.key_masked}</code>
            ) : null}
          </span>
        ) : null
      }
      consequences={[t("apikey_lookup.delete_key_consequence_requests")]}
      confirmText={t("apikey_lookup.confirm_delete")}
      busy={busy}
      onClose={() => {
        if (!busy) onClose();
      }}
      onConfirm={() => {
        if (!target) return;
        if (isLastKey) {
          setError(blockedReason);
          return;
        }
        setError("");
        void onConfirm(target).catch((reason: unknown) => setError(describeError(reason)));
      }}
    >
      {error ? (
        <Callout tone="danger" role="alert">
          {error}
        </Callout>
      ) : isLastKey ? (
        <Callout tone="warning">{blockedReason}</Callout>
      ) : null}
    </ConfirmModal>
  );
}
