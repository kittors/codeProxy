import type { PeriodSpendingDraft } from "@features/period-spending";

export interface ApiKeyFormValues {
  name: string;
  key: string;
  permissionProfileId: string;
  dailyLimit: string;
  totalQuota: string;
  spendingLimit: string;
  periodSpending: PeriodSpendingDraft;
  concurrencyLimit: string;
  rpmLimit: string;
  tpmLimit: string;
  allowedModels: string[];
  allowedChannels: string[];
  allowedChannelGroups: string[];
  useExactChannelRestrictions: boolean;
  systemPrompt: string;
}

export interface ApiKeyUsageSummary {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  requestCount: number;
  successRate: number;
}
