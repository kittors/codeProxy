import { useEffect, useId, useState, type ReactNode } from "react";
import { AlertTriangle, CircleHelp, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "../primitives/Button";
import { TextInput } from "../primitives/Input";
import { Modal } from "../overlays/Modal";
import type { DialogTone } from "./DialogIcon";

type ConfirmVariant = "danger" | "warning" | "primary";

const TONE: Record<ConfirmVariant, DialogTone> = {
  danger: "danger",
  warning: "warning",
  primary: "auto",
};

const DEFAULT_ICON: Record<ConfirmVariant, ReactNode> = {
  danger: <Trash2 />,
  warning: <AlertTriangle />,
  primary: <CircleHelp />,
};

/**
 * 确认框：说清楚「对谁做什么、会有什么后果」，再让用户按下去。
 *
 * - `subject`：被操作的对象（名称、掩码后的密钥……）单独放在一张卡片里，
 *   用户不必从一句话里找「到底删的是哪个」；
 * - `consequences`：后果逐条列出（例如「已签发的令牌立即失效」），比一段长句好读；
 * - `confirmPhrase`：高危操作要求输入对象名称才能确认，防止顺手连点；
 * - `children`：附加选项（例如「同时删除日志」的勾选框）。
 * 红色只给不可恢复的操作（danger）；需要留意但可撤回的用 warning，普通确认用 primary。
 */
export function ConfirmModal({
  open,
  title,
  description,
  confirmText = "",
  cancelText = "",
  variant = "danger",
  busy = false,
  icon,
  subject,
  consequences,
  confirmPhrase,
  confirmDisabled = false,
  children,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  description: ReactNode;
  confirmText?: string;
  cancelText?: string;
  variant?: ConfirmVariant;
  busy?: boolean;
  icon?: ReactNode;
  subject?: ReactNode;
  consequences?: ReactNode[];
  confirmPhrase?: string;
  /** 额外的「暂不能确认」条件，例如附加选项一个都没勾。 */
  confirmDisabled?: boolean;
  children?: ReactNode;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const phraseId = useId();
  const [typed, setTyped] = useState("");
  useEffect(() => {
    if (open) setTyped("");
  }, [open]);

  const resolvedCancelText = cancelText || t("common.cancel");
  const phraseMatches = !confirmPhrase || typed.trim() === confirmPhrase;
  const canConfirm = !busy && phraseMatches && !confirmDisabled;
  const confirm = () => {
    if (canConfirm) onConfirm();
  };
  const hasBody = Boolean(subject || consequences?.length || confirmPhrase || children);

  return (
    <Modal
      open={open}
      title={title}
      description={description}
      icon={icon ?? DEFAULT_ICON[variant]}
      tone={TONE[variant]}
      onClose={onClose}
      size="sm"
      // 没有输入框时焦点停在弹窗本身：危险操作不该让一个回车就确认。
      initialFocus={confirmPhrase ? "auto" : "panel"}
      dirty={false}
      bodyClassName={hasBody ? undefined : "hidden"}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            {resolvedCancelText}
          </Button>
          <Button
            variant={variant === "danger" ? "danger" : "primary"}
            onClick={confirm}
            disabled={!phraseMatches || confirmDisabled}
            loading={busy}
          >
            {confirmText}
          </Button>
        </>
      }
    >
      {hasBody ? (
        <div className="space-y-4">
          {subject ? (
            <div className="rounded-2xl bg-subtle px-4 py-3 text-sm text-ink">
              {subject}
            </div>
          ) : null}
          {consequences?.length ? (
            <ul className="space-y-1.5 text-sm text-ink-2">
              {consequences.map((item, index) => (
                <li key={index} className="flex gap-2.5">
                  <span
                    aria-hidden="true"
                    className={[
                      "mt-[0.45rem] h-1.5 w-1.5 shrink-0 rounded-full",
                      variant === "danger" ? "bg-rose-500/70" : "bg-ink-4",
                    ].join(" ")}
                  />
                  <span className="min-w-0">{item}</span>
                </li>
              ))}
            </ul>
          ) : null}
          {children}
          {confirmPhrase ? (
            <form
              className="space-y-2"
              onSubmit={(event) => {
                event.preventDefault();
                confirm();
              }}
            >
              <label htmlFor={phraseId} className="block text-sm text-ink-2">
                {t("common.confirm_phrase_label", {
                  phrase: confirmPhrase,
                  defaultValue: "输入 {{phrase}} 以确认",
                })}
              </label>
              <TextInput
                id={phraseId}
                value={typed}
                onChange={(event) => setTyped(event.currentTarget.value)}
                placeholder={confirmPhrase}
                autoComplete="off"
                spellCheck={false}
                data-dismiss-safe=""
              />
            </form>
          ) : null}
        </div>
      ) : null}
    </Modal>
  );
}
