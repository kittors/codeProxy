import { Network } from "lucide-react";
import type { Dispatch, SetStateAction } from "react";
import { useTranslation } from "react-i18next";
import type { ProxyPoolEntry } from "@code-proxy/api-client/endpoints/proxies";
import { Button, FormField, Modal, SettingGroup, SettingRow, TextInput, ToggleSwitch } from "@code-proxy/ui";
import { proxyEndpoint, proxyProtocol } from "@features/proxy-pool/proxy-utils";

const FORM_ID = "proxy-form";

export type ProxyFormField = "name" | "url";

/**
 * 添加 / 编辑代理。
 *
 * 地址框下面实时画出「协议 · 主机:端口」，账号密码不回显——用户粘贴完一长串 URL，
 * 一眼就能确认面板认出来的是不是自己想要的那个出口。校验错误就地显示在对应输入框下，
 * 不再只弹一条 toast 让人自己找是哪一项。回车即保存。
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
  /** 校验没通过的字段（由页面的保存逻辑给出）。 */
  error: ProxyFormField | null;
  onClearError: () => void;
  saving: boolean;
  onSubmit: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const url = draft.url.trim();
  const preview =
    url && !error ? { protocol: proxyProtocol(url), endpoint: proxyEndpoint({ ...draft, maskedUrl: "" }) } : null;

  const update = (patch: Partial<ProxyPoolEntry>) => {
    setDraft((previous) => ({ ...previous, ...patch }));
    if (error && (("name" in patch && error === "name") || ("url" in patch && error === "url"))) {
      onClearError();
    }
  };

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
        id={FORM_ID}
        className="space-y-4"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit();
        }}
      >
        <FormField
          label={t("proxies.name")}
          required
          description={t("proxies.name_hint")}
          error={error === "name" ? t("proxies.validation_name") : undefined}
        >
          <TextInput
            value={draft.name}
            placeholder={t("proxies.name_placeholder")}
            onChange={(event) => update({ name: event.target.value })}
          />
        </FormField>
        <FormField
          label={t("proxies.url")}
          required
          description={
            preview ? (
              <span className="inline-flex items-center gap-1.5">
                <span className="rounded-md bg-subtle px-1.5 py-px font-mono text-2xs font-medium text-ink-2">
                  {preview.protocol}
                </span>
                <span className="font-mono">{preview.endpoint}</span>
              </span>
            ) : (
              t("proxies.url_hint")
            )
          }
          error={error === "url" ? t("proxies.validation_url") : undefined}
        >
          <TextInput
            value={draft.url}
            placeholder="socks5://user:pass@127.0.0.1:1080"
            spellCheck={false}
            autoComplete="off"
            className="font-mono"
            onChange={(event) => update({ url: event.target.value })}
          />
        </FormField>
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
