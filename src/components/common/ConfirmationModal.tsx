import { useTranslation } from "react-i18next";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { useNotificationStore } from "@/stores";

function TrashIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      width={22}
      height={22}
    >
      <path d="M3 6h18" />
      <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
      <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
      <line x1="10" x2="10" y1="11" y2="17" />
      <line x1="14" x2="14" y1="11" y2="17" />
    </svg>
  );
}

function InfoIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      width={22}
      height={22}
    >
      <circle cx="12" cy="12" r="10" />
      <path d="M12 16v-4" />
      <path d="M12 8h.01" />
    </svg>
  );
}

const iconWrapperBase: React.CSSProperties = {
  flexShrink: 0,
  width: 42,
  height: 42,
  borderRadius: 10,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

const dangerIconStyle: React.CSSProperties = {
  ...iconWrapperBase,
  background: "rgba(239, 68, 68, 0.1)",
  color: "#ef4444",
  border: "1px solid rgba(239, 68, 68, 0.2)",
};

const primaryIconStyle: React.CSSProperties = {
  ...iconWrapperBase,
  background: "rgba(59, 130, 246, 0.1)",
  color: "#3b82f6",
  border: "1px solid rgba(59, 130, 246, 0.2)",
};

const contentStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  gap: 14,
  padding: "4px 0",
};

const messageStyle: React.CSSProperties = {
  flex: 1,
  minWidth: 0,
  fontSize: 14,
  lineHeight: 1.6,
  color: "var(--text-secondary, #6b7280)",
  wordBreak: "break-word",
  margin: 0,
};

const actionsStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "flex-end",
  gap: 8,
  paddingTop: 16,
  marginTop: 8,
  borderTop: "1px solid var(--border-color, #e5e7eb)",
};

export function ConfirmationModal() {
  const { t } = useTranslation();
  const confirmation = useNotificationStore((state) => state.confirmation);
  const hideConfirmation = useNotificationStore((state) => state.hideConfirmation);
  const setConfirmationLoading = useNotificationStore((state) => state.setConfirmationLoading);

  const { isOpen, isLoading, options } = confirmation;

  if (!isOpen || !options) {
    return null;
  }

  const {
    title,
    message,
    onConfirm,
    onCancel,
    confirmText,
    cancelText,
    variant = "primary",
  } = options;

  const handleConfirm = async () => {
    try {
      setConfirmationLoading(true);
      await onConfirm();
      hideConfirmation();
    } catch (error) {
      console.error("Confirmation action failed:", error);
    } finally {
      setConfirmationLoading(false);
    }
  };

  const handleCancel = () => {
    if (isLoading) {
      return;
    }
    if (onCancel) {
      onCancel();
    }
    hideConfirmation();
  };

  const isDanger = variant === "danger";
  const iconStyle = isDanger ? dangerIconStyle : primaryIconStyle;

  return (
    <Modal open={isOpen} onClose={handleCancel} title={title} closeDisabled={isLoading} width={420}>
      <div style={contentStyle}>
        <div style={iconStyle}>{isDanger ? <TrashIcon /> : <InfoIcon />}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          {typeof message === "string" ? (
            <p style={messageStyle}>{message}</p>
          ) : (
            <div style={messageStyle}>{message}</div>
          )}
        </div>
      </div>
      <div style={actionsStyle}>
        <Button variant="ghost" onClick={handleCancel} disabled={isLoading}>
          {cancelText || t("common.cancel")}
        </Button>
        <Button variant={variant} onClick={handleConfirm} loading={isLoading}>
          {confirmText || t("common.confirm")}
        </Button>
      </div>
    </Modal>
  );
}
