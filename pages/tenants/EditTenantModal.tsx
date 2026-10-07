import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Building2, CirclePause, CircleCheck, Ban, Power, Timer } from "lucide-react";
import type { TenantIdentity } from "@code-proxy/api-client";
import {
  Button,
  Callout,
  ChoiceCards,
  FormField,
  FormSection,
  Modal,
  TextInput,
  Textarea,
  rules,
  useFormValidation,
} from "@code-proxy/ui";
import {
  ACCESS_TOKEN_TTL_RANGE,
  DEFAULT_ACCESS_TOKEN_TTL,
  DEFAULT_REFRESH_TOKEN_TTL,
  describeDuration,
  REFRESH_TOKEN_TTL_RANGE,
  TENANT_DESCRIPTION_MAX_BYTES,
  TENANT_NAME_MAX_LENGTH,
} from "./tenantForm";

type TenantStatus = TenantIdentity["status"];

export interface EditTenantValues {
  name: string;
  description: string;
  status: TenantStatus;
  access_token_ttl_seconds: number;
  refresh_token_ttl_seconds: number;
}

const toDraft = (tenant: TenantIdentity | null) => ({
  name: tenant?.name ?? "",
  description: tenant?.description ?? "",
  status: (tenant?.status ?? "active") as TenantStatus,
  // TTL 用字符串编辑：清空输入框重新输入时不会被立刻弹回默认值（以前 `Number(value) || 43200`）。
  accessTtl: String(tenant?.access_token_ttl_seconds ?? DEFAULT_ACCESS_TOKEN_TTL),
  refreshTtl: String(tenant?.refresh_token_ttl_seconds ?? DEFAULT_REFRESH_TOKEN_TTL),
});

/**
 * 编辑租户：基本信息 / 状态 / 登录有效期三段。
 *
 * - 状态以前是一个下拉框，看不出「暂停」和「禁用」有什么区别；现在用卡片把后果写在选项上，
 *   从「正常」改成别的状态时再提醒一次「保存后所有登录立即失效」（服务端会撤销该租户全部会话）。
 * - 两个 TTL 以秒为单位，下面实时换算成「12 小时」「30 天」，范围与服务端校验一致。
 */
