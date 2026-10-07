import { useEffect, useRef, useState, type Dispatch, type FormEvent, type SetStateAction } from "react";
import { Gauge, ShieldCheck, SlidersHorizontal, UserCog, UserRound } from "lucide-react";
import type { ApiKeyPermissionProfile, EndUser } from "@code-proxy/api-client";
import {
  Button,
  Callout,
  FormField,
  FormSection,
  Modal,
  Select,
  TextInput,
  rules,
  useFormValidation,
} from "@code-proxy/ui";
import {
  PeriodSpendingFields,
  RequestLimitFields,
  formatQuotaUsdAmount,
  limitsToPeriodSpendingDraft,
  remainingQuotaUsd,
  requestLimitRules,
} from "@features/period-spending";
import { displayNameRules, optionalPasswordRules } from "@features/identity-rules";
import { limitToText, type EndUserForm } from "../endUserForm";

const FORM_ID = "edit-end-user-form";

/** 选模板时会被模板值覆盖的那几项（累计消费限额属于账号，不在其中）。 */
type ProfileManagedLimits = Pick<
  EndUserForm,
  "dailyLimit" | "totalQuota" | "concurrencyLimit" | "rpmLimit" | "tpmLimit" | "periodSpending"
>;

const pickManagedLimits = (form: EndUserForm): ProfileManagedLimits => ({
  dailyLimit: form.dailyLimit,
  totalQuota: form.totalQuota,
  concurrencyLimit: form.concurrencyLimit,
  rpmLimit: form.rpmLimit,
  tpmLimit: form.tpmLimit,
  periodSpending: form.periodSpending,
});

const profileManagedLimits = (profile: ApiKeyPermissionProfile): ProfileManagedLimits => ({
  dailyLimit: limitToText(profile["daily-limit"]),
  totalQuota: limitToText(profile["total-quota"]),
  concurrencyLimit: limitToText(profile["concurrency-limit"]),
  rpmLimit: limitToText(profile["rpm-limit"]),
  tpmLimit: limitToText(profile["tpm-limit"]),
  periodSpending: limitsToPeriodSpendingDraft(profile["period-spending-limits"]),
});

/**
 * 编辑用户账号，按思路分四段：资料 → 权限模板 → 账号配额 → 其他限制。
 *
 * 选权限模板会用模板的周期额度和请求限制覆盖下面的值并锁定（提交时也以模板为准）。
 * 以前是静默覆盖，现在选中模板后紧跟一条提示说清楚；而且覆盖前先记下手填的值，
 * 改回「不限制」时恢复，误点一次模板不会把辛苦填的额度弄丢。累计消费限额属于账号、
 * 不受模板管理，所以选了模板也照样可以改。提交的数据结构不变。
 */
