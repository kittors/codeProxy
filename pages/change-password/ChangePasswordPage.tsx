import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { identityApi } from "@code-proxy/api-client";
import { TextInput, useToast } from "@code-proxy/ui";
import { useAuth } from "@app/providers/AuthProvider";

export function ChangePasswordPage() {
  const navigate = useNavigate();
  const { notify } = useToast();
  const { t } = useTranslation();
  const {
    actions: { restore },
  } = useAuth();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (newPassword !== confirm) {
      notify({ type: "error", message: t("identity_admin.passwords_do_not_match") });
      return;
    }
    setLoading(true);
    try {
      await identityApi.changePassword({
        current_password: currentPassword,
        new_password: newPassword,
      });
      await restore();
      notify({ type: "success", message: t("identity_admin.password_changed") });
      navigate("/dashboard", { replace: true });
    } catch (error) {
      notify({
        type: "error",
        message:
          error instanceof Error ? error.message : t("identity_admin.password_change_failed"),
      });
    } finally {
      setLoading(false);
    }
  };
  return (
    <div className="mx-auto max-w-lg">
      <h2 className="text-2xl font-semibold text-slate-950 dark:text-white">
        {t("identity_admin.change_password")}
      </h2>
      <p className="mt-2 text-sm text-slate-500">{t("identity_admin.password_requirement")}</p>
      <form
        onSubmit={submit}
        className="mt-6 space-y-4 rounded-2xl border border-slate-200 bg-white p-6 dark:border-neutral-800 dark:bg-neutral-950"
      >
        <TextInput
          type="password"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          placeholder={t("identity_admin.current_password")}
          required
        />
        <TextInput
          type="password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          placeholder={t("identity_admin.new_password")}
          required
          minLength={12}
        />
        <TextInput
          type="password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          placeholder={t("identity_admin.confirm_new_password")}
          required
          minLength={12}
        />
        <button
          disabled={loading}
          className="w-full rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60 dark:bg-white/10"
        >
          {loading ? t("identity_admin.saving") : t("identity_admin.save_password")}
        </button>
      </form>
    </div>
  );
}
