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
        <div className="flex items-start gap-3.5">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400">
            <KeyRound size={20} />
          </div>
          <p className="min-w-0 pt-2.5 text-sm leading-relaxed text-ink-2">
            {warning ||
              t("common.secret_once_warning", {
                defaultValue: "请立即复制，关闭后将无法再次查看。",
              })}
          </p>
        </div>
        <div className="relative rounded-2xl border border-line bg-subtle p-3.5">
          <code className="block select-all break-all pr-10 font-mono text-sm text-ink">
            {secret}
          </code>
          <button
            type="button"
            onClick={() => void handleCopy()}
            className="absolute top-2 right-2 inline-flex h-8 w-8 items-center justify-center rounded-full text-ink-3 transition-colors hover:bg-hover hover:text-ink"
            aria-label={t("common.copy", { defaultValue: "复制" })}
          >
            {copied ? <Check size={15} /> : <Copy size={15} />}
          </button>
        </div>
      </div>
    </Modal>
  );
}
