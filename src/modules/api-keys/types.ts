export interface ApiKeyFormValues {
  name: string;
  key: string;
  dailyLimit: string;
  totalQuota: string;
  concurrencyLimit: string;
  rpmLimit: string;
  tpmLimit: string;
  allowedModels: string[];
  allowedChannels: string[];
  allowedChannelGroups: string[];
  useExactChannelRestrictions: boolean;
  systemPrompt: string;
}
