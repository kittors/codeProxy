import type { Dispatch, FormEvent, SetStateAction } from "react";
import type { ApiKeyPermissionProfile, EndUser } from "@code-proxy/api-client";
import { Button, Modal, Select, TextInput } from "@code-proxy/ui";
import {
  PeriodSpendingFields,
  formatQuotaUsdAmount,
  limitsToPeriodSpendingDraft,
  remainingQuotaUsd,
} from "@features/period-spending";
import type { EndUserForm } from "../endUserForm";
import { limitToText } from "../endUserForm";

/**
 * Account edit dialog. Split out of EndUsersPage so the page keeps shrinking
 * under the file-size gate; behaviour is unchanged.
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
  const editUser = user;
  const editForm = form;
  const setEditForm = onFormChange;
  const selectedEditProfile = selectedProfile;
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t("end_users.edit", { defaultValue: "编辑用户账号" })}
      maxWidth="max-w-2xl"
      footer={
        <>
          <Button onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button
            type="submit"
            form="edit-end-user-form"
            variant="primary"
            disabled={busy || !editForm.displayName.trim() || !editForm.username.trim()}
          >
            {t("common.save", { defaultValue: "保存" })}
          </Button>
        </>
      }
    >
      <form id="edit-end-user-form" className="space-y-3" onSubmit={onSubmit}>
        <label className="block space-y-1.5">
          <span className="text-sm font-medium">
            {t("end_users.display_name", { defaultValue: "昵称" })}
          </span>
          <TextInput
            value={editForm.displayName}
            onChange={(e) => setEditForm((f) => ({ ...f, displayName: e.target.value }))}
            required
          />
        </label>
        <label className="block space-y-1.5">
          <span className="text-sm font-medium">
            {t("end_users.username", { defaultValue: "用户名" })}
          </span>
          <TextInput
            value={editForm.username}
            onChange={(e) => setEditForm((f) => ({ ...f, username: e.target.value }))}
            required
          />
        </label>
        <label className="block space-y-1.5">
          <span className="text-sm font-medium">
            {t("end_users.password", { defaultValue: "新密码（可选）" })}
          </span>
          <TextInput
            type="password"
            value={editForm.password}
            onChange={(e) => setEditForm((f) => ({ ...f, password: e.target.value }))}
            placeholder={t("end_users.password_keep", { defaultValue: "留空则不改密码" })}
            autoComplete="new-password"
          />
        </label>
        <label className="block space-y-1.5">
          <span className="text-sm font-medium">
            {t("end_users.account_permission_profile", { defaultValue: "账户权限模板" })}
          </span>
          <Select
            value={editForm.permissionProfileId}
            onChange={(value) => {
              const profile = permissionProfiles.find((item) => item.id === value);
              setEditForm((current) => ({
                ...current,
                permissionProfileId: value,
                dailyLimit: profile ? limitToText(profile["daily-limit"]) : current.dailyLimit,
                totalQuota: profile ? limitToText(profile["total-quota"]) : current.totalQuota,
                concurrencyLimit: profile
                  ? limitToText(profile["concurrency-limit"])
                  : current.concurrencyLimit,
                rpmLimit: profile ? limitToText(profile["rpm-limit"]) : current.rpmLimit,
                tpmLimit: profile ? limitToText(profile["tpm-limit"]) : current.tpmLimit,
                periodSpending: profile
                  ? limitsToPeriodSpendingDraft(profile["period-spending-limits"])
                  : current.periodSpending,
              }));
            }}
            options={permissionProfileOptions}
            aria-label={t("end_users.account_permission_profile", {
              defaultValue: "账户权限模板",
            })}
            placeholder={t("end_users.account_permission_profile_placeholder", {
              defaultValue: "选择账户权限模板",
            })}
          />
          <p className="text-xs text-slate-400 dark:text-white/40">
            {t("end_users.quota_on_account_hint", {
              defaultValue: "限额与模型/渠道权限挂在账号上，该用户所有密钥共用。",
            })}
          </p>
        </label>
        <section className="rounded-2xl border border-indigo-200/80 bg-indigo-50/45 p-4 dark:border-indigo-500/20 dark:bg-indigo-500/5">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
            {t("end_users.quota_preview")}
          </h3>
          <p className="mb-3 mt-1 text-xs text-slate-500 dark:text-white/50">
            {selectedEditProfile
              ? t("end_users.quota_profile_readonly_hint", { profile: selectedEditProfile.name })
              : t("end_users.quota_direct_edit_hint")}
          </p>
          <PeriodSpendingFields
            t={t}
            value={
              selectedEditProfile
                ? limitsToPeriodSpendingDraft(selectedEditProfile["period-spending-limits"])
                : editForm.periodSpending
            }
            onChange={(periodSpending) =>
              setEditForm((current) => ({ ...current, periodSpending }))
            }
            disabled={Boolean(selectedEditProfile)}
            idPrefix="end-user-period"
          />
        </section>

        <section className="rounded-2xl border border-slate-900/8 p-4 dark:border-white/10">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
            {t("end_users.other_limits")}
          </h3>
          <p className="mb-3 mt-1 text-xs text-slate-500 dark:text-white/50">
            {selectedEditProfile
              ? t("end_users.other_limits_profile_readonly_hint", {
                  profile: selectedEditProfile.name,
                })
              : t("end_users.other_limits_direct_hint")}
          </p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {(
              [
                ["dailyLimit", "api_keys_page.form_daily_limit"],
                ["totalQuota", "api_keys_page.form_total_quota"],
                ["concurrencyLimit", "api_keys_page.form_concurrency_limit"],
                ["rpmLimit", "api_keys_page.form_rpm_limit"],
                ["tpmLimit", "api_keys_page.form_tpm_limit"],
              ] as const
            ).map(([field, labelKey]) => (
              <label key={field} className="block space-y-1.5">
                <span className="text-sm font-medium text-slate-700 dark:text-white/80">
                  {t(labelKey)}
                </span>
                <TextInput
                  type="number"
                  min={0}
                  step={1}
                  inputMode="numeric"
                  value={editForm[field]}
                  disabled={Boolean(selectedEditProfile)}
                  aria-label={t(labelKey)}
                  placeholder={t("quota.input_unlimited")}
                  onChange={(event) => {
                    const raw = event.target.value;
                    if (raw === "" || /^\d+$/.test(raw)) {
                      setEditForm((current) => ({ ...current, [field]: raw }));
                    }
                  }}
                />
              </label>
            ))}
            <label className="block space-y-1.5 sm:col-span-2 lg:col-span-1">
              <span className="text-sm font-medium text-slate-700 dark:text-white/80">
                {t("end_users.lifetime_spending_limit")}
              </span>
              <TextInput
                type="number"
                min={0}
                step={1}
                inputMode="numeric"
                value={editForm.spendingLimit}
                aria-label={t("end_users.lifetime_spending_limit")}
                placeholder={t("quota.input_unlimited")}
                onChange={(event) => {
                  const raw = event.target.value;
                  if (raw === "" || /^\d*(?:\.\d*)?$/.test(raw)) {
                    setEditForm((current) => ({ ...current, spendingLimit: raw }));
                  }
                }}
              />
              {(editUser?.["spending-limit"] ?? 0) > 0 ? (
                <span className="block text-xs text-slate-500 tabular-nums dark:text-white/55">
                  {t("quota.lifetime_usage_hint", {
                    used: formatQuotaUsdAmount(editUser?.["lifetime-spending-used"]),
                    remaining: formatQuotaUsdAmount(
                      remainingQuotaUsd(
                        editUser?.["spending-limit"],
                        editUser?.["lifetime-spending-used"],
                      ),
                    ),
                  })}
                </span>
              ) : null}
              <span className="block text-xs text-slate-400 dark:text-white/40">
                {t("end_users.lifetime_spending_limit_hint")}
              </span>
            </label>
          </div>
        </section>
      </form>
    </Modal>
  );
}
