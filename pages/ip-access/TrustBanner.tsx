import { useTranslation } from "react-i18next";
import { ShieldAlert, TriangleAlert } from "lucide-react";
import type { IpAccessStatus } from "@code-proxy/api-client";
import { HoverTooltip, OverflowTooltip } from "@code-proxy/ui";
import type { ReactNode } from "react";

/**
 * 访问控制的状态提醒：标题行里的一枚胶囊，不是标题上方单独的一条横幅。
 *
 * 它报告的状态确实重要（没配 trusted-proxies 时所有规则都存着、列着、却什么都拦不住），
 * 但状态是异步读回来的：以前横幅插在页面最上面，读回来那一刻把标签页、筛选和整张表一起往下推 43px。
 * 放进标题行（行高由右侧刷新按钮撑着）就不会再推动任何东西；补充说明放在悬停提示里，
 * 读屏仍然能读到（sr-only）。需要处理的情况点胶囊直接去「防护策略」页签，那里有一键修复。
 */
export function TrustBanner({
  status,
  onOpenPolicy,
}: {
  status: IpAccessStatus | null;
  /** 跳到「防护策略」页签；不传时胶囊不可点（例如单测里单独渲染）。 */
  onOpenPolicy?: () => void;
}) {
  const { t } = useTranslation();

  if (!status) return null;

  if (!status.storage_available) {
    return (
      <Notice
        tone="warning"
        icon={<TriangleAlert size={13} aria-hidden="true" />}
        message={t("ip_access.banner_no_storage")}
      />
    );
  }

  if (!status.trusted) {
    return (
      <Notice
        tone="danger"
        icon={<ShieldAlert size={13} aria-hidden="true" />}
        hints={[
          t("ip_access.banner_untrusted_hint", { ip: status.client_ip || "-" }),
          t("ip_access.banner_fix_hint"),
        ]}
        message={t("ip_access.banner_untrusted")}
        onClick={onOpenPolicy}
      />
    );
  }

  if (status.dropped_events && status.dropped_events > 0) {
    return (
      <Notice
        tone="warning"
        icon={<TriangleAlert size={13} aria-hidden="true" />}
        message={t("ip_access.banner_dropped", { count: status.dropped_events })}
      />
    );
  }

  return null;
}

/** 同色系淡底 + 彩色图标，不描边；简约风格下文字保持中性色，多彩风格下叠回同色系的文字色。 */
const TONE_CLASS = {
  danger: {
    box: "bg-rose-500/[0.09] text-ink-2 colorful:text-rose-800 colorful:dark:text-rose-200",
    icon: "text-rose-600 dark:text-rose-400",
  },
  warning: {
    box: "bg-amber-500/[0.1] text-ink-2 colorful:text-amber-800 colorful:dark:text-amber-200",
    icon: "text-amber-600 dark:text-amber-300",
  },
} as const;

function Notice({
  tone,
  icon,
  message,
  hints = [],
  onClick,
}: {
  tone: keyof typeof TONE_CLASS;
  icon: ReactNode;
  message: string;
  hints?: readonly string[];
  onClick?: () => void;
}) {
  const className = `inline-flex h-7 max-w-full min-w-0 items-center gap-1.5 rounded-full px-3 text-xs font-medium ${TONE_CLASS[tone].box}`;
  const body = (
    <>
      <span className={`shrink-0 ${TONE_CLASS[tone].icon}`}>{icon}</span>
      {hints.length > 0 ? (
        // 有补充说明时整枚胶囊都有提示（标题 + 说明），这里不再套一层截断提示，免得两个气泡打架。
        <span className="min-w-0 truncate">{message}</span>
      ) : (
        <OverflowTooltip content={message} className="min-w-0 truncate">
          {message}
        </OverflowTooltip>
      )}
      {hints.map((hint) => (
        <span key={hint} className="sr-only">
          {hint}
        </span>
      ))}
    </>
  );
  const pill = onClick ? (
    <button
      type="button"
      data-ip-access-notice={tone}
      onClick={onClick}
      className={`${className} cursor-pointer transition-shadow duration-150 hover:shadow-control`}
    >
      {body}
    </button>
  ) : (
    <span data-ip-access-notice={tone} className={className}>
      {body}
    </span>
  );
  if (hints.length === 0) return pill;
  return (
    <HoverTooltip
      placement="bottom"
      className="min-w-0 max-w-full"
      content={
        <span className="flex flex-col gap-0.5 text-xs">
          <span className="font-medium">{message}</span>
          {hints.map((hint) => (
            <span key={hint}>{hint}</span>
          ))}
        </span>
      }
    >
      {pill}
    </HoverTooltip>
  );
}
