interface ProviderConnectionRowsProps {
  apiKey?: string;
  baseUrl?: string;
  proxyUrl?: string;
  proxyId?: string;
  maskApiKey: (value: string) => string;
  showBaseUrl?: boolean;
}

export function ProviderConnectionRows({
  apiKey,
  baseUrl,
  proxyUrl,
  proxyId,
  maskApiKey,
  showBaseUrl = true,
}: ProviderConnectionRowsProps) {
  return (
    <div className="space-y-1 text-xs text-slate-600 dark:text-white/65">
      {apiKey ? (
        <p className="truncate font-mono" title={apiKey}>
          {maskApiKey(apiKey)}
        </p>
      ) : null}
      {showBaseUrl && baseUrl ? (
        <p className="truncate font-mono" title={baseUrl}>
          {baseUrl}
        </p>
      ) : null}
      {proxyId ? (
        <p className="truncate font-mono" title={`proxyId: ${proxyId}`}>
          proxyId: {proxyId}
        </p>
      ) : proxyUrl ? (
        <p className="truncate font-mono" title={proxyUrl}>
          {proxyUrl}
        </p>
      ) : null}
    </div>
  );
}
