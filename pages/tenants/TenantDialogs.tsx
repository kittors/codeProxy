import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Ban, Building2, CalendarClock } from "lucide-react";
import type { TenantIdentity } from "@code-proxy/api-client";
import {
  Button,
  Callout,
  ConfirmModal,
  DateTimePicker,
  DetailList,
  FormField,
  Modal,
  rules,
  useFormValidation,
} from "@code-proxy/ui";
import {
  dateTimeRule,
  DEFAULT_ACCESS_TOKEN_TTL,
  DEFAULT_REFRESH_TOKEN_TTL,
  describeDuration,
  extendExpiry,
  toIsoDateTime,
  toLocalDateTimeInput,
} from "./tenantForm";

type DateTimePickerLabels = Parameters<typeof DateTimePicker>[0]["labels"];

const STATUS_BADGE: Record<TenantIdentity["effective_status"], string> = {
  active: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  expired: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
  suspended: "bg-rose-500/10 text-rose-700 dark:text-rose-300",
  disabled: "bg-rose-500/10 text-rose-700 dark:text-rose-300",
};

/** 租户详情：只读，用统一的 DetailList；标识可复制，登录有效期换算成人能读的时长。 */
export function TenantDetailsModal({
  tenant,
  name,
  statusLabel,
  locale,
  onClose,
}: {
  tenant: TenantIdentity | null;
  name: string;
  statusLabel: (status: TenantIdentity["effective_status"]) => string;
  locale: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const formatTime = (value: string | null | undefined) =>
    value ? new Date(value).toLocaleString(locale) : t("identity_admin.never");
  return (
    <Modal
      open={tenant !== null}
      title={name}
      description={tenant?.type === "system" ? t("identity_admin.system_tenant_hint") : undefined}
      icon={<Building2 />}
      size="md"
      onClose={onClose}
    >
      {tenant ? (
        <DetailList
          items={[
            {
              label: t("identity_admin.slug"),
              value: tenant.slug,
              mono: true,
              copyValue: tenant.slug,
            },
            {
              label: t("identity_admin.status"),
              value: (
                <span
                  className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_BADGE[tenant.effective_status]}`}
                >
                  {statusLabel(tenant.effective_status)}
                </span>
              ),
            },
            { label: t("identity_admin.expires"), value: formatTime(tenant.expires_at) },
            { label: t("identity_admin.version"), value: String(tenant.version) },
            {
              label: t("identity_admin.access_token_ttl_short"),
              value: describeDuration(
                tenant.access_token_ttl_seconds ?? DEFAULT_ACCESS_TOKEN_TTL,
                locale,
              ).text,
            },
            {
              label: t("identity_admin.refresh_token_ttl_short"),
              value: describeDuration(
                tenant.refresh_token_ttl_seconds ?? DEFAULT_REFRESH_TOKEN_TTL,
                locale,
              ).text,
            },
            { label: t("identity_admin.created_at"), value: formatTime(tenant.created_at) },
            { label: t("identity_admin.updated_at"), value: formatTime(tenant.updated_at) },
            {
              label: t("identity_admin.description"),
              value: tenant.description || t("identity_admin.none"),
              wide: true,
            },
          ]}
        />
      ) : null}
    </Modal>
  );
}

const QUICK_EXTENSIONS = [
  { months: 1, key: "identity_admin.renew_plus_1_month" },
  { months: 3, key: "identity_admin.renew_plus_3_months" },
  { months: 12, key: "identity_admin.renew_plus_1_year" },
] as const;

/**
 * 续期：显示当前到期时间，提供「延长 1 个月 / 3 个月 / 1 年」快捷按钮（从当前到期与现在中较晚的一个起算），
 * 选到过去的时间时提醒「保存后立即到期」——服务端允许这样做（提前结束租期），但不该是手滑。
 */
export function RenewTenantModal({
  tenant,
  name,
  busy,
  locale,
  dateTimePickerLabels,
  onSubmit,
  onClose,
}: {
  tenant: TenantIdentity | null;
  name: string;
  busy: boolean;
  locale: string;
  dateTimePickerLabels: DateTimePickerLabels;
  onSubmit: (expiresAtIso: string) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const formRef = useRef<HTMLFormElement | null>(null);
  const [renewAt, setRenewAt] = useState("");
  const validation = useFormValidation({ renewAt }, { renewAt: [rules.required(), dateTimeRule] });
  const { reset } = validation;

  useEffect(() => {
    if (!tenant) return;
    setRenewAt(toLocalDateTimeInput(tenant.expires_at));
    reset();
  }, [tenant, reset]);

  const iso = toIsoDateTime(renewAt);
  const inPast = iso !== null && new Date(iso).getTime() <= Date.now();

  const submit = () => {
    if (!validation.validate() || !iso) {
      validation.focusFirstInvalid(formRef.current);
      return;
    }
    onSubmit(iso);
  };

  return (
    <Modal
      open={tenant !== null}
      title={t("identity_admin.renew_tenant")}
      description={
        tenant
          ? tenant.expires_at
            ? t("identity_admin.renew_tenant_desc", {
                name,
                time: new Date(tenant.expires_at).toLocaleString(locale),
              })
            : t("identity_admin.renew_tenant_desc_never", { name })
          : undefined
      }
      icon={<CalendarClock />}
      size="sm"
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>
            {t("common.cancel")}
          </Button>
          <Button type="submit" form="renew-tenant-form" variant="primary" loading={busy}>
            {t("identity_admin.renew")}
          </Button>
        </>
      }
    >
      <form
        ref={formRef}
        id="renew-tenant-form"
        className="space-y-4"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <FormField
          label={t("identity_admin.expires_at")}
          required
          error={validation.error("renewAt")}
          reserveMeta={false}
        >
          <DateTimePicker
            value={renewAt}
            onChange={(value) => {
              setRenewAt(value);
              validation.touch("renewAt");
            }}
            aria-label={t("identity_admin.expires_at")}
            locale={locale}
            labels={dateTimePickerLabels}
          />
        </FormField>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-ink-3">{t("identity_admin.renew_quick")}</span>
          {QUICK_EXTENSIONS.map((option) => (
            <Button
              key={option.months}
              size="xs"
              variant="secondary"
              onClick={() => {
                setRenewAt(extendExpiry(tenant?.expires_at ?? null, option.months));
                validation.touch("renewAt");
              }}
            >
              {t(option.key)}
            </Button>
          ))}
        </div>
        {inPast ? (
          <Callout tone="warning">{t("identity_admin.renew_in_past_warning")}</Callout>
        ) : null}
      </form>
    </Modal>
  );
}

/**
 * 「禁用」租户：后端的 DELETE /tenants/:id 并不删除数据，而是把状态设为 disabled 并撤销该租户
 * 全部登录（可以在「编辑」里改回正常）。所以用琥珀色 + 禁用图标、写清可恢复，而不是删除用的红色垃圾桶。
 */
export function DisableTenantConfirm({
  tenant,
  name,
  busy,
  onConfirm,
  onClose,
}: {
  tenant: TenantIdentity | null;
  name: string;
  busy: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  return (
    <ConfirmModal
      open={tenant !== null}
      title={t("identity_admin.disable_tenant_title", { name })}
      description={t("identity_admin.disable_tenant_lead")}
      variant="warning"
      icon={<Ban />}
      subject={
        tenant ? (
          <span className="flex min-w-0 items-center justify-between gap-3">
            <span className="truncate font-medium">{name}</span>
            <span className="shrink-0 font-mono text-xs text-ink-3">{tenant.slug}</span>
          </span>
        ) : null
      }
      consequences={[
        t("identity_admin.disable_tenant_consequence_sessions"),
        t("identity_admin.disable_tenant_consequence_api"),
        t("identity_admin.disable_tenant_consequence_restore"),
      ]}
      confirmText={t("identity_admin.disable_tenant")}
      busy={busy}
      onClose={onClose}
      onConfirm={onConfirm}
    />
  );
}
