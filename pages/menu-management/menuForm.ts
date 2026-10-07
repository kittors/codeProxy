import type { MenuIdentity, MenuType, MenuWriteBody } from "@code-proxy/api-client";
import { rules, type Rule, type ValidationSchema } from "@code-proxy/ui";

export const emptyMenuForm = (): MenuWriteBody => ({
  code: "",
  parent_code: "",
  type: "menu",
  path: "",
  component: "",
  link_url: "",
  label_key: "",
  title: "",
  icon: "",
  permission_code: "",
  sort_order: 10,
  visible: true,
  enabled: true,
  badge_type: "",
  badge_content: "",
  hide_menu: false,
});

export const parentPathPrefix = (menus: MenuIdentity[], parentCode: string) => {
  if (!parentCode) return "";
  const parent = menus.find((item) => item.code === parentCode);
  return (parent?.path ?? "").replace(/\/$/, "");
};

export const toMenuWriteBody = (menu: MenuIdentity): MenuWriteBody => ({
  parent_code: menu.parent_code ?? "",
  type: menu.type,
  path: menu.path ?? "",
  component: menu.component ?? "",
  link_url: menu.link_url ?? "",
  label_key: menu.label_key,
  title: menu.title ?? "",
  icon: menu.icon ?? "",
  permission_code: menu.permission_code ?? "",
  sort_order: menu.sort_order,
  visible: menu.visible,
  enabled: menu.enabled,
  badge_type: menu.badge_type ?? "",
  badge_content: menu.badge_content ?? "",
  hide_menu: menu.hide_menu ?? false,
  version: menu.version,
});

/** 每种类型需要哪些字段（与 CliRelay normalizeMenuInput 一致：按钮没有地址和组件）。 */
export const menuFieldsFor = (type: MenuType) => ({
  path: type === "directory" || type === "menu" || type === "embed" || type === "link",
  component: type === "directory" || type === "menu",
  link: type === "embed" || type === "link",
  permission: type !== "directory",
});

/**
 * 与服务端校验对齐的规则：编码、标题键必填；有地址的类型地址必填且以 / 开头，
 * 挂在带地址的目录下时要落在目录地址之下；内嵌 / 外链必须有链接；排序 0–10000。
 * 权限标识是否存在只有服务端知道，仍由保存时的错误提示兜底。
 */
export function menuValidationSchema(
  form: MenuWriteBody,
  menus: MenuIdentity[],
  creating: boolean,
): ValidationSchema<MenuWriteBody> {
  const fields = menuFieldsFor(form.type);
  const parent = form.parent_code ? menus.find((menu) => menu.code === form.parent_code) : null;
  const prefix =
    parent?.type === "directory" && parent.path && form.type !== "directory"
      ? parent.path.replace(/\/$/, "")
      : "";
  const pathRules: Rule<string>[] = [
    rules.required(),
    rules.custom<string>((value) => value.trim().startsWith("/") || "path_slash"),
  ];
  if (prefix) {
    pathRules.push((value) => {
      const path = value.trim();
      return path === prefix || path.startsWith(`${prefix}/`)
        ? null
        : { key: "path_under_parent", params: { prefix } };
    });
  }
  return {
    code: creating ? [rules.required()] : undefined,
    label_key: [rules.required()],
    path: fields.path ? pathRules : undefined,
    link_url: fields.link ? [rules.required()] : undefined,
    sort_order: [rules.integer({ min: 0, max: 10000 })],
  };
}
