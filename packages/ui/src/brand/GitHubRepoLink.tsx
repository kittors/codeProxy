import type { AnchorHTMLAttributes, SVGProps } from "react";
import { useTranslation } from "react-i18next";
import { Icon as SatinIcon } from "satin-ui/react";
import { cn } from "../utils/selectStyles";

/** 主项目（CliRelay 网关与完整开源项目）GitHub 仓库地址。 */
export const GITHUB_PROJECT_URL = "https://github.com/kittors/CliRelay";
export const GITHUB_PROJECT_SLUG = "kittors/CliRelay";

/** 前端管理面板（codeProxy）GitHub 仓库地址。 */
export const GITHUB_PANEL_URL = "https://github.com/kittors/codeProxy";
export const GITHUB_PANEL_SLUG = "kittors/codeProxy";

/**
 * 标准 GitHub Octocat 品牌图标（单色 currentColor，深浅双主题与高对比反色按钮均清晰辨识）。
 * 刻意不加 `.lucide` / `.sn-ic` 类，避免被全局描边规则篡改填充路径。
 */
export function GitHubIcon({
  size = 16,
  className,
  ...props
}: Omit<SVGProps<SVGSVGElement>, "width" | "height"> & { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      className={cn("shrink-0", className)}
      {...props}
    >
      <path d="M12 1.27a11 11 0 0 0-3.48 21.46c.55.09.73-.24.73-.53v-1.85c-3.03.66-3.67-1.45-3.67-1.45-.5-1.29-1.22-1.63-1.22-1.63-1-.68.08-.67.08-.67 1.1.08 1.68 1.13 1.68 1.13.98 1.68 2.57 1.2 3.2.92.1-.71.38-1.2.69-1.48-2.42-.28-4.96-1.21-4.96-5.4 0-1.19.42-2.17 1.12-2.93-.11-.28-.49-1.39.11-2.89 0 0 .92-.29 3 1.12a10.4 10.4 0 0 1 5.46 0c2.08-1.41 3-1.12 3-1.12.6 1.5.22 2.61.11 2.89.7.76 1.12 1.74 1.12 2.93 0 4.2-2.55 5.12-4.98 5.39.39.34.74 1.01.74 2.04v3.02c0 .29.19.63.74.53A11 11 0 0 0 12 1.27Z" />
    </svg>
  );
}

export type GitHubRepoLinkVariant = "topbar" | "pill" | "badge" | "icon";

export interface GitHubRepoLinkProps
  extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "children" | "href"> {
  href?: string;
  label?: string;
  tooltip?: string;
  variant?: GitHubRepoLinkVariant;
  size?: "sm" | "md" | "lg";
  /** 在小于该断点时隐藏可见文字仅显示 GitHub 图标。 */
  hideLabelBelow?: "sm" | "md" | "never";
}

const SIZE_CLASS: Record<NonNullable<GitHubRepoLinkProps["size"]>, string> = {
  sm: "sn-sm",
  md: "",
  lg: "sn-lg",
};

const ICON_SIZE: Record<NonNullable<GitHubRepoLinkProps["size"]>, number> = {
  sm: 15,
  md: 16,
  lg: 18,
};

/**
 * 统一的 GitHub 开源项目直达入口：
 * - `topbar`：控制台与门户顶栏专用，遵循 Satin 简约原则（无边框、无胶囊底、无冗余文字），
 *   以纯图标 ghost 按钮与语言、主题、外观入口保持同等轻盈权重，文字说明交给 tooltip 与 aria-label；
 * - `pill`：登录页右上角与系统信息页操作按钮专用，与 Satin 按钮同高齐平；
 * - `badge`：登录页 Hero 区开源项目地址胶囊徽标，直显 `kittors/CliRelay`；
 * - `icon`：紧凑纯图标入口。
 */
export function GitHubRepoLink({
  href = GITHUB_PROJECT_URL,
  label,
  tooltip,
  variant = "topbar",
  size = "sm",
  hideLabelBelow = variant === "topbar" ? "sm" : "never",
  className,
  ...props
}: GitHubRepoLinkProps) {
  const { t } = useTranslation();
  const resolvedLabel =
    label ?? (variant === "badge" ? GITHUB_PROJECT_SLUG : t("common.github", { defaultValue: "GitHub" }));
  const resolvedTooltip =
    tooltip ??
    t("common.github_repo_tooltip", {
      defaultValue: `View open-source project on GitHub (${GITHUB_PROJECT_SLUG})`,
    });

  const labelVisibilityClass =
    hideLabelBelow === "sm"
      ? "hidden sm:inline"
      : hideLabelBelow === "md"
        ? "hidden md:inline"
        : "inline";

  if (variant === "badge") {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={resolvedTooltip}
        data-tip={resolvedTooltip}
        data-tip-side="bottom"
        data-github-repo-link="badge"
        className={cn(
          "sn-btn sn-secondary sn-sm !h-8 !gap-2 !rounded-full !px-3.5 text-xs font-medium text-[var(--sn-label)] shadow-[var(--sn-b-lift)]",
          className,
        )}
        {...props}
      >
        <GitHubIcon size={15} />
        <span className="font-mono text-xs tracking-tight">{resolvedLabel}</span>
        <SatinIcon name="arrow-up-right" size={13} className="sn-after text-[var(--sn-label3)]" />
      </a>
    );
  }

  if (variant === "icon") {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={resolvedTooltip}
        data-tip={resolvedTooltip}
        data-tip-side="bottom"
        data-github-repo-link="icon"
        className={cn("sn-btn sn-ghost sn-ibtn text-[var(--sn-label2)]", SIZE_CLASS[size], className)}
        {...props}
      >
        <GitHubIcon size={ICON_SIZE[size]} />
      </a>
    );
  }

  if (variant === "topbar") {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={resolvedTooltip}
        data-tip={resolvedTooltip}
        data-tip-side="bottom"
        data-github-repo-link="topbar"
        className={cn("sn-btn sn-ghost sn-sm sn-ibtn text-[var(--sn-label2)]", className)}
        {...props}
      >
        <GitHubIcon size={16} />
      </a>
    );
  }

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={resolvedTooltip}
      data-tip={resolvedTooltip}
      data-tip-side="bottom"
      data-github-repo-link="pill"
      className={cn("sn-btn sn-secondary !gap-2 font-medium", SIZE_CLASS[size], className)}
      {...props}
    >
      <GitHubIcon size={ICON_SIZE[size]} />
      <span className={labelVisibilityClass}>{resolvedLabel}</span>
      <SatinIcon name="arrow-up-right" size={14} className="sn-after text-[var(--sn-label3)]" />
    </a>
  );
}
