import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Avatar, Icon } from "satin-ui/react";
import { DropdownMenu, useTheme } from "@code-proxy/ui";
import { useOptionalAuth } from "@app/providers/AuthProvider";
import { sidebarFadeClass, SidebarRowLabel } from "./sidebarRow";
import { useAccountIdentity } from "./useShellNav";

/**
 * Satin 账号头像：遵循 Satin 规范，摒弃单调文字字母头像，采用 `<Avatar />` 稳定几何预设头像
 * 与右下角在线状态点，尺寸按侧栏与菜单场景自动适配。
 */
export function AccountAvatar({
  initials,
  name,
  size = "md",
}: {
  initials: string;
  name?: string;
  size?: "md" | "lg";
}) {
  return (
    <span
      data-sidebar-account-avatar="true"
      className="inline-flex shrink-0 items-center justify-center [--sn-av-ring:var(--sn-side-bg)]"
    >
      <Avatar name={name || initials} size={size === "lg" ? 34 : 28} online decorative />
    </span>
  );
}

/**
 * 侧边栏底部的账号入口：使用 Satin 头像与纯 Satin DropdownMenu（零 Radix 依赖）。
 */
export function AccountMenu({
  onLogout,
  collapsed = false,
}: {
  onLogout: () => void;
  collapsed?: boolean;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const auth = useOptionalAuth();
  const can = auth?.can ?? (() => true);
  const account = useAccountIdentity();
  const {
    state: { mode },
    actions: { toggle },
  } = useTheme();

  const handleLogout = () => {
    navigate("/login", { replace: true, viewTransition: true });
    onLogout();
  };

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          aria-label={account.name}
          data-tooltip={collapsed ? account.name : undefined}
          data-tooltip-placement="right"
          className="flex h-11 w-full min-w-0 items-center rounded-xl text-left outline-none transition-[background-color,scale] duration-150 ease-[var(--sn-ease-out)] hover:bg-[var(--sn-fill-hover)] active:scale-[0.98] data-[state=open]:bg-[var(--sn-fill-hover)]"
        >
          <span className="grid size-9 shrink-0 place-items-center">
            <AccountAvatar initials={account.initials} name={account.name} />
          </span>
          <SidebarRowLabel collapsed={collapsed}>
            <span className="block truncate text-sm font-medium text-[var(--sn-label)]">
              {account.name}
            </span>
            <span className="mt-0.5 block truncate text-xs text-[var(--sn-label3)]">
              {account.tenant}
            </span>
          </SidebarRowLabel>
          <Icon
            name="chevrons-up-down"
            size={14}
            className={`mr-2.5 shrink-0 text-[var(--sn-label3)] ${sidebarFadeClass(collapsed)}`}
          />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          data-sidebar-account-menu="true"
          side={collapsed ? "right" : "top"}
          align={collapsed ? "end" : "start"}
          sideOffset={collapsed ? 10 : 6}
          collisionPadding={8}
          className="w-64"
        >
          <div className="flex items-center gap-3 px-2.5 py-2 [--sn-av-ring:var(--sn-overlay)]">
            <AccountAvatar initials={account.initials} name={account.name} size="lg" />
            <div className="min-w-0 flex-1 leading-tight">
              <div className="truncate text-sm font-semibold text-[var(--sn-label)]">
                {account.name}
              </div>
              <div className="mt-0.5 truncate text-xs text-[var(--sn-label3)]">
                {account.tenant}
              </div>
            </div>
          </div>
          <DropdownMenu.Separator />
          <DropdownMenu.Item onSelect={() => navigate("/change-password", { viewTransition: true })}>
            <Icon name="shield" size={16} />
            {t("identity_admin.change_password")}
          </DropdownMenu.Item>
          {can("system.config.read") ? (
            <DropdownMenu.Item onSelect={() => navigate("/system/config", { viewTransition: true })}>
              <Icon name="settings" size={16} />
              {t("shell.nav_config")}
            </DropdownMenu.Item>
          ) : null}
          <DropdownMenu.Item onSelect={toggle}>
            <Icon name={mode === "dark" ? "sun" : "moon"} size={16} />
            {mode === "dark" ? t("theme.switch_to_light") : t("theme.switch_to_dark")}
          </DropdownMenu.Item>
          <DropdownMenu.Separator />
          <DropdownMenu.Item tone="danger" onSelect={handleLogout}>
            <Icon name="log-out" size={16} />
            {t("shell.logout_button")}
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
