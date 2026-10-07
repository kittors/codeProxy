import { Network } from "lucide-react";
import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { useTranslation } from "react-i18next";
import type { ProxyPoolEntry } from "@code-proxy/api-client/endpoints/proxies";
import {
  Button,
  FormField,
  Modal,
  rules,
  SettingGroup,
  SettingRow,
  TextInput,
  ToggleSwitch,
  useFormValidation,
} from "@code-proxy/ui";
import { ProxyUrlInput } from "@features/proxy-pool";

const FORM_ID = "proxy-form";

export type ProxyFormField = "name" | "url";

/**
 * 添加 / 编辑代理。
 *
 * 地址用结构化输入（协议、主机、端口、可选账号密码，也能粘贴整串地址自动拆开），
 * 逐项就地校验；名称失焦后校验。提交时有错就把焦点送到第一处，回车即保存。
 * `error` 是页面保存逻辑兜底校验的结果（理论上走不到，保留以防绕过）。
 */
export function ProxyFormModal({
  open,
  editing,
  draft,
  setDraft,
  error,
  onClearError,
  saving,
  onSubmit,
  onClose,
}: {
  open: boolean;
  editing: boolean;
  draft: ProxyPoolEntry;
  setDraft: Dispatch<SetStateAction<ProxyPoolEntry>>;
  error: ProxyFormField | null;
  onClearError: () => void;
  saving: boolean;
  onSubmit: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const formRef = useRef<HTMLFormElement | null>(null);
  const [urlValid, setUrlValid] = useState(true);
  const [submitted, setSubmitted] = useState(false);
  const validation = useFormValidation(draft, {
    name: [rules.required(), rules.maxLength(64)],
  });
  const { reset } = validation;

  useEffect(() => {
    if (!open) return;
    reset();
    setSubmitted(false);
  }, [open, reset]);

  const update = (patch: Partial<ProxyPoolEntry>) => {
    setDraft((previous) => ({ ...previous, ...patch }));
    if (error && (("name" in patch && error === "name") || ("url" in patch && error === "url"))) {
      onClearError();
    }
  };

  const submit = () => {
    setSubmitted(true);
    const fieldsValid = validation.validate();
    if (!fieldsValid || !urlValid) {
      validation.focusFirstInvalid(formRef.current);
      return;
    }
    onSubmit();
  };

  const nameError =
    validation.error("name") ?? (error === "name" ? t("proxies.validation_name") : undefined);

  return (
    <Modal
      open={open}
      title={editing ? t("proxies.edit_title") : t("proxies.add_title")}
      description={t("proxies.form_desc")}
      icon={<Network />}
      size="md"
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose} disabled={saving}>
            {t("common.cancel")}
          </Button>
          <Button type="submit" form={FORM_ID} variant="primary" loading={saving}>
            {t("common.save")}
          </Button>
        </>
      }
    >
      <form
        ref={formRef}
        id={FORM_ID}
        className="space-y-5"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <FormField
          label={t("proxies.name")}
          required
          description={t("proxies.name_hint")}
          error={nameError}
        >
          <TextInput
            value={draft.name}
            placeholder={t("proxies.name_placeholder")}
            {...validation.bind("name")}
            onChange={(event) => update({ name: event.target.value })}
          />
        </FormField>

        <ProxyUrlInput
          label={t("proxies.url")}
          required
          value={draft.url}
          onChange={(url) => update({ url })}
          onValidityChange={setUrlValid}
          showErrors={submitted || error === "url"}
        />

        <FormField label={t("proxies.description_label")} optional reserveMeta={false}>
          <TextInput
            value={draft.description ?? ""}
            placeholder={t("proxies.remark_placeholder")}
            onChange={(event) => update({ description: event.target.value })}
          />
        </FormField>
        <SettingGroup>
          <SettingRow
            label={t("proxies.enabled")}
            description={t("proxies.enabled_hint")}
            controlWidth="auto"
            control={
              <ToggleSwitch
                checked={draft.enabled}
                ariaLabel={t("proxies.enabled")}
                onCheckedChange={(enabled) => update({ enabled })}
              />
            }
          />
        </SettingGroup>
      </form>
    </Modal>
  );
}
