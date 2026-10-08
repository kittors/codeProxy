import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { AudioLines, Eye, ImagePlus, MessageSquareText, Video } from "lucide-react";
import {
  resolveModelCapabilities,
  type ModelCapabilityKey,
  type ModelCapabilitySource,
} from "@features/model-availability";

type BadgeItem = {
  key: string;
  label: string;
  className: string;
  icon: ReactNode | null;
};

/**
 * 能力标签一律中性淡底，靠图标和文字区分。以前视觉天蓝、出图琥珀、音频绿……按类别上色，
 * 一张模型卡片上三四种颜色，读起来像状态告警；语义色只留给成功 / 警告 / 错误。
 */
const NEUTRAL_BADGE = "bg-ink/[0.05] text-ink-2 dark:bg-white/[0.07]";

const BADGE_CLASS: Record<ModelCapabilityKey, string> = {
  text: NEUTRAL_BADGE,
  vision: NEUTRAL_BADGE,
  image: NEUTRAL_BADGE,
  video: NEUTRAL_BADGE,
  audio: NEUTRAL_BADGE,
};

const BADGE_ICON: Record<ModelCapabilityKey, ReactNode> = {
  text: <MessageSquareText size={11} aria-hidden="true" />,
  vision: <Eye size={11} aria-hidden="true" />,
  image: <ImagePlus size={11} aria-hidden="true" />,
  video: <Video size={11} aria-hidden="true" />,
  audio: <AudioLines size={11} aria-hidden="true" />,
};

function capabilityLabel(
  key: ModelCapabilityKey,
  t: (key: string) => string,
): string {
  switch (key) {
    case "text":
      return t("models_page.capability_text");
    case "vision":
      return t("models_page.capability_vision");
    case "image":
      return t("models_page.capability_image_output");
    case "video":
      return t("models_page.capability_video");
    case "audio":
      return t("models_page.capability_audio");
  }
}

export function ModelCapabilityBadges({
  model,
  size = "md",
  showUnknown = true,
}: {
  model: ModelCapabilitySource;
  size?: "sm" | "md";
  /** When false, hide the "unknown" fallback (plaza prefers empty over noise). */
  showUnknown?: boolean;
}) {
  const { t } = useTranslation();
  const keys = resolveModelCapabilities(model);

  const badges: BadgeItem[] = keys.map((key) => ({
    key,
    label: capabilityLabel(key, t),
    className: BADGE_CLASS[key],
    icon: BADGE_ICON[key],
  }));

  if (badges.length === 0) {
    if (!showUnknown) return null;
    badges.push({
      key: "unknown",
      label: t("models_page.capability_unknown"),
      className: "bg-ink/[0.05] text-ink-3 dark:bg-white/[0.07]",
      icon: null,
    });
  }

  const pad = size === "sm" ? "px-1.5 py-0.5" : "px-2 py-0.5";

  return (
    <div
      className="flex min-w-0 flex-wrap gap-1"
      data-testid="model-capability-badges"
      aria-label={badges.map((badge) => badge.label).join(", ")}
    >
      {badges.map((badge) => (
        <span
          key={badge.key}
          title={badge.label}
          className={`inline-flex items-center gap-1 rounded-full ${pad} text-2xs font-semibold ${badge.className}`}
        >
          {badge.icon}
          <span>{badge.label}</span>
        </span>
      ))}
    </div>
  );
}