export function EditTenantModal({
  tenant,
  busy,
  locale,
  onSubmit,
  onClose,
}: {
  tenant: TenantIdentity | null;
  busy: boolean;
  locale: string;
  onSubmit: (values: EditTenantValues) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const formRef = useRef<HTMLFormElement | null>(null);
  const [draft, setDraft] = useState(() => toDraft(tenant));
  const validation = useFormValidation(draft, {
    name: [rules.required(), rules.maxBytes(TENANT_NAME_MAX_LENGTH)],
    description: [rules.maxBytes(TENANT_DESCRIPTION_MAX_BYTES)],
    accessTtl: [rules.required(), rules.integer(ACCESS_TOKEN_TTL_RANGE)],
    refreshTtl: [rules.required(), rules.integer(REFRESH_TOKEN_TTL_RANGE)],
  });
  const { reset } = validation;

  useEffect(() => {
    if (!tenant) return;
    setDraft(toDraft(tenant));
    reset();
  }, [tenant, reset]);

  const submit = () => {
    if (!validation.validate()) {
      validation.focusFirstInvalid(formRef.current);
      return;
    }
    onSubmit({
      name: draft.name,
      description: draft.description,
      status: draft.status,
      access_token_ttl_seconds: Number(draft.accessTtl),
      refresh_token_ttl_seconds: Number(draft.refreshTtl),
    });
  };

  const ttlHint = (raw: string, range: { min: number; max: number }) => {
    const rangeText = t("identity_admin.ttl_range", {
      min: describeDuration(range.min, locale).text,
      max: describeDuration(range.max, locale).text,
    });
    if (!/^\d+$/.test(raw.trim())) return rangeText;
    const duration = describeDuration(Number(raw), locale);
    return `${t(duration.exact ? "identity_admin.ttl_equals" : "identity_admin.ttl_about", {
      value: duration.text,
    })} · ${rangeText}`;
  };

  // 从「正常」改成暂停 / 禁用：服务端会立刻撤销这个租户的全部登录，保存前说清楚。
  const revokesSessions = tenant?.status === "active" && draft.status !== "active";

  return (
    <Modal
      open={tenant !== null}
      title={t("identity_admin.edit_tenant")}
      description={tenant ? t("identity_admin.edit_tenant_desc", { slug: tenant.slug }) : undefined}
      icon={<Building2 />}
      size="lg"
      onClose={onClose}
      onSubmitShortcut={submit}
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>
            {t("common.cancel")}
          </Button>
          <Button type="submit" form="edit-tenant-form" variant="primary" loading={busy}>
            {t("identity_admin.save_changes")}
          </Button>
        </>
      }
    >
      <form
        ref={formRef}
        id="edit-tenant-form"
        className="space-y-6"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <FormSection title={t("identity_admin.tenant_section_info")} icon={<Building2 />}>
          <FormField
            label={t("identity_admin.name")}
            required
            error={validation.error("name")}
            description={t("identity_admin.tenant_name_hint")}
          >
            <TextInput
              value={draft.name}
              autoComplete="off"
              {...validation.bind("name")}
              onChange={(event) =>
                setDraft((previous) => ({ ...previous, name: event.target.value }))
              }
            />
          </FormField>
          <FormField
            label={t("identity_admin.description")}
            optional
            error={validation.error("description")}
            reserveMeta={false}
          >
            <Textarea
              value={draft.description}
              rows={3}
              {...validation.bind("description")}
              onChange={(event) =>
                setDraft((previous) => ({ ...previous, description: event.target.value }))
              }
            />
          </FormField>
        </FormSection>

        <FormSection
          title={t("identity_admin.status")}
          description={t("identity_admin.tenant_status_section_desc")}
          icon={<Power />}
        >
          <ChoiceCards<TenantStatus>
            ariaLabel={t("identity_admin.status")}
            columns={3}
            value={draft.status}
            onChange={(status) => setDraft((previous) => ({ ...previous, status }))}
            options={[
              {
                value: "active",
                label: t("identity_admin.status_active"),
                description: t("identity_admin.tenant_status_active_desc"),
                icon: <CircleCheck />,
              },
              {
                value: "suspended",
                label: t("identity_admin.status_suspended"),
                description: t("identity_admin.tenant_status_suspended_desc"),
                icon: <CirclePause />,
              },
              {
                value: "disabled",
                label: t("identity_admin.status_disabled"),
                description: t("identity_admin.tenant_status_disabled_desc"),
                icon: <Ban />,
              },
            ]}
          />
          {revokesSessions ? (
            <Callout tone="warning">{t("identity_admin.tenant_status_revoke_warning")}</Callout>
          ) : null}
        </FormSection>

        <FormSection
          title={t("identity_admin.tenant_section_sessions")}
          description={t("identity_admin.tenant_section_sessions_desc")}
          icon={<Timer />}
        >
          <div className="grid gap-4 md:grid-cols-2">
            <FormField
              label={t("identity_admin.access_token_ttl")}
              required
              error={validation.error("accessTtl")}
              description={ttlHint(draft.accessTtl, ACCESS_TOKEN_TTL_RANGE)}
            >
              <TextInput
                inputMode="numeric"
                value={draft.accessTtl}
                className="tabular-nums"
                {...validation.bind("accessTtl")}
                onChange={(event) =>
                  setDraft((previous) => ({ ...previous, accessTtl: event.target.value }))
                }
              />
            </FormField>
            <FormField
              label={t("identity_admin.refresh_token_ttl")}
              required
              error={validation.error("refreshTtl")}
              description={ttlHint(draft.refreshTtl, REFRESH_TOKEN_TTL_RANGE)}
            >
              <TextInput
                inputMode="numeric"
                value={draft.refreshTtl}
                className="tabular-nums"
                {...validation.bind("refreshTtl")}
                onChange={(event) =>
                  setDraft((previous) => ({ ...previous, refreshTtl: event.target.value }))
                }
              />
            </FormField>
          </div>
        </FormSection>
      </form>
    </Modal>
  );
}
