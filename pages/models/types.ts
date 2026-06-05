import type {
  ConfiguredModelAvailability,
  ModelAvailabilityItem,
  ModelConfigMetadataItem,
  ModelPathAvailabilityItem,
  ModelPricing,
  ModelPricingMode,
} from "@features/model-availability";
export type {
  ConfiguredModelAvailability,
  ModelAvailabilityItem,
  ModelConfigMetadataItem,
  ModelPathAvailabilityItem,
  ModelPricing,
  ModelPricingMode,
} from "@features/model-availability";

export type ModelScope = "active" | "library";
export type ModelPageTab = ModelScope;

export interface ModelItem {
  id: string;
  owned_by: string;
  description: string;
  enabled: boolean;
  source: string;
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
