import {
  IDENTITY_DISPLAY_NAME_MAX_BYTES,
  IDENTITY_USERNAME_MAX_BYTES,
  normalizeUsername,
  utf8ByteLength,
  validateDisplayName,
  validatePassword,
  validateUsername,
  type IdentityValidationCode,
} from "@code-proxy/domain";

export {
  IDENTITY_DISPLAY_NAME_MAX_BYTES,
  IDENTITY_USERNAME_MAX_BYTES,
  normalizeUsername,
  utf8ByteLength,
};

export type PasswordMode = "auto" | "manual";

export type CreateUserForm = {
  username: string;
  displayName: string;
  passwordMode: PasswordMode;
  password: string;
  roleIds: string[];
};

export type CreateUserFormErrors = Partial<
  Record<"username" | "displayName" | "password", string>
>;

export const emptyCreateUserForm = (): CreateUserForm => ({
  username: "",
  displayName: "",
  passwordMode: "auto",
  password: "",
  roleIds: [],
});

export function validationCodeToMessage(
  code: IdentityValidationCode,
  t: (key: string) => string,
): string {
  const key = `identity_admin.${code}`;
  const msg = t(key);
  return msg === key ? t("identity_admin.field_required") : msg;
}

export function validateCreateUserForm(
  form: CreateUserForm,
  t: (key: string) => string,
): CreateUserFormErrors {
  const errors: CreateUserFormErrors = {};
  const usernameResult = validateUsername(form.username);
  if (!usernameResult.ok) {
    errors.username = validationCodeToMessage(usernameResult.code, t);
  }
  const displayResult = validateDisplayName(form.displayName);
  if (!displayResult.ok) {
    errors.displayName = validationCodeToMessage(displayResult.code, t);
  }
  if (form.passwordMode === "manual") {
    const passwordResult = validatePassword(form.password);
    if (!passwordResult.ok) {
      errors.password = validationCodeToMessage(passwordResult.code, t);
    }
  }
  return errors;
}

export function validateResetPassword(
  password: string,
  t: (key: string) => string,
): string {
  const result = validatePassword(password);
  if (result.ok) return "";
  return validationCodeToMessage(result.code, t);
}
