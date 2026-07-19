import { useCallback, useState } from "react";
import { Check, Copy, KeyRound, Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "../primitives/Button";
import { Modal } from "../overlays/Modal";
import { copyTextToClipboard } from "../utils/clipboard";

export function SecretRevealModal({
  open,
  title,
  description,
  secret,
  warning,
  closeText = "",
  onClose,
}: {
  open: boolean;
  title: string;
  description?: string;
  secret: string;
  warning?: string;
  closeText?: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const [copying, setCopying] = useState(false);
  const resolvedClose = closeText || t("common.close", { defaultValue: "关闭" });

  const handleCopy = useCallback(async () => {
    if (!secret || copying) return;
    setCopying(true);
    try {
      const ok = await copyTextToClipboard(secret);
      if (ok) {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 2000);
      }
    } finally {
      setCopying(false);
    }
  }, [copying, secret]);

  return (
    <Modal
      open={open}
      title={title}
      description={description}
      onClose={onClose}
      maxWidth="max-w-md"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {resolvedClose}
          </Button>
          <Button variant="primary" onClick={() => void handleCopy()} disabled={!secret || copying}>
            {copying ? (
              <Loader2 size={16} className="animate-spin" aria-hidden="true" />
            ) : copied ? (
              <Check size={16} aria-hidden="true" />
            ) : (
              <Copy size={16} aria-hidden="true" />
            )}
            {copied
              ? t("common.copied", { defaultValue: "已复制" })
              : t("common.copy", { defaultValue: "复制" })}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-600 ring-1 ring-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:ring-amber-500/20">
            <KeyRound size={18} />
          </div>
          <p className="min-w-0 pt-1.5 text-sm leading-relaxed text-slate-600 dark:text-white/65">
            {warning ||
              t("common.secret_once_warning", {
                defaultValue: "请立即复制，关闭后将无法再次查看。",
              })}
          </p>
        </div>
        <div className="relative rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-white/10 dark:bg-neutral-900">
          <code className="block select-all break-all pr-10 font-mono text-sm text-slate-900 dark:text-white">
            {secret}
          </code>
          <button
            type="button"
            onClick={() => void handleCopy()}
            className="absolute top-2 right-2 inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 transition hover:bg-white hover:text-slate-900 dark:hover:bg-white/10 dark:hover:text-white"
            aria-label={t("common.copy", { defaultValue: "复制" })}
          >
            {copied ? <Check size={15} /> : <Copy size={15} />}
          </button>
        </div>
      </div>
    </Modal>
  );
}
