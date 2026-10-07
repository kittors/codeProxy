import {
  IDENTITY_DISPLAY_NAME_MAX_BYTES,
  IDENTITY_USERNAME_MAX_BYTES,
  normalizeUsername,
  utf8ByteLength,
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

export const emptyCreateUserForm = (): CreateUserForm => ({
  username: "",
  displayName: "",
  passwordMode: "auto",
  password: "",
  roleIds: [],
});
