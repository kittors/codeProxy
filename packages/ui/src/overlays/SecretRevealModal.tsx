import { useCallback, useEffect, useState } from "react";
import { Check, Copy, KeyRound } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Callout } from "../forms/Callout";
import { SecretValue } from "../forms/SecretValue";
import { Button } from "../primitives/Button";
import { Modal } from "../overlays/Modal";
import { copyTextToClipboard } from "../utils/clipboard";

export interface SecretRevealItem {
  label: string;
  value: string;
}

/**
 * 一次性凭证：密码、API Key 这类关了就再也看不到的值。
 *
 * - 每个值单独一行，各自带复制按钮；多个值时底部还有「复制全部」（按「名称：值」逐行拼好）；
 * - 顶部一条琥珀提示说明只显示这一次；
 * - 还没复制过时，点遮罩或按 Esc 不会关闭（面板轻晃），只能点按钮关——
 *   以前手一滑点到遮罩，刚生成的密码就永远找不回来了。
 */
export function SecretRevealModal({
  open,
  title,
  description,
  secret,
  secretLabel,
  items,
  warning,
  closeText = "",
  onClose,
}: {
  open: boolean;
  title: string;
  description?: string;
  /** 单个值（兼容旧调用）；和 items 二选一。 */
  secret?: string;
  secretLabel?: string;
  items?: SecretRevealItem[];
  warning?: string;
  closeText?: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const [copiedAll, setCopiedAll] = useState(false);
  useEffect(() => {
    if (open) {
      setCopied(false);
      setCopiedAll(false);
    }
  }, [open]);

  const values: SecretRevealItem[] = (
    items ?? [
      {
        label: secretLabel ?? t("common.secret_value", { defaultValue: "密钥" }),
        value: secret ?? "",
      },
    ]
  ).filter((item) => item.value);
  const resolvedClose = closeText || t("common.secret_saved_close", { defaultValue: "我已保存" });

  const copyAll = useCallback(async () => {
    const text =
      values.length === 1 ? values[0]!.value : values.map((item) => `${item.label}: ${item.value}`).join("\n");
    if (!text) return;
    if (await copyTextToClipboard(text)) {
      setCopied(true);
      setCopiedAll(true);
      window.setTimeout(() => setCopiedAll(false), 2000);
    }
  }, [values]);

  return (
    <Modal
      open={open}
      title={title}
      description={description}
      icon={<KeyRound />}
      tone="warning"
      size="sm"
      onClose={onClose}
      dirty={!copied}
      initialFocus="panel"
      footer={
        <>
          <Button variant="secondary" onClick={() => void copyAll()} disabled={values.length === 0}>
            {copiedAll ? <Check size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}
            {copiedAll
              ? t("common.copied", { defaultValue: "已复制" })
              : values.length > 1
                ? t("common.copy_all", { defaultValue: "复制全部" })
                : t("common.copy", { defaultValue: "复制" })}
          </Button>
          <Button variant="primary" onClick={onClose}>
            {resolvedClose}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Callout tone="warning">
          {warning ||
            t("common.secret_once_warning", {
              defaultValue: "请立即复制，关闭后将无法再次查看。",
            })}
        </Callout>
        {values.map((item) => (
          <SecretValue
            key={item.label}
            label={item.label}
            value={item.value}
            onCopied={() => setCopied(true)}
          />
        ))}
      </div>
    </Modal>
  );
}
