import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { ShieldCheck } from "lucide-react";
import { identityApi } from "@code-proxy/api-client";
import {
  Button,
  Checkbox,
  PageBackground,
  TextInput,
  ThemeToggleButton,
  useToast,
} from "@code-proxy/ui";
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
  const [showPasswords, setShowPasswords] = useState(false);
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
    <PageBackground variant="login">
      <div className="absolute right-6 top-6 z-20">
        <ThemeToggleButton className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-200 bg-white/70 text-slate-700 shadow-sm backdrop-blur transition hover:bg-white dark:border-neutral-800 dark:bg-neutral-950/60 dark:text-slate-200" />
      </div>
      <main className="relative flex min-h-[100dvh] items-center justify-center px-6 py-12">
        <div className="w-full max-w-md">
          <section className="rounded-3xl border border-white/70 bg-white/90 p-7 shadow-xl shadow-slate-300/25 backdrop-blur-xl sm:p-9 dark:border-white/10 dark:bg-neutral-950/85 dark:shadow-black/25">
            <div className="mb-8 text-center">
              <div className="mx-auto mb-4 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-900 text-white shadow-sm dark:bg-white dark:text-neutral-950">
                <ShieldCheck size={22} aria-hidden="true" />
              </div>
              <h1 className="text-2xl font-semibold tracking-tight text-slate-950 dark:text-white">
                {t("identity_admin.change_password")}
              </h1>
              <p className="mt-2 text-sm text-slate-500 dark:text-white/55">
                {t("identity_admin.password_requirement")}
              </p>
            </div>

            <form className="space-y-5" onSubmit={submit}>
              <label className="block space-y-2">
                <span className="text-xs font-medium text-slate-600 dark:text-white/60">
                  {t("identity_admin.current_password")}
                </span>
                <TextInput
                  type={showPasswords ? "text" : "password"}
                  value={currentPassword}
                  onChange={(event) => setCurrentPassword(event.target.value)}
                  autoComplete="current-password"
                  required
                />
              </label>

              <div className="h-px bg-black/[0.06] dark:bg-white/10" />

              <label className="block space-y-2">
                <span className="text-xs font-medium text-slate-600 dark:text-white/60">
                  {t("identity_admin.new_password")}
                </span>
                <TextInput
                  type={showPasswords ? "text" : "password"}
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                  autoComplete="new-password"
                  required
                  minLength={12}
                />
              </label>

              <label className="block space-y-2">
                <span className="text-xs font-medium text-slate-600 dark:text-white/60">
                  {t("identity_admin.confirm_new_password")}
                </span>
                <TextInput
                  type={showPasswords ? "text" : "password"}
                  value={confirm}
                  onChange={(event) => setConfirm(event.target.value)}
                  autoComplete="new-password"
                  required
                  minLength={12}
                />
              </label>

              <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-600 dark:text-white/70">
                <Checkbox checked={showPasswords} onCheckedChange={setShowPasswords} />
                {t(
                  showPasswords ? "identity_admin.hide_passwords" : "identity_admin.show_passwords",
                )}
              </label>

              <Button type="submit" variant="primary" disabled={loading} className="h-11 w-full">
                {loading ? t("identity_admin.saving") : t("identity_admin.save_password")}
              </Button>
            </form>
          </section>
        </div>
      </main>
    </PageBackground>
  );
}
