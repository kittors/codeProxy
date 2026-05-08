import { useTranslation } from "react-i18next";
import iconClaude from "@/assets/icons/claude.svg";
import iconCodex from "@/assets/icons/codex.svg";
import iconGemini from "@/assets/icons/gemini.svg";
import { Modal } from "@/modules/ui/Modal";
import type { CcSwitchImportConfigListItem } from "@/modules/ccswitch/ccswitchImportConfigList";
import type { CcSwitchClientType } from "@/modules/ccswitch/ccswitchImport";

const iconByType: Record<CcSwitchClientType, string> = {
  claude: iconClaude,
  codex: iconCodex,
  gemini: iconGemini,
};

export interface CcSwitchImportCardListProps {
  open: boolean;
  configs: CcSwitchImportConfigListItem[];
  onSelect: (config: CcSwitchImportConfigListItem) => void;
  onClose: () => void;
}

export function CcSwitchImportCardList({
  open,
  configs,
  onSelect,
  onClose,
}: CcSwitchImportCardListProps) {
  const { t } = useTranslation();

  return (
    <Modal
      open={open}
      title={t("ccswitch.import_to_ccswitch")}
      description={t("ccswitch.import_card_list_desc")}
      maxWidth="max-w-xl"
      onClose={onClose}
      bodyClassName="bg-slate-50/45 dark:bg-neutral-950/45"
    >
      <div className="space-y-3">
        {configs.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-500 dark:text-white/55">
            {t("ccswitch.import_no_compatible_configs")}
          </p>
        ) : (
          configs.map((config) => (
            <button
              key={config.id}
              type="button"
              onClick={() => onSelect(config)}
              className="flex w-full items-start gap-4 rounded-2xl border border-black/[0.06] bg-white p-4 text-left shadow-[0_1px_2px_rgb(15_23_42_/_0.035)] transition hover:border-slate-200 hover:shadow-sm active:translate-y-px dark:border-white/[0.06] dark:bg-neutral-900 dark:hover:border-neutral-700"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200/70 bg-white shadow-xs dark:border-neutral-800 dark:bg-neutral-950">
                <img src={iconByType[config.clientType]} alt="" className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-semibold text-slate-900 dark:text-white">
                    {config.providerName}
                  </span>
                  {config.clientType === "claude" && config.apiKeyField ? (
                    <span className="shrink-0 rounded-md border border-slate-200/70 bg-slate-50 px-1.5 py-0.5 font-mono text-[10px] text-slate-500 dark:border-neutral-800 dark:bg-neutral-950 dark:text-white/45">
                      {config.apiKeyField}
                    </span>
                  ) : null}
                </div>
                {config.note ? (
                  <p className="mt-0.5 truncate text-xs text-slate-500 dark:text-white/55">
                    {config.note}
                  </p>
                ) : null}
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <span className="inline-flex max-w-full overflow-hidden text-ellipsis whitespace-nowrap rounded-md border border-slate-200/70 bg-white px-1.5 py-0.5 font-mono text-[10px] text-slate-500 dark:border-neutral-800 dark:bg-neutral-950 dark:text-white/45">
                    {config.defaultModel}
                  </span>
                  {config.allowedChannelGroups.length > 0 ? (
                    <span className="truncate text-[10px] text-slate-400 dark:text-white/35">
                      {config.allowedChannelGroups.join(", ")}
                    </span>
                  ) : null}
                </div>
              </div>
            </button>
          ))
        )}
      </div>
    </Modal>
  );
}
