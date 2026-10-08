import type { MutableRefObject } from "react";
import { Check, ChevronRight, Key, KeyRound, LogOut, UserPlus, Users } from "lucide-react";
import type { EndUser, SavedPortalAccount } from "@code-proxy/api-client";
import { DropdownMenu, LanguageSelector, ThemeToggleButton } from "@code-proxy/ui";
import { LandingButton } from "./landing/LandingButton";
import { LookupBrand } from "./LookupBrand";

export interface LookupHeaderProps {
  t: (key: string, options?: Record<string, unknown>) => string;
  showLanding: boolean;
  /** 顶栏是否收起。落地页恒为 false，详见下方注释。 */
  collapsed: boolean;
  /** 页面是否已滚动。落地页据此把浮岛收紧、加重底色。 */
  scrolled: boolean;
  hasAccount: boolean;
  displayName: string;
  extraKeyCount: number;
  portalUser: EndUser | null;
  switchablePortalAccounts: SavedPortalAccount[];
  onLogin: () => void;
  onLogout: () => void;
  onAddAccount: () => void;
  onChangePassword: () => void;
  onSwitchAccount: (accountKey: string) => void;
  suppressAccountMenuFocusRestoreRef: MutableRefObject<boolean>;
}

const ICON_BUTTON_CLASS =
  "inline-flex items-center rounded-full p-2 text-ink-2 transition-colors duration-150 hover:bg-hover hover:text-ink";

