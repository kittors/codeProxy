import { Search } from "lucide-react";
import { Button } from "@code-proxy/ui";
import { Card } from "@code-proxy/ui";
import { TextInput } from "@code-proxy/ui";

export function LookupSearchSection({
  t,
  apiKeyInput,
  setApiKeyInput,
  handleSubmit,
  loading,
}: {
  t: (key: string, options?: Record<string, unknown>) => string;
  apiKeyInput: string;
  setApiKeyInput: (value: string) => void;
  handleSubmit: (event?: React.FormEvent) => void;
  loading: boolean;
}) {
  return (
    <Card>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4 sm:flex-row sm:items-end">
        <div className="flex-1">
          <label className="mb-1.5 block text-sm font-medium text-ink-2">
            {t("apikey_lookup.api_key_label")}
          </label>
          <TextInput
            type="password"
            id="apikey-input"
            value={apiKeyInput}
            onChange={(e) => setApiKeyInput(e.target.value)}
            placeholder={t("apikey_lookup.placeholder")}
            autoComplete="off"
            spellCheck={false}
            startAdornment={<Search size={16} className="text-ink-3" />}
          />
        </div>
        <Button
          variant="primary"
          type="submit"
          id="apikey-lookup-submit"
          disabled={!apiKeyInput.trim() || loading}
          className="shrink-0 px-5"
        >
          {loading ? (
            <span
              className="h-4 w-4 rounded-full border-2 border-accent-fg/30 border-t-accent-fg motion-reduce:animate-none motion-safe:animate-spin"
              aria-hidden="true"
            />
          ) : null}
          {t("apikey_lookup.query")}
        </Button>
      </form>
    </Card>
  );
}
