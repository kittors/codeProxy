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
  "inline-flex items-center rounded-full p-2 text-slate-600 transition-colors duration-150 hover:bg-slate-900/5 dark:text-white/70 dark:hover:bg-white/10";

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
        "motion-safe:transition-[transform,opacity,padding] motion-safe:duration-300 motion-safe:ease-[cubic-bezier(0.22,1,0.36,1)]",
        // 落地页与登录后的门户共用「浮岛」顶栏：从视口边缘脱开，滚动后再收紧一点，
        // 比贴边硬条有呼吸感，也让登录前后的视觉是连续的。
        scrolled ? "px-3 pt-2" : "px-4 pt-4",
        // 顶栏收起是为了给结果页的 sticky tabs 让出视口；落地页没有 tabs，
        // 且导航与 CTA 需要全程可达，因此落地态下始终保持展开。
        collapsed
          ? "pointer-events-none -translate-y-full border-transparent opacity-0"
          : "translate-y-0 opacity-100",
      ].join(" ")}
    >
      <div
        className={[
          "mx-auto flex h-14 max-w-screen-xl items-center justify-between",
          "motion-safe:transition-[background-color,box-shadow,border-color] motion-safe:duration-300",
          "rounded-full border px-4 backdrop-blur-xl sm:px-5",
          scrolled
            ? "border-slate-900/10 bg-white/85 shadow-[0_10px_40px_-18px_rgba(15,23,42,0.35)] dark:border-white/12 dark:bg-white/[0.07]"
            : "border-slate-900/6 bg-white/60 dark:border-white/8 dark:bg-white/[0.03]",
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
                  className="inline-flex max-w-[34vw] items-center gap-1.5 rounded-full px-2 py-1 text-sm font-medium text-slate-700 transition-colors duration-150 hover:bg-slate-900/5 dark:text-white/80 dark:hover:bg-white/10 sm:max-w-56"
                >
                  <Key size={14} className="shrink-0" />
                  <span className="min-w-0 truncate">{displayName}</span>
                  {extraKeyCount > 0 ? (
                    <span className="shrink-0 rounded-full bg-slate-100 px-1.5 py-0.5 text-2xs font-medium text-slate-600 dark:bg-white/10 dark:text-white/70">
                      +{extraKeyCount}
                    </span>
                  ) : null}
                  <ChevronRight
                    size={14}
                    className="shrink-0 rotate-90 text-slate-400 dark:text-white/40"
                  />
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
                        <ChevronRight size={14} className="ml-auto shrink-0 text-slate-400" />
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
                                  <Check
                                    size={15}
                                    className="ml-auto shrink-0 text-emerald-600 dark:text-emerald-400"
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
                    className="text-rose-600 focus:text-rose-700 dark:text-rose-300"
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
