import { Trash2, AlertCircle } from "lucide-react";
import { Button } from "@/modules/ui/Button";
import { Modal } from "@/modules/ui/Modal";

type ConfirmVariant = "danger" | "primary";

export function ConfirmModal({
  open,
  title,
  description,
  confirmText = "确认",
  cancelText = "取消",
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
  const isDanger = variant === "danger";

  return (
    <Modal open={open} title={title} onClose={onClose} maxWidth="max-w-md" footer={
      <>
        <Button variant="secondary" onClick={onClose} disabled={busy}>
          {cancelText}
        </Button>
        <Button
          variant={isDanger ? "danger" : "primary"}
          onClick={onConfirm}
          disabled={busy}
        >
          {confirmText}
        </Button>
      </>
    }>
      <div className="flex items-start gap-3">
        <div
          className={[
            "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl",
            isDanger
              ? "bg-rose-50 text-rose-600 ring-1 ring-rose-200 dark:bg-rose-500/10 dark:text-rose-400 dark:ring-rose-500/20"
              : "bg-blue-50 text-blue-600 ring-1 ring-blue-200 dark:bg-blue-500/10 dark:text-blue-400 dark:ring-blue-500/20",
          ].join(" ")}
        >
          {isDanger ? <Trash2 size={18} /> : <AlertCircle size={18} />}
        </div>
        <p className="min-w-0 pt-1.5 text-sm leading-relaxed text-slate-600 dark:text-white/65">
          {description}
        </p>
      </div>
    </Modal>
  );
}
