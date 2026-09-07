export type RoutingModelOption = {
  id: string;
  owned_by?: string;
  description?: string;
  pricing?: import("@features/model-availability").ModelPricing;
};

export type RoutingModelLoadResult = string | RoutingModelOption;
