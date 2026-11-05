import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Building2, Globe2, KeyRound, Lock, UsersRound } from "lucide-react";
import type { WordPolicyBrief, WordPolicyOverview } from "@code-proxy/api-client";
import { HUE_GLYPH, hueForIcon } from "@code-proxy/ui";

/** 左侧列出的规则集：平台、本租户、API Key 专属、门户账号。 */
export type WordRailItem = "platform" | "tenant" | "keys" | "portal";

export interface WordScopeRailProps {
  overview: WordPolicyOverview;
  value: WordRailItem;
  /** 后端支持门户账号自定义敏感词（capabilities.word_portal）时才列出「门户账号」。 */
  showPortal: boolean;
  onChange: (next: WordRailItem) => void;
}

function RailButton({
  selected,
  icon,
  title,
  detail,
  badge,
  onClick,
}: {
  selected: boolean;
  icon: ReactNode;
  title: string;
  detail: string;
  badge?: ReactNode;
  onClick: () => void;
}) {
  // 多彩外观下图标按名字着色（全站同一个图标同一种颜色）；简约外观是中性灰，选中时用强调色。
  const hue = hueForIcon(icon);
  return (
    <button
      type="button"
      aria-current={selected ? "true" : undefined}
      onClick={onClick}
      className={[
        "flex w-full min-w-0 items-start gap-3 rounded-xl px-3 py-2.5 text-left transition",
        selected ? "bg-accent-soft" : "hover:bg-hover",
      ].join(" ")}
    >
      <span
        aria-hidden="true"
        className={[
          "mt-0.5 shrink-0 [&>svg]:size-4",
          selected ? "text-accent-ink" : ["text-ink-3", hue ? HUE_GLYPH[hue] : ""].join(" "),
        ].join(" ")}
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className={["truncate text-sm font-medium", selected ? "text-accent-ink" : "text-ink"].join(" ")}>
            {title}
          </span>
          {badge}
        </span>
        <span className="mt-0.5 block truncate text-xs text-ink-3">{detail}</span>
      </span>
    </button>
  );
}

/**
 * 敏感词页左侧的规则集清单：一眼看到每一层有没有设置、有多少词、是否启用，点一下就编辑那一层。
 * 规则按这个顺序叠加检查：平台 → 本租户（含 Key 的调整）→ 门户账号自己的词。
 */
export function WordScopeRail({ overview, value, showPortal, onChange }: WordScopeRailProps) {
  const { t } = useTranslation();
  const describe = (brief: WordPolicyBrief, audience: string) => {
    if (!brief.exists || brief.rule_count === 0) {
      return t("content_moderation.words.rail_empty", { audience });
    }
    if (!brief.enabled) return t("content_moderation.words.rail_disabled", { count: brief.rule_count });
    return t("content_moderation.words.rail_words", { audience, count: brief.rule_count });
  };
  const portal = overview.portal;

  return (
    <nav aria-label={t("content_moderation.words.rail_label")} className="grid grid-cols-2 gap-1 lg:grid-cols-1">
      <RailButton
        selected={value === "platform"}
        icon={<Globe2 />}
        title={t("content_moderation.words.rail_platform")}
        detail={describe(overview.platform, t("content_moderation.words.audience_platform"))}
        badge={
          overview.can_manage_platform ? null : (
            <Lock size={12} aria-label={t("content_moderation.words.read_only")} className="shrink-0 text-ink-3" />
          )
        }
        onClick={() => onChange("platform")}
      />
      <RailButton
        selected={value === "tenant"}
        icon={<Building2 />}
        title={t("content_moderation.words.rail_tenant")}
        detail={describe(overview.tenant, t("content_moderation.words.audience_tenant"))}
        onClick={() => onChange("tenant")}
      />
      <RailButton
        selected={value === "keys"}
        icon={<KeyRound />}
        title={t("content_moderation.words.rail_keys")}
        detail={
          overview.keys.length > 0
            ? t("content_moderation.words.rail_keys_count", { count: overview.keys.length })
            : t("content_moderation.words.rail_keys_none")
        }
        onClick={() => onChange("keys")}
      />
      {showPortal ? (
        <RailButton
          selected={value === "portal"}
          icon={<UsersRound />}
          title={t("content_moderation.words.rail_portal")}
          detail={
            portal?.default_allowed
              ? t("content_moderation.words.rail_portal_open", { count: portal.policies })
              : portal && portal.active_policies > 0
                ? t("content_moderation.words.rail_portal_some", { count: portal.active_policies })
                : t("content_moderation.words.rail_portal_closed")
          }
          onClick={() => onChange("portal")}
        />
      ) : null}
    </nav>
  );
}
