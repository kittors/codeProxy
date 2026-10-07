import { RotateCcw, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { AuthFileItem } from "@code-proxy/api-client";
import { resolveAuthFileDisplayName } from "@code-proxy/domain";
import { ConfirmModal } from "@code-proxy/ui";

export type AuthFilesConfirmAction =
  | { type: "deleteSelection"; names: string[] }
  | { type: "resetCredit"; file: AuthFileItem };

const MAX_LISTED_NAMES = 4;

/**
 * AI 账号页的两种确认：消耗一次 Codex 重置次数（可再用、走 warning），批量删除凭证（不可恢复、走 danger）。
 * 删除时把要删的账号列出来（超过 4 个折成「等 N 个」），不再只说「确定要删除 N 个文件吗」。
 */
export function AuthFilesConfirmModal({
  confirm,
  resetCreditCount,
  busy,
  onClose,
  onConfirm,
}: {
  confirm: AuthFilesConfirmAction | null;
  resetCreditCount: number;
  busy: boolean;
  onClose: () => void;
  onConfirm: (action: AuthFilesConfirmAction) => void;
}) {
  const { t } = useTranslation();
  const reset = confirm?.type === "resetCredit" ? confirm : null;
  const names = confirm?.type === "deleteSelection" ? confirm.names : [];
  const listed = names.slice(0, MAX_LISTED_NAMES);

  return (
    <ConfirmModal
      open={confirm !== null}
      title={reset ? t("auth_files.reset_credit_confirm_title") : t("auth_files.batch_delete_title")}
      description={
        reset
          ? t("auth_files.reset_credit_confirm_desc", {
              name: resolveAuthFileDisplayName(reset.file) || reset.file.name,
              count: resetCreditCount,
            })
          : t("auth_files.batch_delete_lead", { count: names.length })
      }
      icon={reset ? <RotateCcw /> : <Trash2 />}
      variant={reset ? "warning" : "danger"}
      subject={
        reset ? undefined : (
          <ul className="space-y-1 font-mono text-xs">
            {listed.map((name) => (
              <li key={name} className="truncate">
                {name}
              </li>
            ))}
            {names.length > listed.length ? (
              <li className="font-sans text-ink-3">
                {t("auth_files.batch_delete_more", { count: names.length - listed.length })}
              </li>
            ) : null}
          </ul>
        )
      }
      consequences={
        reset
          ? undefined
          : [t("auth_files.batch_delete_consequence_files"), t("auth_files.batch_delete_consequence_traffic")]
      }
      confirmText={reset ? t("auth_files.reset_credit_confirm_button") : t("common.delete")}
      cancelText={t("common.cancel")}
      busy={busy}
      onClose={onClose}
      onConfirm={() => {
        if (confirm) onConfirm(confirm);
      }}
    />
  );
}
