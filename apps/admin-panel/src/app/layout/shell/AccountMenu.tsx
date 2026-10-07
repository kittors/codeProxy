import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ChevronsUpDown, LogOut, Moon, Settings, ShieldCheck, Sun } from "lucide-react";
import { DropdownMenu, useTheme } from "@code-proxy/ui";
import { useOptionalAuth } from "@app/providers/AuthProvider";
import { sidebarFadeClass, SidebarRowLabel } from "./sidebarRow";
import { useAccountIdentity } from "./useShellNav";

/** 账号头像：暖灰实心圆 + 名字缩写，右下角的小绿点表示当前在线会话。 */
export function AccountAvatar({ initials, size = "md" }: { initials: string; size?: "md" | "lg" }) {
  return (
    <span
      data-sidebar-account-avatar="true"
      className={[
        "relative grid shrink-0 place-items-center rounded-full bg-[#b08d64] font-semibold text-white",
        size === "lg" ? "h-9 w-9 text-xs" : "h-8 w-8 text-2xs",
      ].join(" ")}
    >
      {initials}
      <span className="absolute -right-px -bottom-px h-2.5 w-2.5 rounded-full border-2 border-rail bg-emerald-500" />
    </span>
  );
}

/**
 * 侧边栏底部的账号入口：整行是头像 + 名字 + 所在租户，点开是账号菜单——账号信息、修改密码、
 * 配置面板（需要 system.config.read）、深浅色切换和退出登录。
 *
 * 侧边栏收起后这一行跟着收窄到只剩头像（头像位置不动），菜单改为向右弹出；展开时从这一行
 * 上方弹出，不挡住侧边栏右侧的内容。
 *
 * 退出时先跳登录页再清会话：反过来的话，页面会在清空凭据的瞬间带着旧路由重渲染一次，
 * 各页面的请求会先打出一轮 401。
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
          className="flex h-11 w-full min-w-0 items-center rounded-xl text-left outline-none transition-[background-color,scale] duration-150 ease-soft hover:bg-hover active:scale-[0.98] data-[state=open]:bg-hover"
        >
          <span className="grid size-9 shrink-0 place-items-center">
            <AccountAvatar initials={account.initials} />
          </span>
          <SidebarRowLabel collapsed={collapsed}>
            <span className="block truncate text-sm font-medium text-ink">{account.name}</span>
            <span className="mt-0.5 block truncate text-xs text-ink-3">{account.tenant}</span>
          </SidebarRowLabel>
          <ChevronsUpDown
            size={14}
            aria-hidden="true"
            className={`mr-2.5 shrink-0 text-ink-3 ${sidebarFadeClass(collapsed)}`}
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
          <div className="flex items-center gap-3 px-2.5 py-2">
            <AccountAvatar initials={account.initials} size="lg" />
            <div className="min-w-0 flex-1 leading-tight">
              <div className="truncate text-sm font-semibold text-ink">{account.name}</div>
              <div className="mt-0.5 truncate text-xs text-ink-3">{account.tenant}</div>
            </div>
          </div>
          <DropdownMenu.Separator />
          <DropdownMenu.Item onSelect={() => navigate("/change-password", { viewTransition: true })}>
            <ShieldCheck size={18} />
            {t("identity_admin.change_password")}
          </DropdownMenu.Item>
          {can("system.config.read") ? (
            <DropdownMenu.Item onSelect={() => navigate("/system/config", { viewTransition: true })}>
              <Settings size={18} />
              {t("shell.nav_config")}
            </DropdownMenu.Item>
          ) : null}
          <DropdownMenu.Item onSelect={toggle}>
            {mode === "dark" ? <Sun size={18} /> : <Moon size={18} />}
            {mode === "dark" ? t("theme.switch_to_light") : t("theme.switch_to_dark")}
          </DropdownMenu.Item>
          <DropdownMenu.Separator />
          <DropdownMenu.Item tone="danger" onSelect={handleLogout}>
            <LogOut size={18} />
            {t("shell.logout_button")}
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
