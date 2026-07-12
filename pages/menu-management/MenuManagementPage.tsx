import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Menu as MenuIcon, Settings2 } from "lucide-react";
import { identityApi, type MenuIdentity } from "@code-proxy/api-client";
import {
  Button,
  DataTable,
  Modal,
  TextInput,
  ToggleSwitch,
  type DataTableColumn,
  useToast,
} from "@code-proxy/ui";

export function MenuManagementPage() {
  const { t } = useTranslation();
  const { notify } = useToast();
  const [menus, setMenus] = useState<MenuIdentity[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<MenuIdentity | null>(null);
  const [sortOrder, setSortOrder] = useState("0");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setMenus((await identityApi.menus()).items ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => void load(), [load]);

  const rows = useMemo(() => {
    const byParent = new Map<string, MenuIdentity[]>();
    for (const menu of menus) {
      byParent.set(menu.parent_code, [...(byParent.get(menu.parent_code) ?? []), menu]);
    }
    for (const children of byParent.values()) {
      children.sort((a, b) => a.sort_order - b.sort_order || a.code.localeCompare(b.code));
    }
    const result: Array<MenuIdentity & { depth: number }> = [];
    const append = (parentCode: string, depth: number) => {
      for (const menu of byParent.get(parentCode) ?? []) {
        result.push({ ...menu, depth });
        append(menu.code, depth + 1);
      }
    };
    append("", 0);
    return result;
  }, [menus]);

  const updateMenu = useCallback(
    async (
      menu: MenuIdentity,
      patch: Partial<Pick<MenuIdentity, "visible" | "enabled" | "sort_order">>,
    ) => {
      setBusy(true);
      try {
        await identityApi.updateMenu(menu.code, {
          visible: patch.visible ?? menu.visible,
          enabled: patch.enabled ?? menu.enabled,
          sort_order: patch.sort_order ?? menu.sort_order,
          version: menu.version,
        });
        await load();
        notify({ type: "success", message: t("identity_admin.menu_updated") });
        return true;
      } catch (error) {
        notify({
          type: "error",
          message: error instanceof Error ? error.message : t("identity_admin.operation_failed"),
        });
        return false;
      } finally {
        setBusy(false);
      }
    },
    [load, notify, t],
  );

  const columns = useMemo<DataTableColumn<(typeof rows)[number]>[]>(
    () => [
      {
        key: "menu",
        label: t("identity_admin.menu"),
        width: "w-56",
        render: (menu) => (
          <div className="flex min-w-0 items-center gap-2" style={{ paddingLeft: menu.depth * 20 }}>
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-500 dark:bg-white/8 dark:text-slate-300">
              <MenuIcon size={15} />
            </span>
            <span className="min-w-0">
              <span className="block truncate font-medium text-slate-900 dark:text-white">
                {t(menu.label_key, { defaultValue: menu.code })}
              </span>
              <span className="block truncate text-xs text-slate-400">{menu.code}</span>
            </span>
          </div>
        ),
      },
      {
        key: "type",
        label: t("identity_admin.menu_type"),
        width: "w-20",
        render: (menu) =>
          menu.type === "directory"
            ? t("identity_admin.menu_directory")
            : t("identity_admin.menu_page"),
      },
      {
        key: "route",
        label: t("identity_admin.route_permission"),
        width: "w-56",
        render: (menu) => (
          <div className="min-w-0 text-xs">
            <div className="truncate text-slate-700 dark:text-slate-200">{menu.path || "—"}</div>
            <div className="truncate text-slate-400">{menu.permission_code || "—"}</div>
          </div>
        ),
      },
      {
        key: "visible",
        label: t("identity_admin.menu_visible"),
        width: "w-20",
        render: (menu) => (
          <ToggleSwitch
            checked={menu.visible}
            disabled={busy || menu.code === "system.menus" || menu.code === "group.system"}
            ariaLabel={t("identity_admin.change_menu_visible", {
              name: t(menu.label_key, { defaultValue: menu.code }),
            })}
            onCheckedChange={(visible) => void updateMenu(menu, { visible })}
          />
        ),
      },
      {
        key: "enabled",
        label: t("identity_admin.menu_enabled"),
        width: "w-20",
        render: (menu) => (
          <ToggleSwitch
            checked={menu.enabled}
            disabled={busy || menu.code === "system.menus" || menu.code === "group.system"}
            ariaLabel={t("identity_admin.change_menu_enabled", {
              name: t(menu.label_key, { defaultValue: menu.code }),
            })}
            onCheckedChange={(enabled) => void updateMenu(menu, { enabled })}
          />
        ),
      },
      {
        key: "sort",
        label: t("identity_admin.sort_order"),
        minWidthPx: 96,
        render: (menu) => (
          <Button
            size="xs"
            variant="ghost"
            onClick={() => {
              setEditing(menu);
              setSortOrder(String(menu.sort_order));
            }}
            aria-label={t("identity_admin.adjust_order")}
            tooltip={t("identity_admin.adjust_order")}
          >
            <Settings2 size={14} />
            {menu.sort_order}
          </Button>
        ),
      },
    ],
    [busy, t, updateMenu],
  );

  const saveOrder = async (event: FormEvent) => {
    event.preventDefault();
    if (!editing) return;
    const next = Number.parseInt(sortOrder, 10);
    if (!Number.isInteger(next)) return;
    if (await updateMenu(editing, { sort_order: next })) setEditing(null);
  };

  return (
    <section className="flex flex-1 flex-col">
      <div className="flex flex-1 flex-col rounded-2xl border border-black/[0.06] bg-white shadow-[0_1px_2px_rgb(15_23_42_/_0.035)] dark:border-white/[0.06] dark:bg-neutral-950/70 dark:shadow-[0_1px_2px_rgb(0_0_0_/_0.22)]">
        <div className="px-5 pt-5 pb-3">
          <h2 className="text-base font-semibold text-slate-950 dark:text-white">
            {t("identity_admin.menu_management_title")}
          </h2>
          <p className="text-sm text-slate-500">
            {t("identity_admin.menu_management_description")}
          </p>
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
            minWidth="min-w-[820px]"
            emptyText={t("identity_admin.no_menus")}
            showAllLoadedMessage={false}
            columnReorderable={false}
          />
        </div>
      </div>

      <Modal
        open={Boolean(editing)}
        title={t("identity_admin.adjust_order")}
        description={editing ? t(editing.label_key, { defaultValue: editing.code }) : ""}
        onClose={() => setEditing(null)}
        maxWidth="max-w-md"
        footer={
          <>
            <Button onClick={() => setEditing(null)}>{t("common.cancel")}</Button>
            <Button type="submit" form="menu-order-form" variant="primary" disabled={busy}>
              {t("identity_admin.save")}
            </Button>
          </>
        }
      >
        <form id="menu-order-form" onSubmit={saveOrder} className="space-y-1.5">
          <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
            {t("identity_admin.sort_order")}
          </span>
          <TextInput
            type="number"
            min={0}
            max={10000}
            value={sortOrder}
            onChange={(event) => setSortOrder(event.target.value)}
            required
          />
        </form>
      </Modal>
    </section>
  );
}
