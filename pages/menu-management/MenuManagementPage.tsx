import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  COLUMN_WIDTH,
  DataTable,
  TABLE_ROW_ACTIONS_COLUMN,
  resolveMenuIcon,
  useToast,
  type DataTableColumn,
} from "@code-proxy/ui";
import { useAuth } from "@app/providers/AuthProvider";
import { MenuDeleteConfirm } from "./MenuDeleteConfirm";
import { MenuFormDrawer } from "./MenuFormDrawer";
import { emptyMenuForm, parentPathPrefix, toMenuWriteBody } from "./menuForm";

type DrawerMode = "create" | "edit";

/** Display helper: never collapse real empty metadata to a blank cell without meaning. */
const displayCell = (value: string | null | undefined, fallback = "—") => {
  const text = (value ?? "").trim();
  return text || fallback;
};

/**
 * 菜单类型、徽标的基础样式是中性淡底标签：简约风格下类型只靠文字区分。
 * 多彩风格下按类型叠一层颜色（目录蓝 / 按钮红 / 内嵌绿 / 外链琥珀，普通菜单保持中性），徽标是实色蓝。
 */
const NEUTRAL_TAG = "bg-ink/[0.05] text-ink-2 dark:bg-white/[0.07]";

const TYPE_TAG_HUE: Partial<Record<MenuType, string>> = {
  directory: "colorful:bg-blue-500/15 colorful:text-blue-600 colorful:dark:text-blue-300",
  button: "colorful:bg-rose-500/15 colorful:text-rose-600 colorful:dark:text-rose-300",
  embed: "colorful:bg-emerald-500/15 colorful:text-emerald-600 colorful:dark:text-emerald-300",
  link: "colorful:bg-amber-500/15 colorful:text-amber-700 colorful:dark:text-amber-300",
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
  const [form, setForm] = useState<MenuWriteBody>(emptyMenuForm);
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
      {
        value: "",
        label: t("identity_admin.menu_parent_none"),
        searchText: t("identity_admin.menu_parent_none"),
      },
      ...menus
        .filter((menu) => menu.type === "directory" || menu.type === "menu")
        .filter((menu) => menu.code !== editing?.code)
        .map((menu) => {
          const label = t(menu.label_key, { defaultValue: menu.title || menu.code });
          return {
            value: menu.code,
            label: `${label} (${menu.code})`,
            searchText: `${label} ${menu.code}`,
          };
        }),
    ],
    [editing?.code, menus, t],
  );

  const openCreate = (parentCode = "") => {
    setDrawerMode("create");
    setEditing(null);
    const prefix = parentPathPrefix(menus, parentCode);
    setForm({
      ...emptyMenuForm(),
      parent_code: parentCode,
      // Nested create under a directory defaults to secondary route under parent path.
      path: prefix ? `${prefix}/` : "",
      type: "menu",
      component: "",
    });
    setDrawerOpen(true);
  };

  const openEdit = (menu: MenuIdentity) => {
    setDrawerMode("edit");
    setEditing(menu);
    setForm(toMenuWriteBody(menu));
    setDrawerOpen(true);
  };

  const saveDrawer = async () => {
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
            <div
              className="flex min-w-0 items-center gap-2"
              style={{ paddingLeft: menu.depth * 22 }}
            >
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
                    className={
                      isExpanded ? "rotate-90 transition-transform" : "transition-transform"
                    }
                  />
                </Button>
              ) : (
                <span className="h-7 w-7" aria-hidden="true" />
              )}
              <Icon size={16} className="shrink-0 text-ink-3" aria-hidden="true" />
              <span className="min-w-0">
                <span className="flex min-w-0 items-center gap-1.5">
                  <span className="truncate font-medium text-ink">{label}</span>
                  {menu.badge_content ? (
                    <span
                      className={`shrink-0 rounded-full px-1.5 py-0.5 text-2xs font-medium ${NEUTRAL_TAG} colorful:bg-blue-500 colorful:text-white`}
                    >
                      {menu.badge_content}
                    </span>
                  ) : null}
                </span>
                <span className="block truncate text-xs text-ink-3">{menu.code}</span>
              </span>
            </div>
          );
        },
      },
      {
        key: "type",
        label: t("identity_admin.menu_type"),
        width: COLUMN_WIDTH.badge,
        render: (menu) => (
          <span
            className={`inline-flex rounded-md px-2 py-0.5 text-xs font-medium ${NEUTRAL_TAG} ${TYPE_TAG_HUE[menu.type] ?? ""}`}
          >
            {typeLabel(menu.type)}
          </span>
        ),
      },
      {
        key: "permission",
        label: t("identity_admin.permission_code"),
        width: COLUMN_WIDTH.badgeStacked,
        render: (menu) => (
          <span className="truncate text-xs text-ink-2">
            {displayCell(menu.permission_code)}
          </span>
        ),
      },
      {
        key: "route",
        label: t("identity_admin.route_address"),
        width: COLUMN_WIDTH.badgeStacked,
        render: (menu) => (
          <div className="min-w-0 text-xs">
            <div className="truncate text-ink-2">{displayCell(menu.path)}</div>
            {menu.link_url ? <div className="truncate text-ink-3">{menu.link_url}</div> : null}
          </div>
        ),
      },
      {
        key: "component",
        label: t("identity_admin.page_component"),
        width: COLUMN_WIDTH.timestamp,
        render: (menu) => (
          <span className="truncate text-xs text-ink-2">
            {menu.type === "directory"
              ? displayCell(menu.component, "Layout")
              : displayCell(menu.component)}
          </span>
        ),
      },
      {
        key: "status",
        label: t("identity_admin.status"),
        width: COLUMN_WIDTH.badge,
        render: (menu) => (
          <span
            className={
              menu.enabled
                ? "inline-flex rounded-md bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-300"
                : "inline-flex rounded-md bg-rose-500/10 px-2 py-0.5 text-xs font-medium text-rose-700 dark:text-rose-300"
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
        ...TABLE_ROW_ACTIONS_COLUMN,
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

  return (
    <section data-page-fill="always" className="flex flex-1 flex-col">
      {/* 不再包一层卡片：外壳内容区就是这一页的面板，标题和表格直接落在上面（同请求日志页）。 */}
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex items-start justify-between gap-3 pb-3">
          <div>
            <h2 className="text-base font-semibold text-ink">
              {t("identity_admin.menu_management_title")}
            </h2>
            <p className="text-sm text-ink-3">{t("identity_admin.menu_management_description")}</p>
          </div>
          {canUpdate ? (
            <Button variant="primary" size="sm" onClick={() => openCreate("")}>
              <Plus size={15} className="mr-1" />
              {t("identity_admin.menu_create")}
            </Button>
          ) : null}
        </div>
        {/* 表格吃掉页面剩余高度、内部滚动；不设最小高度保底——页面高度被窗口钉死，保底只会在矮窗口下把表格挤出页面（见请求日志页）。 */}
        <div className="relative min-h-0 flex-1 overflow-hidden">
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

      <MenuFormDrawer
        open={drawerOpen}
        mode={drawerMode}
        editing={editing}
        form={form}
        setForm={setForm}
        menus={menus}
        parentOptions={parentOptions}
        busy={busy}
        onSubmit={() => void saveDrawer()}
        onClose={() => setDrawerOpen(false)}
      />

      <MenuDeleteConfirm
        menu={deleteTarget}
        name={
          deleteTarget
            ? t(deleteTarget.label_key, { defaultValue: deleteTarget.title || deleteTarget.code })
            : ""
        }
        typeLabel={deleteTarget ? typeLabel(deleteTarget.type) : ""}
        childCount={deleteTarget ? (childrenByParent.get(deleteTarget.code)?.length ?? 0) : 0}
        busy={busy}
        onConfirm={() => void confirmDelete()}
        onClose={() => setDeleteTarget(null)}
      />
    </section>
  );
}
