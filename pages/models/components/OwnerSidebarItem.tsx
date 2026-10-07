import { Edit3, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@code-proxy/ui";
import { ModelVendorTile, modelVendorBrand } from "@features/model-tags";
import type { ModelOwnerPreset } from "../types";

/**
 * 模型库左侧归属列表的一行：品牌图标块 + 名称 + 品牌色的模型数。认得出的归属方（openai、
 * anthropic、google……）带自家 logo 和颜色，自定义归属方回落中性。悬停时数量左移，让出编辑、
 * 删除按钮；选中态仍是中性底，颜色只用来认人，不用来表示状态。
 */
export function OwnerSidebarItem({
  owner,
  count,
  selected,
  onSelect,
  onEdit,
  onDelete,
}: {
  owner: ModelOwnerPreset;
  count: number;
  selected: boolean;
  onSelect: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { t } = useTranslation();
  const brand = modelVendorBrand(owner.value);
  return (
    <div
      className={[
        "group/owner relative flex items-center gap-2 overflow-hidden rounded-xl px-2 py-1.5 transition-colors duration-200 ease-out",
        selected
          ? "bg-slate-100 ring-1 ring-slate-200 dark:bg-white/[0.08] dark:ring-white/10"
          : "hover:bg-slate-50 dark:hover:bg-white/[0.04]",
      ].join(" ")}
    >
      <ModelVendorTile modelId={owner.value} compact />
      <button
        type="button"
        onClick={onSelect}
        className="min-w-0 flex-1 text-left"
        title={owner.description || owner.value}
      >
        <span className="block truncate text-sm font-medium text-slate-900 dark:text-white">
          {owner.label || owner.value}
        </span>
        <span className="block truncate text-xs text-slate-500 dark:text-white/45">
          {owner.value}
        </span>
      </button>
      <span
        style={brand.style}
        className={`${brand.className} shrink-0 rounded-full px-2 py-0.5 text-xs transition-transform duration-200 ease-out group-focus-within/owner:-translate-x-16 group-hover/owner:-translate-x-16 motion-reduce:transition-none`}
      >
        {t("models_page.owner_model_count", { count })}
      </span>
      <div className="pointer-events-none absolute right-2 top-1/2 flex -translate-y-1/2 translate-x-3 items-center gap-1 opacity-0 transition-all duration-200 ease-out group-focus-within/owner:pointer-events-auto group-focus-within/owner:translate-x-0 group-focus-within/owner:opacity-100 group-hover/owner:pointer-events-auto group-hover/owner:translate-x-0 group-hover/owner:opacity-100 motion-reduce:transition-none">
        <Button
          size="xs"
          variant="ghost"
          className="transition-all duration-200 ease-out"
          onClick={onEdit}
          aria-label={t("models_page.edit_owner_aria", { owner: owner.label })}
          title={t("models_page.edit_owner_aria", { owner: owner.label })}
        >
          <Edit3 size={13} />
        </Button>
        <Button
          size="xs"
          variant="ghost"
          className="transition-all duration-200 ease-out"
          onClick={onDelete}
          aria-label={t("models_page.delete_owner_aria", { owner: owner.label })}
          title={t("models_page.delete_owner_aria", { owner: owner.label })}
        >
          <Trash2 size={13} />
        </Button>
      </div>
    </div>
  );
}
