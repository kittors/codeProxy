import { useEffect, useRef } from "react";
import { KeyRound } from "lucide-react";
import {
  Button,
  Callout,
  FormField,
  Modal,
  TextInput,
  rules,
  useFormValidation,
} from "@code-proxy/ui";

const FORM_ID = "apikey-usage-form";

/**
 * 输入 API Key 查用量。
 *
 * 用标准的图标头（钥匙 + 标题 + 一句说明），查询按钮放在底部、回车即查询。
 * Key 为空时在输入框下就地提示；查询失败的原因放在表单里的红色提示条中。
 * 输入框用密码类型，旁边有人时也不会把整串 Key 露出来。
 */
export function ApiKeyUsageKeyModal({
  t,
  open,
  value,
  error,
  loading,
  onChange,
  onSubmit,
  onClose,
}: {
  t: (key: string, options?: Record<string, unknown>) => string;
  open: boolean;
  value: string;
  /** 查询失败的原因（已本地化）。 */
  error: string | null;
  loading: boolean;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onClose: () => void;
}) {
  const formRef = useRef<HTMLFormElement | null>(null);
  const validation = useFormValidation({ apiKey: value }, { apiKey: [rules.required()] });
  const { reset } = validation;

  useEffect(() => {
    if (open) reset();
  }, [open, reset]);

  return (
    <Modal
      open={open}
      title={t("apikey_usage.modal_title")}
      description={t("apikey_usage.modal_desc")}
      icon={<KeyRound />}
      size="sm"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button
            type="submit"
            form={FORM_ID}
            variant="primary"
            loading={loading}
            data-testid="apikey-usage-submit"
          >
            {t("apikey_lookup.query")}
          </Button>
        </>
      }
    >
      <form
        ref={formRef}
        id={FORM_ID}
        className="space-y-4"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          if (!validation.validate()) {
            validation.focusFirstInvalid(formRef.current);
            return;
          }
          onSubmit();
        }}
      >
        <FormField
          label={t("apikey_lookup.api_key_label")}
          required
          htmlFor="apikey-usage-input"
          description={t("apikey_usage.key_storage_hint")}
          error={validation.error("apiKey")}
        >
          <TextInput
            type="password"
            value={value}
            onChange={(event) => onChange(event.target.value)}
            autoComplete="off"
            spellCheck={false}
            className="font-mono"
            aria-label={t("apikey_lookup.api_key_label")}
            placeholder={t("apikey_lookup.placeholder")}
            {...validation.bind("apiKey")}
          />
        </FormField>
        {error ? (
          <Callout tone="danger" role="alert">
            {error}
          </Callout>
        ) : null}
      </form>
    </Modal>
  );
}