export function LookupHeader({
  t,
  showLanding,
  collapsed,
  scrolled,
  hasAccount,
  displayName,
  extraKeyCount,
  portalUser,
  switchablePortalAccounts,
  onLogin,
  onLogout,
  onAddAccount,
  onChangePassword,
  onSwitchAccount,
  suppressAccountMenuFocusRestoreRef,
}: LookupHeaderProps) {
  return (
    <header
      data-testid="apikey-lookup-header"
      data-collapsed={collapsed ? "true" : "false"}
      aria-hidden={collapsed || undefined}
      className={[
        "fixed inset-x-0 top-0 z-30",
        "motion-safe:transition-[translate,opacity,padding] motion-safe:duration-300 motion-safe:ease-[cubic-bezier(0.22,1,0.36,1)]",
        // 落地页与登录后的门户共用「浮岛」顶栏：从视口边缘脱开，滚动后再收紧一点，
        // 比贴边硬条有呼吸感，也让登录前后的视觉是连续的。
        scrolled ? "px-3 pt-2" : "px-4 pt-4",
        // 顶栏收起是为了给结果页的 sticky tabs 让出视口；落地页没有 tabs，
        // 且导航与 CTA 需要全程可达，因此落地态下始终保持展开。
        collapsed ? "pointer-events-none -translate-y-full opacity-0" : "translate-y-0 opacity-100",
      ].join(" ")}
    >
      {/*
        浮岛的轮廓是伪元素细边（cp-edge），不画 border；滚动后底色加实一点、再给卡片投影，
        和页面内容拉开前后层次。底色用卡片色的半透明：深色下是近黑的卡片色，不再是一层发灰的白。
      */}
      <div
        className={[
          "cp-edge mx-auto flex h-14 max-w-screen-xl items-center justify-between",
          "motion-safe:transition-[background-color,box-shadow] motion-safe:duration-300",
          "rounded-full px-4 backdrop-blur-xl sm:px-5",
          scrolled ? "bg-surface/85 shadow-card" : "bg-surface/60",
        ].join(" ")}
      >
        <LookupBrand showLanding={showLanding} title={t("apikey_lookup.title")} />

        <div className="flex items-center gap-1.5">
          {hasAccount ? (
            <DropdownMenu.Root>
              <DropdownMenu.Trigger asChild>
                <button
                  type="button"
                  aria-label={displayName}
                  data-testid="apikey-lookup-account-menu"
                  className="inline-flex max-w-[34vw] items-center gap-1.5 rounded-full px-2 py-1 text-sm font-medium text-ink-2 transition-colors duration-150 hover:bg-hover hover:text-ink sm:max-w-56"
                >
                  <Key size={14} className="shrink-0" />
                  <span className="min-w-0 truncate">{displayName}</span>
                  {extraKeyCount > 0 ? (
                    <span className="shrink-0 rounded-full bg-ink/[0.05] px-1.5 py-0.5 text-2xs font-medium text-ink-2 dark:bg-white/[0.07]">
                      +{extraKeyCount}
                    </span>
                  ) : null}
                  <ChevronRight size={14} className="shrink-0 rotate-90 text-ink-3" />
                </button>
              </DropdownMenu.Trigger>
              <DropdownMenu.Portal>
                <DropdownMenu.Content
                  align="end"
                  sideOffset={8}
                  className="min-w-48"
                  data-testid="apikey-lookup-account-menu-content"
                  onCloseAutoFocus={(event) => {
                    if (!suppressAccountMenuFocusRestoreRef.current) return;
                    suppressAccountMenuFocusRestoreRef.current = false;
                    event.preventDefault();
                  }}
                >
                  {portalUser && switchablePortalAccounts.length > 1 ? (
                    <DropdownMenu.Sub>
                      <DropdownMenu.SubTrigger data-testid="apikey-lookup-switch-account-trigger">
                        <Users size={15} />
                        <span className="min-w-0 flex-1">
                          {t("apikey_lookup.switch_account", { defaultValue: "切换账号" })}
                        </span>
                        <ChevronRight size={14} className="ml-auto shrink-0 text-ink-3" />
                      </DropdownMenu.SubTrigger>
                      <DropdownMenu.Portal>
                        <DropdownMenu.SubContent
                          sideOffset={6}
                          className="min-w-44"
                          data-testid="apikey-lookup-switch-account-menu"
                        >
                          {switchablePortalAccounts.map((account) => {
                            const isCurrent = account.user.id === portalUser.id;
                            return (
                              <DropdownMenu.Item
                                key={account.accountKey}
                                disabled={isCurrent}
                                className={isCurrent ? "data-[disabled]:opacity-100" : undefined}
                                data-testid={
                                  isCurrent
                                    ? "apikey-lookup-current-account"
                                    : `apikey-lookup-switch-${account.user.id}`
                                }
                                onClick={(event) => {
                                  // A pointer-selected account changes the page context; do not let
                                  // Radix restore focus to the now-updated trigger and leave its
                                  // browser focus ring visible. Keyboard selection keeps the default
                                  // focus restoration so the menu remains accessible.
                                  suppressAccountMenuFocusRestoreRef.current = event.detail > 0;
                                }}
                                onSelect={() => {
                                  if (!isCurrent) onSwitchAccount(account.accountKey);
                                }}
                              >
                                <Users size={15} className="shrink-0" />
                                <span className="min-w-0 flex-1 truncate">
                                  {account.user.display_name || account.user.username}
                                </span>
                                {isCurrent ? (
                                  // 当前账号是「选中项」：简约风格下对勾是强调色，多彩风格下是绿色。
                                  <Check
                                    size={15}
                                    className="ml-auto shrink-0 text-accent-ink colorful:text-emerald-600 colorful:dark:text-emerald-400"
                                  />
                                ) : null}
                              </DropdownMenu.Item>
                            );
                          })}
                        </DropdownMenu.SubContent>
                      </DropdownMenu.Portal>
                    </DropdownMenu.Sub>
                  ) : null}
                  {portalUser ? (
                    <DropdownMenu.Item onSelect={onChangePassword}>
                      <KeyRound size={15} />
                      {t("apikey_lookup.change_password", { defaultValue: "修改密码" })}
                    </DropdownMenu.Item>
                  ) : null}
                  {portalUser ? (
                    <DropdownMenu.Item onSelect={onAddAccount}>
                      <UserPlus size={15} />
                      {t("apikey_lookup.add_account", { defaultValue: "添加账号" })}
                    </DropdownMenu.Item>
                  ) : null}
                  <DropdownMenu.Separator />
                  <DropdownMenu.Item
                    onSelect={onLogout}
                    tone="danger"
                  >
                    <LogOut size={15} />
                    {t("common.logout")}
                  </DropdownMenu.Item>
                </DropdownMenu.Content>
              </DropdownMenu.Portal>
            </DropdownMenu.Root>
          ) : (
            <LandingButton tone={showLanding ? "primary" : "outline"} size="sm" onClick={onLogin}>
              {t("common.login", { defaultValue: "登录" })}
            </LandingButton>
          )}
          <LanguageSelector className={ICON_BUTTON_CLASS} />
          <ThemeToggleButton className={ICON_BUTTON_CLASS} />
        </div>
      </div>
    </header>
  );
}
