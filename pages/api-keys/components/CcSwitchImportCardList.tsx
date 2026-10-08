import { useTranslation } from "react-i18next";
import { Check, Copy, Import } from "lucide-react";
import iconClaude from "@code-proxy/assets/icons/claude.svg";
import iconCodex from "@code-proxy/assets/icons/codex.svg";
import iconGemini from "@code-proxy/assets/icons/gemini.svg";
import { Button, EmptyState, Modal, surface } from "@code-proxy/ui";
import type { CcSwitchImportConfigListItem } from "@code-proxy/domain/ccswitch/ccswitchImportConfigList";
import type { CcSwitchClientType } from "@code-proxy/domain/ccswitch/ccswitchImport";

const iconByType: Record<CcSwitchClientType, string> = {
  claude: iconClaude,
  codex: iconCodex,
  gemini: iconGemini,
};

export interface CcSwitchImportCardListProps {
  open: boolean;
  configs: CcSwitchImportConfigListItem[];
  copiedConfigId: string | null;
  onCopyLink: (config: CcSwitchImportConfigListItem) => void;
  onSelect: (config: CcSwitchImportConfigListItem) => void;
  onClose: () => void;
}

/**
 * 选择要导入 CC Switch 的预设。
 *
 * 每个预设是一张可点的卡片：左侧客户端图标，中间名称、备注、默认模型与渠道分组，
 * 点卡片即导入；右侧单独的复制按钮复制导入链接（发给别人或在另一台机器上打开）。
 * 卡片和「添加 AI 账号」里的提供商选择用同一种外观。
 *
 * 卡片本身已是弹窗里的一层淡底，图标不再垫一个带底色的方块（卡片角落里的底色块圆角对不上），
 * 标签也用叠加淡底——和卡片同色的 bg-subtle 落在卡片上等于没有。
 */
export function CcSwitchImportCardList({
  open,
  configs,
  copiedConfigId,
  onCopyLink,
  onSelect,
  onClose,
}: CcSwitchImportCardListProps) {
  const { t } = useTranslation();

  return (
    <Modal
      open={open}
      title={t("ccswitch.import_to_ccswitch")}
      description={t("ccswitch.import_card_list_desc")}
      icon={<Import />}
      size="md"
      onClose={onClose}
    >
      {configs.length === 0 ? (
        <EmptyState title={t("ccswitch.import_no_compatible_configs")} icon={<Import size={20} />} />
      ) : (
        <ul className="space-y-2.5">
          {configs.map((config) => {
            const isCopied = copiedConfigId === config.id;
            const copyLabel = isCopied
              ? t("ccswitch.copy_import_link_copied")
              : t("ccswitch.copy_import_link");

            return (
              <li
                key={config.id}
                className={`${surface({ tone: "raised", radius: "2xl" })} grid grid-cols-[minmax(0,1fr)_auto] transition-colors hover:bg-hover`}
              >
                <button
                  type="button"
                  onClick={() => onSelect(config)}
                  className="flex min-w-0 items-start gap-3.5 rounded-l-2xl p-4 text-left transition active:translate-y-px"
                >
                  <img src={iconByType[config.clientType]} alt="" className="mt-0.5 h-5 w-5 shrink-0" />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="truncate text-sm font-semibold text-ink">
                        {config.providerName}
                      </span>
                      {config.clientType === "claude" && config.apiKeyField ? (
                        <span className="shrink-0 rounded-md bg-ink/[0.05] px-1.5 py-0.5 font-mono text-2xs text-ink-3 dark:bg-white/[0.07]">
                          {config.apiKeyField}
                        </span>
                      ) : null}
                    </span>
                    {config.note ? (
                      <span className="mt-0.5 block truncate text-xs text-ink-3">{config.note}</span>
                    ) : null}
                    <span className="mt-2 flex flex-wrap items-center gap-2">
                      <span className="inline-flex max-w-full overflow-hidden text-ellipsis whitespace-nowrap rounded-md bg-ink/[0.05] px-1.5 py-0.5 font-mono text-2xs text-ink-2 dark:bg-white/[0.07]">
                        {config.defaultModel}
                      </span>
                      {config.allowedChannelGroups.length > 0 ? (
                        <span className="truncate text-2xs text-ink-3">
                          {config.allowedChannelGroups.join(", ")}
                        </span>
                      ) : null}
                    </span>
                  </span>
                </button>
                <div className="flex items-start p-3 pl-0">
                  <Button
                    variant="ghost"
                    size="xs"
                    title={copyLabel}
                    onClick={() => onCopyLink(config)}
                  >
                    {isCopied ? (
                      <Check size={14} className="text-emerald-600 dark:text-emerald-300" />
                    ) : (
                      <Copy size={14} />
                    )}
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Modal>
  );
}
