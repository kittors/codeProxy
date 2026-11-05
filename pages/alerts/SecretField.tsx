import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Eye, EyeOff } from "lucide-react";
import { Button, TextInput } from "@code-proxy/ui";
import type { SecretDraft } from "./model";

/**
 * 密钥类字段：地址（里面常带着令牌）、签名密钥、Bot Token。
 *
 * 后端读回的是打码串，它绝不放进输入框——框里是打码串会被当成真值，改一个字符就等于提交了一个
 * 「新值」。所以：已设置时框是空的，占位符写「已设置，留空保持不变」，打码串作为一行说明显示在下面；
 * 输入 = 换成新值；「清除」让保存时把它清空（可以撤销）。
 *
 * 由 FormField 包着用：id、aria-invalid、aria-describedby 要落到真正的输入框上。
 */
export function SecretField({
  value,
  onChange,
  placeholder,
  sensitive = false,
  disabled,
  id,
  "aria-invalid": ariaInvalid,
  "aria-describedby": ariaDescribedBy,
}: {
  value: SecretDraft;
  onChange: (next: SecretDraft) => void;
  /** 还没设置时的示例。 */
  placeholder: string;
  /** 令牌和密钥默认遮住输入（可以点眼睛看）；地址是要核对的，不遮。 */
  sensitive?: boolean;
  disabled?: boolean;
  id?: string;
  "aria-invalid"?: boolean | "true" | "false";
  "aria-describedby"?: string;
}) {
  const { t } = useTranslation();
  const [revealed, setRevealed] = useState(false);
  const stored = value.masked !== "";
  const hidden = sensitive && !revealed;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <TextInput
            id={id}
            aria-invalid={ariaInvalid}
            aria-describedby={ariaDescribedBy}
            type={hidden ? "password" : "text"}
            autoComplete="off"
            spellCheck={false}
            value={value.input}
            disabled={disabled || value.clear}
            placeholder={
              value.clear
                ? t("alerts_page.secret.clear_pending")
                : stored
                  ? t("alerts_page.secret.keep_placeholder")
                  : placeholder
            }
            onChange={(event) => onChange({ ...value, input: event.target.value, clear: false })}
            endAdornment={
              sensitive && !value.clear ? (
                <button
                  type="button"
                  onClick={() => setRevealed((current) => !current)}
                  aria-label={
                    revealed ? t("alerts_page.secret.hide") : t("alerts_page.secret.show")
                  }
                  aria-pressed={revealed}
                  className="inline-flex size-7 items-center justify-center rounded-full text-ink-3 transition-colors hover:bg-hover hover:text-ink"
                >
                  {revealed ? (
                    <EyeOff size={14} aria-hidden="true" />
                  ) : (
                    <Eye size={14} aria-hidden="true" />
                  )}
                </button>
              ) : undefined
            }
          />
        </div>
        {value.clear ? (
          <Button
            size="sm"
            variant="secondary"
            disabled={disabled}
            onClick={() => onChange({ ...value, clear: false })}
          >
            {t("alerts_page.secret.undo_clear")}
          </Button>
        ) : stored ? (
          <Button
            size="sm"
            variant="secondary"
            disabled={disabled}
            onClick={() => onChange({ ...value, input: "", clear: true })}
          >
            {t("alerts_page.secret.clear")}
          </Button>
        ) : null}
      </div>
      {stored && !value.clear ? (
        <p className="break-all text-xs leading-5 text-ink-3">
          {t("alerts_page.secret.current")}
          <code className="ml-1 rounded-md bg-subtle px-1.5 py-px font-mono text-2xs text-ink-2">
            {value.masked}
          </code>
        </p>
      ) : null}
    </div>
  );
}
