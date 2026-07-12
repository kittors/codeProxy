import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { ChevronRight, Pencil, Plus, Trash2 } from "lucide-react";
import {
  identityApi,
  type MenuIdentity,
  type MenuType,
  type MenuWriteBody,
} from "@code-proxy/api-client";
import {
  Button,
  ConfirmModal,
  DataTable,
  Drawer,
  Select,
  TextInput,
  type DataTableColumn,
  useToast,
} from "@code-proxy/ui";
import { useAuth } from "@app/providers/AuthProvider";
import { resolveMenuIcon } from "@app/navigation/menuIconMap";

type DrawerMode = "create" | "edit";

const emptyForm = (): MenuWriteBody => ({
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

const toWriteBody = (menu: MenuIdentity): MenuWriteBody => ({
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

const typeBadgeClass = (type: MenuType) => {
  switch (type) {
    case "directory":
      return "bg-blue-500/15 text-blue-600 dark:text-blue-300";
    case "menu":
      return "bg-slate-500/15 text-slate-600 dark:text-slate-300";
    case "button":
      return "bg-rose-500/15 text-rose-600 dark:text-rose-300";
    case "embed":
      return "bg-emerald-500/15 text-emerald-600 dark:text-emerald-300";
    case "link":
      return "bg-amber-500/15 text-amber-700 dark:text-amber-300";
    default:
      return "bg-slate-500/15 text-slate-600";
  }
};

export function MenuManagementPage() {
  const { t } = useTranslation();
  const { notify } = useToast();
  const { can } = useAuth();
  const canUpdate = can("platform.menus.update");
  const [menus, setMenus] = useState<MenuIdentity[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const expansionInitialized = useRef(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerMode, setDrawerMode] = useState<DrawerMode>("create");
  const [editing, setEditing] = useState<MenuIdentity | null>(null);
  const [form, setForm] = useState<MenuWriteBody>(emptyForm);
  const [deleteTarget, setDeleteTarget] = useState<MenuIdentity | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setMenus((await identityApi.menus()).items ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => void load(), [load]);

  const childrenByParent = useMemo(() => {
    const children = new Map<string, MenuIdentity[]>();
    for (const menu of menus) {
      const parent = menu.parent_code ?? "";
      children.set(parent, [...(children.get(parent) ?? []), menu]);
    }
    for (const siblings of children.values()) {
      siblings.sort((a, b) => a.sort_order - b.sort_order || a.code.localeCompare(b.code));
    }
    return children;
  }, [menus]);

  useEffect(() => {
    if (expansionInitialized.current || menus.length === 0) return;
    expansionInitialized.current = true;
    setExpanded(
      new Set(
        menus
          .filter((menu) => (childrenByParent.get(menu.code)?.length ?? 0) > 0)
          .map((menu) => menu.code),
      ),
    );
  }, [childrenByParent, menus]);

  const rows = useMemo(() => {
    const result: Array<MenuIdentity & { depth: number; hasChildren: boolean }> = [];
    const append = (parentCode: string, depth: number) => {
      for (const menu of childrenByParent.get(parentCode) ?? []) {
        const hasChildren = (childrenByParent.get(menu.code)?.length ?? 0) > 0;
        result.push({ ...menu, depth, hasChildren });
        if (hasChildren && expanded.has(menu.code)) append(menu.code, depth + 1);
      }
    };
    append("", 0);
    return result;
  }, [childrenByParent, expanded]);

  const parentOptions = useMemo(
    () => [
      { value: "", label: t("identity_admin.menu_parent_none") },
      ...menus
        .filter((menu) => menu.type === "directory" || menu.type === "menu")
        .map((menu) => ({
          value: menu.code,
          label: `${t(menu.label_key, { defaultValue: menu.title || menu.code })} (${menu.code})`,
        })),
    ],
    [menus, t],
  );

  const openCreate = (parentCode = "") => {
    setDrawerMode("create");
    setEditing(null);
    setForm({ ...emptyForm(), parent_code: parentCode });
    setDrawerOpen(true);
  };

  const openEdit = (menu: MenuIdentity) => {
    setDrawerMode("edit");
    setEditing(menu);
    setForm(toWriteBody(menu));
    setDrawerOpen(true);
  };

  const saveDrawer = async (event: FormEvent) => {
    event.preventDefault();
    if (!canUpdate) return;
    setBusy(true);
    try {
      if (drawerMode === "create") {
        await identityApi.createMenu({
          ...form,
          code: form.code?.trim() || undefined,
        });
        notify({ type: "success", message: t("identity_admin.menu_created") });
      } else if (editing) {
        await identityApi.updateMenu(editing.code, { ...form, version: editing.version });
        notify({ type: "success", message: t("identity_admin.menu_updated") });
      }
      setDrawerOpen(false);
      await load();
    } catch (error) {
      notify({
        type: "error",
        message: error instanceof Error ? error.message : t("identity_admin.operation_failed"),
      });
    } finally {
      setBusy(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget || !canUpdate) return;
    setBusy(true);
    try {
      await identityApi.deleteMenu(deleteTarget.code, deleteTarget.version);
      notify({ type: "success", message: t("identity_admin.menu_deleted") });
      setDeleteTarget(null);
      await load();
    } catch (error) {
      notify({
        type: "error",
        message: error instanceof Error ? error.message : t("identity_admin.operation_failed"),
      });
    } finally {
      setBusy(false);
    }
  };

  const typeLabel = (type: MenuType) => {
    switch (type) {
      case "directory":
        return t("identity_admin.menu_directory");
      case "menu":
        return t("identity_admin.menu_page");
      case "button":
        return t("identity_admin.menu_button");
      case "embed":
        return t("identity_admin.menu_embed");
      case "link":
        return t("identity_admin.menu_link");
      default:
        return type;
    }
  };

  const columns = useMemo<DataTableColumn<(typeof rows)[number]>[]>(
    () => [
      {
        key: "menu",
        label: t("identity_admin.menu"),
        width: "w-64",
        render: (menu) => {
          const isExpanded = expanded.has(menu.code);
          const label = t(menu.label_key, { defaultValue: menu.title || menu.code });
          const Icon = resolveMenuIcon(menu.icon);
          return (
            <div className="flex min-w-0 items-center gap-2" style={{ paddingLeft: menu.depth * 22 }}>
              {menu.hasChildren ? (
                <Button
                  size="xs"
                  variant="ghost"
                  tooltip={
                    isExpanded ? t("identity_admin.tree_collapse") : t("identity_admin.tree_expand")
                  }
                  aria-expanded={isExpanded}
                  onClick={() => {
                    setExpanded((current) => {
                      const next = new Set(current);
                      if (isExpanded) next.delete(menu.code);
                      else next.add(menu.code);
                      return next;
                    });
                  }}
                >
                  <ChevronRight
                    size={15}
                    className={isExpanded ? "rotate-90 transition-transform" : "transition-transform"}
                  />
                </Button>
              ) : (
                <span className="h-7 w-7" aria-hidden="true" />
              )}
              <Icon size={16} className="shrink-0 text-slate-400" aria-hidden="true" />
              <span className="min-w-0">
                <span className="flex min-w-0 items-center gap-1.5">
                  <span className="truncate font-medium text-slate-900 dark:text-white">{label}</span>
                  {menu.badge_content ? (
                    <span className="shrink-0 rounded-full bg-blue-500 px-1.5 py-0.5 text-2xs font-medium text-white">
                      {menu.badge_content}
                    </span>
                  ) : null}
                </span>
                <span className="block truncate text-xs text-slate-400">{menu.code}</span>
              </span>
            </div>
          );
        },
      },
      {
        key: "type",
        label: t("identity_admin.menu_type"),
        width: "w-24",
        render: (menu) => (
          <span
            className={`inline-flex rounded-md px-2 py-0.5 text-xs font-medium ${typeBadgeClass(menu.type)}`}
          >
            {typeLabel(menu.type)}
          </span>
        ),
      },
      {
        key: "permission",
        label: t("identity_admin.permission_code"),
        width: "w-40",
        render: (menu) => (
          <span className="truncate text-xs text-slate-600 dark:text-slate-300">
            {menu.permission_code || "—"}
          </span>
        ),
      },
      {
        key: "route",
        label: t("identity_admin.route_address"),
        width: "w-40",
        render: (menu) => (
          <div className="min-w-0 text-xs">
            <div className="truncate text-slate-700 dark:text-slate-200">{menu.path || "—"}</div>
            {menu.link_url ? (
              <div className="truncate text-slate-400">{menu.link_url}</div>
            ) : null}
          </div>
        ),
      },
      {
        key: "component",
        label: t("identity_admin.page_component"),
        width: "w-36",
        render: (menu) => (
          <span className="truncate text-xs text-slate-600 dark:text-slate-300">
            {menu.component || "—"}
          </span>
        ),
      },
      {
        key: "status",
        label: t("identity_admin.status"),
        width: "w-24",
        render: (menu) => (
          <span
            className={
              menu.enabled
                ? "inline-flex rounded-md bg-emerald-500/12 px-2 py-0.5 text-xs font-medium text-emerald-600 dark:text-emerald-300"
                : "inline-flex rounded-md bg-rose-500/12 px-2 py-0.5 text-xs font-medium text-rose-600 dark:text-rose-300"
            }
          >
            {menu.enabled
              ? t("identity_admin.menu_status_enabled")
              : t("identity_admin.menu_status_disabled")}
          </span>
        ),
      },
      {
        key: "actions",
        label: t("identity_admin.actions"),
        width: "w-28",
        render: (menu) => (
          <div className="flex items-center gap-1">
            <Button
              size="xs"
              variant="ghost"
              disabled={!canUpdate || menu.type === "button" || menu.type === "link"}
              tooltip={t("identity_admin.menu_add_child")}
              onClick={() => openCreate(menu.code)}
            >
              <Plus size={15} />
            </Button>
            <Button
              size="xs"
              variant="ghost"
              disabled={!canUpdate}
              tooltip={t("identity_admin.edit")}
              onClick={() => openEdit(menu)}
            >
              <Pencil size={15} />
            </Button>
            <Button
              size="xs"
              variant="ghost"
              disabled={!canUpdate || menu.system_protected}
              tooltip={t("identity_admin.delete")}
              onClick={() => setDeleteTarget(menu)}
            >
              <Trash2 size={15} />
            </Button>
          </div>
        ),
      },
    ],
    [canUpdate, expanded, t],
  );

  const showPath = form.type === "menu" || form.type === "embed" || form.type === "link";
  const showComponent = form.type === "menu";
  const showLink = form.type === "embed" || form.type === "link";
  const showPermission = form.type !== "directory";

  return (
    <section className="flex flex-1 flex-col">
      <div className="flex flex-1 flex-col rounded-2xl border border-black/[0.06] bg-white shadow-[0_1px_2px_rgb(15_23_42_/_0.035)] dark:border-white/[0.06] dark:bg-neutral-950/70 dark:shadow-[0_1px_2px_rgb(0_0_0_/_0.22)]">
        <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-3">
          <div>
            <h2 className="text-base font-semibold text-slate-950 dark:text-white">
              {t("identity_admin.menu_management_title")}
            </h2>
            <p className="text-sm text-slate-500">{t("identity_admin.menu_management_description")}</p>
          </div>
          {canUpdate ? (
            <Button variant="primary" size="sm" onClick={() => openCreate("")}>
              <Plus size={15} className="mr-1" />
              {t("identity_admin.menu_create")}
            </Button>
          ) : null}
        </div>
        <div className="relative h-[calc(100dvh-250px)] min-h-[420px] overflow-hidden px-5 pb-5">
          <DataTable<(typeof rows)[number]>
            tableId="identity-menus"
            rows={rows}
            columns={columns}
            rowKey={(menu) => menu.code}
            loading={loading}
            virtualize={false}
            rowHeight={60}
            height="h-full"
            minHeight="min-h-full"
            minWidth="min-w-[1100px]"
            emptyText={t("identity_admin.no_menus")}
            showAllLoadedMessage={false}
            columnReorderable={false}
          />
        </div>
      </div>

      <Drawer
        open={drawerOpen}
        title={
          drawerMode === "create"
            ? t("identity_admin.menu_create")
            : t("identity_admin.menu_edit")
        }
        onClose={() => setDrawerOpen(false)}
        footer={
          <>
            <Button onClick={() => setDrawerOpen(false)}>{t("common.cancel")}</Button>
            <Button type="submit" form="menu-form" variant="primary" disabled={busy}>
              {t("identity_admin.save")}
            </Button>
          </>
        }
      >
        <form id="menu-form" onSubmit={saveDrawer} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="space-y-1.5 sm:col-span-2">
            <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
              {t("identity_admin.menu_type")}
            </span>
            <Select
              value={form.type}
              onChange={(value) => setForm((current) => ({ ...current, type: value as MenuType }))}
              options={[
                { value: "directory", label: t("identity_admin.menu_directory") },
                { value: "menu", label: t("identity_admin.menu_page") },
                { value: "button", label: t("identity_admin.menu_button") },
                { value: "embed", label: t("identity_admin.menu_embed") },
                { value: "link", label: t("identity_admin.menu_link") },
              ]}
              disabled={drawerMode === "edit" && Boolean(editing?.system_protected)}
            />
          </label>
          {drawerMode === "create" ? (
            <label className="space-y-1.5">
              <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
                {t("identity_admin.menu_code")}
              </span>
              <TextInput
                value={form.code ?? ""}
                onChange={(event) => setForm((current) => ({ ...current, code: event.target.value }))}
                required
                placeholder="custom.feature"
              />
            </label>
          ) : (
            <label className="space-y-1.5">
              <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
                {t("identity_admin.menu_code")}
              </span>
              <TextInput value={editing?.code ?? ""} disabled />
            </label>
          )}
          <label className="space-y-1.5">
            <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
              {t("identity_admin.menu_parent")}
            </span>
            <Select
              value={form.parent_code}
              onChange={(value) => setForm((current) => ({ ...current, parent_code: value }))}
              options={parentOptions.filter((option) => option.value !== editing?.code)}
            />
          </label>
          <label className="space-y-1.5">
            <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
              {t("identity_admin.menu_label_key")}
            </span>
            <TextInput
              value={form.label_key}
              onChange={(event) => setForm((current) => ({ ...current, label_key: event.target.value }))}
              required
            />
          </label>
          <label className="space-y-1.5">
            <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
              {t("identity_admin.menu_title")}
            </span>
            <TextInput
              value={form.title}
              onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
            />
          </label>
          <label className="space-y-1.5">
            <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
              {t("identity_admin.menu_icon")}
            </span>
            <TextInput
              value={form.icon}
              onChange={(event) => setForm((current) => ({ ...current, icon: event.target.value }))}
              placeholder="layout-dashboard"
            />
          </label>
          {showPath ? (
            <label className="space-y-1.5">
              <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
                {t("identity_admin.route_address")}
              </span>
              <TextInput
                value={form.path}
                onChange={(event) => setForm((current) => ({ ...current, path: event.target.value }))}
                required
                placeholder="/feature"
              />
            </label>
          ) : null}
          {showComponent ? (
            <label className="space-y-1.5">
              <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
                {t("identity_admin.page_component")}
              </span>
              <TextInput
                value={form.component}
                onChange={(event) =>
                  setForm((current) => ({ ...current, component: event.target.value }))
                }
                placeholder="dashboard"
              />
            </label>
          ) : null}
          {showLink ? (
            <label className="space-y-1.5 sm:col-span-2">
              <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
                {t("identity_admin.link_url")}
              </span>
              <TextInput
                value={form.link_url}
                onChange={(event) => setForm((current) => ({ ...current, link_url: event.target.value }))}
                required
                placeholder="https://"
              />
            </label>
          ) : null}
          {showPermission ? (
            <label className="space-y-1.5">
              <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
                {t("identity_admin.permission_code")}
              </span>
              <TextInput
                value={form.permission_code}
                onChange={(event) =>
                  setForm((current) => ({ ...current, permission_code: event.target.value }))
                }
                placeholder="feature.read"
              />
            </label>
          ) : null}
          <label className="space-y-1.5">
            <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
              {t("identity_admin.sort_order")}
            </span>
            <TextInput
              type="number"
              min={0}
              max={10000}
              value={String(form.sort_order)}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  sort_order: Number.parseInt(event.target.value || "0", 10) || 0,
                }))
              }
              required
            />
          </label>
          <label className="space-y-1.5">
            <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
              {t("identity_admin.badge_content")}
            </span>
            <TextInput
              value={form.badge_content}
              onChange={(event) =>
                setForm((current) => ({ ...current, badge_content: event.target.value }))
              }
            />
          </label>
          <div className="space-y-1.5 sm:col-span-2">
            <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
              {t("identity_admin.status")}
            </span>
            <div className="inline-flex rounded-xl border border-slate-200 p-0.5 dark:border-neutral-700">
              <button
                type="button"
                className={
                  form.enabled
                    ? "rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white"
                    : "rounded-lg px-3 py-1.5 text-xs font-medium text-slate-500"
                }
                onClick={() => setForm((current) => ({ ...current, enabled: true }))}
              >
                {t("identity_admin.menu_status_enabled")}
              </button>
              <button
                type="button"
                className={
                  !form.enabled
                    ? "rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white"
                    : "rounded-lg px-3 py-1.5 text-xs font-medium text-slate-500"
                }
                onClick={() => setForm((current) => ({ ...current, enabled: false }))}
              >
                {t("identity_admin.menu_status_disabled")}
              </button>
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-slate-300"
              checked={form.hide_menu}
              onChange={(event) =>
                setForm((current) => ({ ...current, hide_menu: event.target.checked }))
              }
            />
            {t("identity_admin.hide_menu")}
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-slate-300"
              checked={!form.visible}
              onChange={(event) =>
                setForm((current) => ({ ...current, visible: !event.target.checked }))
              }
            />
            {t("identity_admin.menu_not_visible", { defaultValue: "不显示" })}
          </label>
        </form>
      </Drawer>

      <ConfirmModal
        open={Boolean(deleteTarget)}
        title={t("identity_admin.delete")}
        description={
          deleteTarget
            ? t("identity_admin.delete_menu_confirm", {
                name: t(deleteTarget.label_key, {
                  defaultValue: deleteTarget.title || deleteTarget.code,
                }),
              })
            : ""
        }
        confirmText={t("identity_admin.delete")}
        onConfirm={() => void confirmDelete()}
        onClose={() => setDeleteTarget(null)}
        busy={busy}
      />
    </section>
  );
}
