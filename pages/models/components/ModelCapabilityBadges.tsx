import { useTranslation } from "react-i18next";
import type { ModelItem } from "../types";
import { modelHasTextCapability } from "../modelsUtils";

export function ModelCapabilityBadges({ model }: { model: ModelItem }) {
  const { t } = useTranslation();
  const badges: Array<{ key: string; label: string; className: string }> = [];
  const hasImageOutput = model.outputModalities.includes("image");

  if (!hasImageOutput && modelHasTextCapability(model)) {
    badges.push({
      key: "text",
      label: t("models_page.capability_text"),
      className: "bg-slate-100 text-slate-600 dark:bg-white/[0.08] dark:text-white/60",
    });
  }
  if (model.supportsVision || model.inputModalities.includes("image")) {
    badges.push({
      key: "vision",
      label: t("models_page.capability_vision"),
      className: "bg-sky-50 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300",
    });
  }
  if (hasImageOutput) {
    badges.push({
      key: "image-output",
      label: t("models_page.capability_image_output"),
      className: "bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
    });
  }

  if (badges.length === 0) {
    badges.push({
      key: "unknown",
      label: t("models_page.capability_unknown"),
      className: "bg-slate-100 text-slate-500 dark:bg-white/[0.06] dark:text-white/45",
    });
  }

  return (
    <div className="flex min-w-0 flex-wrap gap-1.5">
      {badges.map((badge) => (
        <span
          key={badge.key}
          className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${badge.className}`}
        >
          {badge.label}
        </span>
      ))}
    </div>
  );
}