export function EndUserEditModal({
  t,
  open,
  user,
  form,
  onFormChange,
  permissionProfiles,
  permissionProfileOptions,
  selectedProfile,
  busy,
  onSubmit,
  onClose,
}: {
  t: (key: string, options?: Record<string, unknown>) => string;
  open: boolean;
  user: EndUser | null;
  form: EndUserForm;
  onFormChange: Dispatch<SetStateAction<EndUserForm>>;
  permissionProfiles: ApiKeyPermissionProfile[];
  permissionProfileOptions: { value: string; label: string }[];
  selectedProfile: ApiKeyPermissionProfile | null;
  busy: boolean;
  onSubmit: (event: FormEvent) => void;
  onClose: () => void;
}) {
  const formRef = useRef<HTMLFormElement | null>(null);
  const [manualLimits, setManualLimits] = useState<ProfileManagedLimits | null>(null);
  // Blank means "keep the current password"; anything typed has to satisfy the
  // same policy the server enforces, or its rejection comes back in English.
  const validation = useFormValidation(form, {
    displayName: displayNameRules,
    // 门户用户名后端只做小写化与重名自动加后缀，没有字符集限制，所以只要求非空，
    // 不套用管理员账号那套 usernameRules。
    username: [rules.required()],
    password: optionalPasswordRules,
    ...requestLimitRules,
  });
  const { reset } = validation;
  const userId = user?.id;

  useEffect(() => {
    if (!open) return;
    reset();
    setManualLimits(null);
  }, [open, userId, reset]);

  const changeProfile = (profileId: string) => {
    const profile = permissionProfiles.find((item) => item.id === profileId);
    if (profile) {
      // 第一次从「不限制」切到模板时记下手填的值，改回「不限制」时用得上。
      if (!form.permissionProfileId) setManualLimits(pickManagedLimits(form));
      onFormChange((current) => ({
        ...current,
        permissionProfileId: profileId,
        ...profileManagedLimits(profile),
      }));
      return;
    }
    onFormChange((current) => ({
      ...current,
      permissionProfileId: profileId,
      ...manualLimits,
    }));
    setManualLimits(null);
  };

  const lockedByProfile = Boolean(selectedProfile);
  const lifetimeCap = user?.["spending-limit"] ?? 0;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t("end_users.edit", { defaultValue: "编辑用户账号" })}
      description={t("end_users.edit_desc")}
      icon={<UserCog />}
      size="lg"
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>
            {t("common.cancel")}
          </Button>
          <Button type="submit" form={FORM_ID} variant="primary" loading={busy}>
            {t("common.save", { defaultValue: "保存" })}
          </Button>
        </>
      }
    >
      <form
        ref={formRef}
        id={FORM_ID}
        className="space-y-6"
        noValidate
        onSubmit={(event) => {
          if (!validation.validate()) {
            event.preventDefault();
            validation.focusFirstInvalid(formRef.current);
            return;
          }
          onSubmit(event);
        }}
      >
        <FormSection title={t("end_users.profile_section")} icon={<UserRound />}>
          <div className="grid gap-x-4 gap-y-4 sm:grid-cols-2">
            <FormField
              label={t("end_users.display_name", { defaultValue: "昵称" })}
              required
              error={validation.error("displayName")}
            >
              <TextInput
                value={form.displayName}
                onChange={(e) => onFormChange((f) => ({ ...f, displayName: e.target.value }))}
                {...validation.bind("displayName")}
              />
            </FormField>
            <FormField
              label={t("end_users.username", { defaultValue: "用户名" })}
              required
              error={validation.error("username")}
            >
              <TextInput
                value={form.username}
                onChange={(e) => onFormChange((f) => ({ ...f, username: e.target.value }))}
                autoComplete="off"
                spellCheck={false}
                {...validation.bind("username")}
              />
            </FormField>
          </div>
          <FormField
            label={t("end_users.new_password_label")}
            optional
            description={t("end_users.new_password_hint")}
            error={validation.error("password")}
          >
            <TextInput
              type="password"
              value={form.password}
              onChange={(e) => onFormChange((f) => ({ ...f, password: e.target.value }))}
              autoComplete="new-password"
              {...validation.bind("password")}
            />
          </FormField>
        </FormSection>

        <FormSection
          title={t("end_users.account_permission_profile", { defaultValue: "账户权限模板" })}
          description={t("end_users.quota_on_account_hint")}
          icon={<ShieldCheck />}
        >
          <Select
            value={form.permissionProfileId}
            onChange={changeProfile}
            options={permissionProfileOptions}
            aria-label={t("end_users.account_permission_profile", {
              defaultValue: "账户权限模板",
            })}
            placeholder={t("end_users.account_permission_profile_placeholder", {
              defaultValue: "选择账户权限模板",
            })}
          />
          {selectedProfile ? (
            <Callout tone="info">
              {t("end_users.profile_applied_hint", { profile: selectedProfile.name })}
            </Callout>
          ) : null}
        </FormSection>

        <FormSection
          title={t("end_users.quota_preview")}
          description={
            selectedProfile
              ? t("end_users.quota_profile_readonly_hint", { profile: selectedProfile.name })
              : t("end_users.quota_direct_edit_hint")
          }
          icon={<Gauge />}
        >
          <PeriodSpendingFields
            t={t}
            value={
              selectedProfile
                ? limitsToPeriodSpendingDraft(selectedProfile["period-spending-limits"])
                : form.periodSpending
            }
            onChange={(periodSpending) => onFormChange((current) => ({ ...current, periodSpending }))}
            disabled={lockedByProfile}
            idPrefix="end-user-period"
          />
        </FormSection>

        <FormSection
          title={t("end_users.other_limits")}
          description={
            selectedProfile
              ? t("end_users.other_limits_profile_readonly_hint", { profile: selectedProfile.name })
              : t("end_users.other_limits_direct_hint")
          }
          icon={<SlidersHorizontal />}
        >
          <RequestLimitFields
            value={form}
            onChange={(field, raw) => onFormChange((current) => ({ ...current, [field]: raw }))}
            labels={{
              dailyLimit: t("api_keys_page.form_daily_limit"),
              totalQuota: t("api_keys_page.form_total_quota"),
              concurrencyLimit: t("api_keys_page.form_concurrency_limit"),
              rpmLimit: t("api_keys_page.form_rpm_limit"),
              tpmLimit: t("api_keys_page.form_tpm_limit"),
            }}
            placeholder={t("quota.input_unlimited")}
            disabled={lockedByProfile}
            errors={{
              dailyLimit: validation.error("dailyLimit"),
              totalQuota: validation.error("totalQuota"),
              concurrencyLimit: validation.error("concurrencyLimit"),
              rpmLimit: validation.error("rpmLimit"),
              tpmLimit: validation.error("tpmLimit"),
            }}
            onFieldBlur={validation.touch}
          >
            <FormField
              label={t("end_users.lifetime_spending_limit")}
              className="sm:col-span-2 lg:col-span-1"
              reserveMeta={false}
              description={
                <>
                  {lifetimeCap > 0 ? (
                    <span className="block tabular-nums text-ink-2">
                      {t("quota.lifetime_usage_hint", {
                        used: formatQuotaUsdAmount(user?.["lifetime-spending-used"]),
                        remaining: formatQuotaUsdAmount(
                          remainingQuotaUsd(lifetimeCap, user?.["lifetime-spending-used"]),
                        ),
                      })}
                    </span>
                  ) : null}
                  <span className="block">{t("end_users.lifetime_spending_limit_hint")}</span>
                </>
              }
            >
              <TextInput
                type="number"
                min={0}
                step={1}
                inputMode="numeric"
                value={form.spendingLimit}
                aria-label={t("end_users.lifetime_spending_limit")}
                placeholder={t("quota.input_unlimited")}
                onChange={(event) => {
                  const raw = event.target.value;
                  if (raw === "" || /^\d*(?:\.\d*)?$/.test(raw)) {
                    onFormChange((current) => ({ ...current, spendingLimit: raw }));
                  }
                }}
              />
            </FormField>
          </RequestLimitFields>
        </FormSection>
      </form>
    </Modal>
  );
}
