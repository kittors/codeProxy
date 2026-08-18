import type { ComponentProps } from "react";
import type { ProviderSimpleConfig } from "@code-proxy/api-client";
import { TabsContent } from "@code-proxy/ui";
import { ProviderKeyListCard } from "../ProviderKeyListCard";
import {
  getEffectiveProviderModels,
  type DiscoveredProviderModel,
} from "../provider-model-access";
import {
  getProviderUsageCacheKey,
  hasProviderUsageQuery,
  PROVIDER_USAGE_WINDOWS,
  type ProviderUsageProvider,
} from "../provider-usage-config";
import {
  OpenCodeGoUsageCardSection,
  OpenCodeGoUsageRefreshButton,
  type OpenCodeGoUsageStore,
} from "./OpenCodeGoUsageCardSection";

type ListCardProps = ComponentProps<typeof ProviderKeyListCard>;

type ProviderUsageTabContentProps = {
  provider: ProviderUsageProvider;
  items: ProviderSimpleConfig[];
  loading: boolean;
  /** OpenCode Go pins its own endpoint, so its cards hide the base URL row. */
  showBaseUrl?: boolean;
  catalog: DiscoveredProviderModel[];
  usageStore: OpenCodeGoUsageStore;
  getStats: ListCardProps["getStats"];
  getStatusBar: ListCardProps["getStatusBar"];
  onEdit: (index: number) => void;
  onDelete: (index: number) => void;
  onToggleEnabled: (index: number, enabled: boolean) => void;
  onRefreshUsage: (item: ProviderSimpleConfig, index: number) => void;
  selectedKeys: ListCardProps["selectedKeys"];
  onToggleSelected: ListCardProps["onToggleSelected"];
};

/**
 * The card list for a channel that reports plan usage.
 *
 * Every such channel renders the same card with the same usage section; only the
 * provider id differs. Keeping one component means adding a channel costs a call
 * site rather than another copy of this tree.
 */
export function ProviderUsageTabContent({
  provider,
  items,
  loading,
  showBaseUrl = true,
  catalog,
  usageStore,
  getStats,
  getStatusBar,
  onEdit,
  onDelete,
  onToggleEnabled,
  onRefreshUsage,
  selectedKeys,
  onToggleSelected,
}: ProviderUsageTabContentProps) {
  return (
    <TabsContent value={provider} className="min-h-0 flex flex-1 flex-col">
      <ProviderKeyListCard
        items={items}
        loading={loading}
        onEdit={onEdit}
        onDelete={onDelete}
        onToggleEnabled={onToggleEnabled}
        isItemEnabled={(item) => item.disabled !== true}
        getStats={getStats}
        getStatusBar={getStatusBar}
        getDisplayModels={(item) =>
          getEffectiveProviderModels(provider, item, catalog)
        }
        {...(showBaseUrl ? {} : { showBaseUrl: false })}
        naturalHeight
        showConnectionRows={false}
        showModelMetric={false}
        showExcludedModels={false}
        renderExtra={(item, idx) => (
          <OpenCodeGoUsageCardSection
            cacheKey={getProviderUsageCacheKey(provider, item, idx)}
            queryReady={hasProviderUsageQuery(provider, item)}
            usageStore={usageStore}
            windowTypes={PROVIDER_USAGE_WINDOWS[provider]}
          />
        )}
        renderMetricsExtra={(item, idx) =>
          hasProviderUsageQuery(provider, item) ? (
            <OpenCodeGoUsageRefreshButton
              cacheKey={getProviderUsageCacheKey(provider, item, idx)}
              usageStore={usageStore}
              onRefresh={() => onRefreshUsage(item, idx)}
            />
          ) : null
        }
        selectedKeys={selectedKeys}
        onToggleSelected={onToggleSelected}
      />
    </TabsContent>
  );
}
