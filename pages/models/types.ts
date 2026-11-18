import type {
  ConfiguredModelAvailability,
  ModelAvailabilityItem,
  ModelAvailabilitySource,
  ModelConfigMetadataItem,
  ModelPathAvailabilityItem,
  ModelPricing,
  ModelPricingMode,
} from "@features/model-availability";
export type {
  ConfiguredModelAvailability,
  ModelAvailabilityItem,
  ModelAvailabilitySource,
  ModelConfigMetadataItem,
  ModelPathAvailabilityItem,
  ModelPricing,
  ModelPricingMode,
} from "@features/model-availability";

export type ModelScope = "active" | "library";
/** The virtual tab edits virtual models and loads no model data of its own. */
export type ModelPageTab = ModelScope | "virtual";

export interface ModelItem {
  id: string;
  owned_by: string;
  description: string;
  enabled: boolean;
  source: string;
  /** Runtime channels/providers that can serve this model (from configured-availability). */
  sources?: ModelAvailabilitySource[];
  pricing: ModelPricing;
  inputModalities: string[];
  outputModalities: string[];
  supportsVision: boolean;
}

export interface ModelOwnerPreset {
  value: string;
  label: string;
  description: string;
  enabled: boolean;
  modelCount?: number;
}

export interface ModelFormState {
  originalId: string | null;
  id: string;
  ownedBy: string;
  description: string;
  enabled: boolean;
  mode: ModelPricingMode;
  inputPrice: string;
  outputPrice: string;
  cachedPrice: string;
  pricePerCall: string;
  /**
   * 改价时是否把最近 7 天已记录的请求全部按新价重算。不勾时后端只给当时没有价格、费用为 0 的
   * 请求补上费用，已按旧价算过的不动。
   */
  resyncHistory?: boolean;
}

export interface OwnerFormState {
  originalValue: string | null;
  value: string;
  label: string;
  description: string;
  enabled: boolean;
}

export interface OpenRouterModelSyncState {
  enabled: boolean;
  intervalMinutes: number;
  lastSyncAt: string;
  lastSuccessAt: string;
  lastError: string;
  lastSeen: number;
  lastAdded: number;
  lastUpdated: number;
  lastSkipped: number;
  running: boolean;
}

export interface OpenRouterModelSyncResult {
  seen: number;
  added: number;
  updated: number;
  skipped: number;
}
