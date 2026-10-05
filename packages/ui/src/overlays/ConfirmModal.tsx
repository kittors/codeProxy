import { Trash2, AlertCircle, Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "../primitives/Button";
import { Modal } from "../overlays/Modal";

type ConfirmVariant = "danger" | "primary";

export function ConfirmModal({
  open,
  title,
  description,
  confirmText = "",
  cancelText = "",
  variant = "danger",
  busy = false,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  description: string;
  confirmText?: string;
  cancelText?: string;
  variant?: ConfirmVariant;
  busy?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const isDanger = variant === "danger";
  const resolvedCancelText = cancelText || t("common.cancel");

  return (
    <Modal
      open={open}
      title={title}
      onClose={onClose}
      maxWidth="max-w-md"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            {resolvedCancelText}
          </Button>
          <Button variant={isDanger ? "danger" : "primary"} onClick={onConfirm} disabled={busy}>
            {busy ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : null}
            {confirmText}
          </Button>
        </>
      }
    >
      <div className="flex items-start gap-3.5">
        {/* 圆形图标底：危险操作用一层很淡的红，普通确认保持中性，不再用蓝色装饰。 */}
        <div
          className={[
            "flex h-11 w-11 shrink-0 items-center justify-center rounded-full",
            isDanger ? "bg-rose-500/10 text-rose-500" : "bg-hover text-ink-2",
          ].join(" ")}
        >
          {isDanger ? <Trash2 size={20} /> : <AlertCircle size={20} />}
        </div>
        <p className="min-w-0 pt-2.5 text-sm leading-relaxed text-ink-2">{description}</p>
      </div>
    </Modal>
  );
}
