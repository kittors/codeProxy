import { Search } from "lucide-react";
import { Button } from "@/modules/ui/Button";
import { Card } from "@/modules/ui/Card";
import { TextInput } from "@/modules/ui/Input";

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
          <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-white/80">
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
            startAdornment={<Search size={16} className="text-slate-400 dark:text-white/40" />}
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
              className="h-4 w-4 rounded-full border-2 border-white/30 border-t-white motion-reduce:animate-none motion-safe:animate-spin dark:border-neutral-950/30 dark:border-t-neutral-950"
              aria-hidden="true"
            />
          ) : null}
          {t("apikey_lookup.query")}
        </Button>
      </form>
    </Card>
  );
}
