/**
 * 禁用模型确认弹窗组件
 * 封装三次确认的 UI 逻辑
 */

import { useTranslation } from "react-i18next";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import type { DisableState } from "@/utils/monitor";

interface DisableModelModalProps {
  /** 禁用状态 */
  disableState: DisableState | null;
  /** 是否正在禁用中 */
  disabling: boolean;
  /** 确认回调 */
  onConfirm: () => void;
  /** 取消回调 */
  onCancel: () => void;
}

export function DisableModelModal({
  disableState,
  disabling,
  onConfirm,
  onCancel,
}: DisableModelModalProps) {
  const { t, i18n } = useTranslation();
  const isZh = i18n.language === "zh-CN" || i18n.language === "zh";

  // 获取警告内容
  const getWarningContent = () => {
    if (!disableState) return null;

    if (disableState.step === 1) {
      return (
        <p style={{ marginBottom: 16, lineHeight: 1.6 }}>
          {isZh ? "确定要禁用 " : "Are you sure you want to disable "}
          <strong>{disableState.displayName}</strong>
          {isZh ? " 吗？" : "?"}
        </p>
      );
    }

    if (disableState.step === 2) {
      return (
        <p style={{ marginBottom: 16, lineHeight: 1.6, color: "var(--warning-color, #f59e0b)" }}>
          {isZh
            ? "⚠️ 警告：此操作将从配置中移除该模型映射！"
            : "⚠️ Warning: this removes the model mapping from config!"}
        </p>
      );
    }

    return (
      <p style={{ marginBottom: 16, lineHeight: 1.6, color: "var(--danger-color, #ef4444)" }}>
        {isZh
          ? "🚨 最后确认：禁用后需要手动重新添加才能恢复！"
          : "🚨 Final confirmation: you'll need to add it back manually later!"}
      </p>
    );
  };

  // 获取确认按钮文本
  const getConfirmButtonText = () => {
    if (!disableState) return "";
    const btnTexts = isZh
      ? ["确认禁用 (3)", "我确定 (2)", "立即禁用 (1)"]
      : ["Confirm (3)", "I'm sure (2)", "Disable now (1)"];
    return btnTexts[disableState.step - 1] || btnTexts[0];
  };

  return (
    <Modal
      open={!!disableState}
      onClose={onCancel}
      title={t("monitor.logs.disable_confirm_title")}
      width={400}
    >
      <div style={{ padding: "16px 0" }}>
        {getWarningContent()}
        <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
          <Button variant="secondary" onClick={onCancel} disabled={disabling}>
            {t("common.cancel")}
          </Button>
          <Button variant="danger" onClick={onConfirm} disabled={disabling}>
            {disabling ? t("monitor.logs.disabling") : getConfirmButtonText()}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
