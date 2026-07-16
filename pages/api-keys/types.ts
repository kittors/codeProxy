export interface ApiKeyFormValues {
  name: string;
  key: string;
  permissionProfileId: string;
  dailyLimit: string;
  totalQuota: string;
  spendingLimit: string;
  /** Key-owned daily USD spending limit; empty/0 = unlimited. */
  dailySpendingLimit: string;
  concurrencyLimit: string;
  rpmLimit: string;
  tpmLimit: string;
  allowedModels: string[];
  allowedChannels: string[];
  allowedChannelGroups: string[];
  useExactChannelRestrictions: boolean;
  systemPrompt: string;
}
