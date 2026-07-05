import { VendorIcon } from "@code-proxy/assets";

export function ModelVendorIcon({ modelId, size = 14 }: { modelId: string; size?: number }) {
  return <VendorIcon modelId={modelId} size={size} />;
}
