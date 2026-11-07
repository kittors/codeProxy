import { useEffect, useRef, type Dispatch, type FormEvent, type SetStateAction } from "react";
import { ShieldCheck, UserPlus } from "lucide-react";
import type { ApiKeyPermissionProfile } from "@code-proxy/api-client";
import {
  Button,
  Callout,
  FormField,
  Modal,
  Select,
  TextInput,
  useFormValidation,
} from "@code-proxy/ui";
import { summarizePolicy } from "@features/access-policy";
import { displayNameRules, optionalPasswordRules } from "@features/identity-rules";
import type { EndUserForm } from "../endUserForm";

const FORM_ID = "create-end-user-form";

/**
 * 创建门户用户。
 *
 * 只有昵称必填；用户名留空按昵称生成，密码留空由服务端随机生成——这件事放在
 * 常驻的提示条里说清楚（生成的密码只显示一次），而不是藏在占位文字里。
 * 填了密码就必须满足和服务端相同的密码策略，失焦或提交时就地报错；以前只在
 * 提交后才报，或者干脆等服务端用英文拒绝。服务端的拒绝原因（`createPasswordError`）
 * 照样显示在密码框下面。
 *
 * 后端支持时创建即绑定权限模板：模板是成批管理的入口，建完再逐个去编辑页绑定太繁琐。
 */
export function EndUserCreateModal({
  t,
  open,
  form,
  setForm,
  busy,
  createPasswordError,
  setCreatePasswordError,
  profiles,
  allowProfile,
  onSubmit,
  onClose,
}: {
  t: (key: string, options?: Record<string, unknown>) => string;
  open: boolean;
  form: EndUserForm;
  setForm: Dispatch<SetStateAction<EndUserForm>>;
  busy: boolean;
  createPasswordError: string;
  setCreatePasswordError: Dispatch<SetStateAction<string>>;
  profiles: ApiKeyPermissionProfile[];
  /** 后端声明了 create-with-profile 才显示模板选择。 */
  allowProfile: boolean;
  onSubmit: (event: FormEvent) => void;
  onClose: () => void;
}) {
  const formRef = useRef<HTMLFormElement | null>(null);
  const validation = useFormValidation(form, {
    displayName: displayNameRules,
    password: optionalPasswordRules,
  });
  const { reset } = validation;

  useEffect(() => {
    if (open) reset();
  }, [open, reset]);

  // 服务端的拒绝原因优先：前端规则和服务端可能有出入，以服务端为准。
  const passwordError = createPasswordError || validation.error("password");
  const selectedProfile = profiles.find((profile) => profile.id === form.permissionProfileId);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t("end_users.create", { defaultValue: "创建用户" })}
      description={t("end_users.create_desc")}
      icon={<UserPlus />}
      size="md"
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>
            {t("common.cancel")}
          </Button>
          <Button type="submit" form={FORM_ID} variant="primary" loading={busy}>
            {t("end_users.create", { defaultValue: "创建用户" })}
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
          if (!validation.validate()) {
            event.preventDefault();
            validation.focusFirstInvalid(formRef.current);
            return;
          }
          onSubmit(event);
        }}
      >
        <FormField
          label={t("end_users.display_name", { defaultValue: "昵称" })}
          required
          description={t("end_users.display_name_hint")}
          error={validation.error("displayName")}
        >
          <TextInput
            value={form.displayName}
            onChange={(e) => setForm((f) => ({ ...f, displayName: e.target.value }))}
            {...validation.bind("displayName")}
          />
        </FormField>
        <FormField
          label={t("end_users.username", { defaultValue: "用户名" })}
          optional
          description={t("end_users.username_placeholder")}
        >
          <TextInput
            value={form.username}
            onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
            autoComplete="off"
            spellCheck={false}
          />
        </FormField>
        <FormField
          label={t("end_users.password_label")}
          optional
          description={t("identity_admin.password_requirement")}
          error={passwordError}
        >
          <TextInput
            type="password"
            value={form.password}
            autoComplete="new-password"
            onChange={(e) => {
              setForm((f) => ({ ...f, password: e.target.value }));
              if (createPasswordError) setCreatePasswordError("");
            }}
            {...validation.bind("password")}
          />
        </FormField>
        {allowProfile && profiles.length > 0 ? (
          <FormField
            label={t("access_policy.create_profile_label")}
            optional
            description={
              selectedProfile
                ? summarizePolicy(t, {
                    limits: selectedProfile["quota-limits"],
                    rules: selectedProfile["model-rules"],
                    routes: selectedProfile["model-routes"],
                  })
                : t("access_policy.create_profile_hint")
            }
          >
            <Select
              value={form.permissionProfileId}
              onChange={(value) => setForm((f) => ({ ...f, permissionProfileId: value }))}
              options={[
                { value: "", label: t("access_policy.create_profile_none") },
                ...profiles.map((profile) => ({
                  value: profile.id,
                  label: (
                    <span className="inline-flex items-center gap-1.5">
                      <ShieldCheck
                        size={14}
                        aria-hidden="true"
                        className="text-ink-3 icon-hue:text-violet-500 icon-hue:dark:text-violet-400"
                      />
                      {profile.name}
                    </span>
                  ),
                  triggerLabel: profile.name,
                })),
              ]}
              aria-label={t("access_policy.create_profile_label")}
              fullWidth
            />
          </FormField>
        ) : null}
        <Callout tone="info">{t("end_users.password_hint")}</Callout>
      </form>
    </Modal>
  );
}
