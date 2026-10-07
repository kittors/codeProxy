import {
  lazy,
  Suspense,
  useEffect,
  useRef,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";
import { useTranslation } from "react-i18next";
import {
  AppWindow,
  ExternalLink,
  Eye,
  FolderTree,
  Frame,
  Lock,
  MousePointerClick,
  PanelsTopLeft,
  Route,
} from "lucide-react";
import type { MenuIdentity, MenuType, MenuWriteBody } from "@code-proxy/api-client";
import {
  Button,
  Callout,
  CheckboxField,
  ChoiceCards,
  Drawer,
  FormField,
  FormSection,
  SearchableSelect,
  SettingGroup,
  SettingRow,
  TextInput,
  ToggleSwitch,
  useFormValidation,
  type SearchableSelectOption,
} from "@code-proxy/ui";
import { menuFieldsFor, menuValidationSchema, parentPathPrefix } from "./menuForm";

const MenuIconPicker = lazy(() =>
  import("./MenuIconPicker").then((module) => ({ default: module.MenuIconPicker })),
);

const FORM_ID = "menu-form";

/** 类型名称沿用列表里的文案键；说明是新加的，写清每种类型做什么用。 */
const TYPE_LABEL_KEY: Record<MenuType, string> = {
  directory: "identity_admin.menu_directory",
  menu: "identity_admin.menu_page",
  button: "identity_admin.menu_button",
  embed: "identity_admin.menu_embed",
  link: "identity_admin.menu_link",
};

const TYPE_ICON: Record<MenuType, ReactNode> = {
  directory: <FolderTree />,
  menu: <AppWindow />,
  button: <MousePointerClick />,
  embed: <Frame />,
  link: <ExternalLink />,
};

/**
 * 新增 / 修改菜单（全站唯一的抽屉表单）。
 *
 * 十几个字段按「是什么 → 去哪儿 → 谁能看到、怎么显示」分成三段；类型用卡片单选并写明每种类型的用途；
 * 标题键、组件、权限标识这类技术字段都带一句说明。「隐藏菜单」和「不显示」以前是两个裸复选框，
 * 读不出区别：前者只是不在侧边栏列出、地址仍能直接打开；后者连同下级一起从导航隐藏，
 * 内嵌页的地址也会失效（见 navModel / AppRouter 的过滤逻辑）。
 */
export function MenuFormDrawer({
  open,
  mode,
  editing,
  form,
  setForm,
  menus,
  parentOptions,
  busy,
  onSubmit,
  onClose,
}: {
  open: boolean;
  mode: "create" | "edit";
  editing: MenuIdentity | null;
  form: MenuWriteBody;
  setForm: Dispatch<SetStateAction<MenuWriteBody>>;
  menus: MenuIdentity[];
  parentOptions: SearchableSelectOption[];
  busy: boolean;
  onSubmit: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const formRef = useRef<HTMLFormElement | null>(null);
  const creating = mode === "create";
  const validation = useFormValidation(form, menuValidationSchema(form, menus, creating));
  const { reset } = validation;
  const fields = menuFieldsFor(form.type);
  // 系统内置菜单的类型由服务端锁定（其余字段仍可调整），这里同步禁用类型选择并说明原因。
  const typeLocked = !creating && Boolean(editing?.system_protected);
  const prefix = parentPathPrefix(menus, form.parent_code || "");

  useEffect(() => {
    if (open) reset();
  }, [open, mode, editing?.code, reset]);

  const update = (patch: Partial<MenuWriteBody>) =>
    setForm((current) => ({ ...current, ...patch }));

  const changeType = (type: MenuType) => {
    if (typeLocked) return;
    setForm((current) => {
      const next = { ...current, type };
      if (type === "directory") {
        next.component = current.component || "Layout";
        next.link_url = "";
        next.permission_code = "";
      }
      return next;
    });
  };

  const submit = () => {
    if (!validation.validate()) {
      validation.focusFirstInvalid(formRef.current);
      return;
    }
    onSubmit();
  };

  const typeOptions = (["directory", "menu", "button", "embed", "link"] as const).map((type) => ({
    value: type,
    label: t(TYPE_LABEL_KEY[type]),
    description: t(`identity_admin.menu_type_desc.${type}`),
    icon: TYPE_ICON[type],
  }));

  return (
    <Drawer
      open={open}
      title={creating ? t("identity_admin.menu_create") : t("identity_admin.menu_edit")}
      description={
        creating
          ? t("identity_admin.menu_create_desc")
          : t("identity_admin.menu_edit_desc", { code: editing?.code ?? "" })
      }
      icon={<PanelsTopLeft />}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>
            {t("common.cancel")}
          </Button>
          <Button type="submit" form={FORM_ID} variant="primary" loading={busy}>
            {creating ? t("identity_admin.menu_create_submit") : t("identity_admin.save_changes")}
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
          event.preventDefault();
          submit();
        }}
      >
        <FormSection
          title={t("identity_admin.menu_section_basic")}
          description={t("identity_admin.menu_section_basic_desc")}
          icon={<PanelsTopLeft />}
        >
          <ChoiceCards<MenuType>
            ariaLabel={t("identity_admin.menu_type")}
            columns={3}
            value={form.type}
            disabled={typeLocked}
            onChange={changeType}
            options={typeOptions}
          />
          {typeLocked ? (
            <Callout tone="neutral" icon={<Lock />}>
              {t("identity_admin.menu_type_locked")}
            </Callout>
          ) : null}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField
              label={t("identity_admin.menu_code")}
              required={creating}
              description={
                creating ? t("identity_admin.menu_code_hint") : t("identity_admin.menu_code_locked")
              }
              error={validation.error("code")}
            >
              {creating ? (
                <TextInput
                  value={form.code ?? ""}
                  placeholder="custom.feature"
                  aria-label={t("identity_admin.menu_code")}
                  className="font-mono"
                  spellCheck={false}
                  autoComplete="off"
                  {...validation.bind("code")}
                  onChange={(event) => update({ code: event.target.value })}
                />
              ) : (
                <TextInput
                  value={editing?.code ?? ""}
                  aria-label={t("identity_admin.menu_code")}
                  className="font-mono"
                  disabled
                />
              )}
            </FormField>
            <FormField
              label={t("identity_admin.menu_parent")}
              description={t("identity_admin.menu_parent_hint")}
            >
              <SearchableSelect
                value={form.parent_code}
                onChange={(value) => update({ parent_code: value })}
                options={parentOptions}
                aria-label={t("identity_admin.menu_parent")}
                placeholder={t("identity_admin.menu_parent_none")}
                searchPlaceholder={t("identity_admin.menu_parent_search")}
                className="w-full"
              />
            </FormField>
            <FormField
              label={t("identity_admin.menu_label_key")}
              required
              description={t("identity_admin.menu_label_key_hint")}
              error={validation.error("label_key")}
            >
              <TextInput
                value={form.label_key}
                placeholder="shell.nav_users"
                aria-label={t("identity_admin.menu_label_key")}
                className="font-mono"
                spellCheck={false}
                autoComplete="off"
                {...validation.bind("label_key")}
                onChange={(event) => update({ label_key: event.target.value })}
              />
            </FormField>
            <FormField
              label={t("identity_admin.menu_title")}
              optional
              description={t("identity_admin.menu_title_hint")}
            >
              <TextInput
                value={form.title}
                aria-label={t("identity_admin.menu_title")}
                onChange={(event) => update({ title: event.target.value })}
              />
            </FormField>
            <FormField
              label={t("identity_admin.menu_icon")}
              optional
              description={t("identity_admin.menu_icon_hint")}
            >
              <Suspense
                fallback={
                  <TextInput
                    value={form.icon}
                    aria-label={t("identity_admin.menu_icon")}
                    onChange={(event) => update({ icon: event.target.value })}
                    placeholder="layout-dashboard"
                  />
                }
              >
                <MenuIconPicker
                  value={form.icon}
                  ariaLabel={t("identity_admin.menu_icon")}
                  onChange={(icon) => update({ icon })}
                />
              </Suspense>
            </FormField>
          </div>
        </FormSection>

        <FormSection
          title={t("identity_admin.menu_section_route")}
          description={t("identity_admin.menu_section_route_desc")}
          icon={<Route />}
        >
          {fields.path || fields.component || fields.link ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {fields.path ? (
                <FormField
                  label={t("identity_admin.route_address")}
                  required
                  description={
                    form.type === "directory"
                      ? t("identity_admin.menu_path_hint_directory")
                      : prefix
                        ? t("identity_admin.menu_path_hint_nested", { prefix })
                        : t("identity_admin.menu_path_hint")
                  }
                  error={validation.error("path")}
                >
                  <TextInput
                    value={form.path}
                    aria-label={t("identity_admin.route_address")}
                    className="font-mono"
                    spellCheck={false}
                    autoComplete="off"
                    placeholder={
                      form.type === "directory"
                        ? "/runtime"
                        : prefix
                          ? `${prefix}/feature`
                          : "/group/feature"
                    }
                    {...validation.bind("path")}
                    onChange={(event) => update({ path: event.target.value })}
                  />
                </FormField>
              ) : null}
              {fields.component ? (
                <FormField
                  label={t("identity_admin.page_component")}
                  optional
                  description={t("identity_admin.menu_component_hint")}
                >
                  <TextInput
                    value={form.component}
                    aria-label={t("identity_admin.page_component")}
                    className="font-mono"
                    spellCheck={false}
                    autoComplete="off"
                    placeholder={form.type === "directory" ? "Layout" : "feature-page"}
                    onChange={(event) => update({ component: event.target.value })}
                  />
                </FormField>
              ) : null}
              {fields.link ? (
                <FormField
                  label={t("identity_admin.link_url")}
                  required
                  className="sm:col-span-2"
                  description={
                    form.type === "embed"
                      ? t("identity_admin.menu_link_hint_embed")
                      : t("identity_admin.menu_link_hint_external")
                  }
                  error={validation.error("link_url")}
                >
                  <TextInput
                    value={form.link_url}
                    aria-label={t("identity_admin.link_url")}
                    className="font-mono"
                    spellCheck={false}
                    autoComplete="off"
                    placeholder="https://"
                    {...validation.bind("link_url")}
                    onChange={(event) => update({ link_url: event.target.value })}
                  />
                </FormField>
              ) : null}
            </div>
          ) : (
            <Callout tone="neutral">{t("identity_admin.menu_button_no_route")}</Callout>
          )}
        </FormSection>

        <FormSection
          title={t("identity_admin.menu_section_access")}
          description={t("identity_admin.menu_section_access_desc")}
          icon={<Eye />}
        >
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {fields.permission ? (
              <FormField
                label={t("identity_admin.permission_code")}
                optional
                className="sm:col-span-2"
                description={t("identity_admin.menu_permission_hint")}
              >
                <TextInput
                  value={form.permission_code}
                  aria-label={t("identity_admin.permission_code")}
                  className="font-mono"
                  spellCheck={false}
                  autoComplete="off"
                  placeholder="feature.read"
                  onChange={(event) => update({ permission_code: event.target.value })}
                />
              </FormField>
            ) : null}
            <FormField
              label={t("identity_admin.sort_order")}
              required
              description={t("identity_admin.menu_sort_hint")}
              error={validation.error("sort_order")}
            >
              <TextInput
                type="number"
                min={0}
                max={10000}
                value={String(form.sort_order)}
                className="tabular-nums"
                {...validation.bind("sort_order")}
                onChange={(event) =>
                  update({ sort_order: Number.parseInt(event.target.value || "0", 10) || 0 })
                }
              />
            </FormField>
            <FormField
              label={t("identity_admin.badge_content")}
              optional
              description={t("identity_admin.menu_badge_hint")}
            >
              <TextInput
                value={form.badge_content}
                aria-label={t("identity_admin.badge_content")}
                placeholder="New"
                onChange={(event) => update({ badge_content: event.target.value })}
              />
            </FormField>
          </div>
          <SettingGroup>
            <SettingRow
              label={t("identity_admin.menu_enabled")}
              description={t("identity_admin.menu_enabled_hint")}
              controlWidth="auto"
              control={
                <ToggleSwitch
                  checked={form.enabled}
                  ariaLabel={t("identity_admin.menu_enabled")}
                  onCheckedChange={(enabled) => update({ enabled })}
                />
              }
            />
          </SettingGroup>
          <div className="grid gap-2.5">
            <CheckboxField
              checked={form.hide_menu}
              onCheckedChange={(hide_menu) => update({ hide_menu })}
              label={t("identity_admin.hide_menu")}
              description={t("identity_admin.hide_menu_hint")}
            />
            <CheckboxField
              checked={!form.visible}
              onCheckedChange={(hidden) => update({ visible: !hidden })}
              label={t("identity_admin.menu_not_visible")}
              description={t("identity_admin.menu_not_visible_hint")}
            />
          </div>
        </FormSection>
      </form>
    </Drawer>
  );
}
