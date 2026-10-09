import { useTranslation } from "react-i18next";
import type { MenuIdentity } from "@code-proxy/api-client";
import { Callout, ConfirmModal, resolveMenuIcon, iconHueClass } from "@code-proxy/ui";

/**
 * 删除菜单。服务端会拒绝删除还有下级（子菜单或按钮权限项）的菜单，所以知道下级数量时直接在确认框里
 * 说清楚，不让用户点了确认才收到一条「menu has children」。角色已有的权限与菜单分开存储，不受影响。
 */
export function MenuDeleteConfirm({
  menu,
  name,
  typeLabel,
  childCount,
  busy,
  onConfirm,
  onClose,
}: {
  menu: MenuIdentity | null;
  name: string;
  typeLabel: string;
  childCount: number;
  busy: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const Icon = resolveMenuIcon(menu?.icon ?? "");
  return (
    <ConfirmModal
      open={menu !== null}
      title={t("identity_admin.delete_menu_title", { name })}
      description={t("identity_admin.delete_lead")}
      subject={
        menu ? (
          <span className="flex min-w-0 items-center gap-3">
            <Icon size={16} className={`shrink-0 text-ink-3 ${iconHueClass(Icon)}`} aria-hidden="true" />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">{name}</span>
              <span className="block truncate font-mono text-xs text-ink-3">{menu.code}</span>
            </span>
            <span className="shrink-0 rounded-md bg-selected px-2 py-0.5 text-xs text-ink-2">
              {typeLabel}
            </span>
          </span>
        ) : null
      }
      consequences={[
        t("identity_admin.delete_menu_consequence_nav"),
        t("identity_admin.delete_menu_consequence_permissions"),
      ]}
      confirmText={t("identity_admin.delete_menu")}
      busy={busy}
      onClose={onClose}
      onConfirm={onConfirm}
    >
      {childCount > 0 ? (
        <Callout tone="warning">
          {t("identity_admin.delete_menu_has_children", { count: childCount })}
        </Callout>
      ) : null}
    </ConfirmModal>
  );
}
