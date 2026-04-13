import { useTranslation } from "react-i18next";
import { Plus, Save, Trash2 } from "lucide-react";
import { Button } from "@/modules/ui/Button";
import { Card } from "@/modules/ui/Card";
import { TextInput } from "@/modules/ui/Input";
import { ToggleSwitch } from "@/modules/ui/ToggleSwitch";
import type { AmpMappingEntry } from "@/modules/providers/providers-helpers";

interface AmpcodePanelProps {
  loading: boolean;
  isPending: boolean;
  saveAmpcode: () => Promise<void>;
  ampcode: Record<string, unknown> | null;
  ampMappings: AmpMappingEntry[];
  ampUpstreamUrl: string;
  setAmpUpstreamUrl: (value: string) => void;
  ampUpstreamApiKey: string;
  setAmpUpstreamApiKey: (value: string) => void;
  ampForceMappings: boolean;
  setAmpForceMappings: (value: boolean) => void;
  setAmpMappings: React.Dispatch<React.SetStateAction<AmpMappingEntry[]>>;
}

export function AmpcodePanel({
  loading,
  isPending,
  saveAmpcode,
  ampcode,
  ampMappings,
  ampUpstreamUrl,
  setAmpUpstreamUrl,
  ampUpstreamApiKey,
  setAmpUpstreamApiKey,
  ampForceMappings,
  setAmpForceMappings,
  setAmpMappings,
}: AmpcodePanelProps) {
  const { t } = useTranslation();

  return (
    <Card
      title={t("providers.ampcode_title")}
      description={t("providers.ampcode_desc")}
      actions={
        <Button
          variant="primary"
          size="sm"
          onClick={() => void saveAmpcode()}
          disabled={loading || isPending}
        >
          <Save size={14} />
          {t("providers.save")}
        </Button>
      }
    >
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-3">
          <TextInput
            value={ampUpstreamUrl}
            onChange={(e) => setAmpUpstreamUrl(e.currentTarget.value)}
            placeholder={t("providers.upstream_url_hint")}
          />
          <TextInput
            value={ampUpstreamApiKey}
            onChange={(e) => setAmpUpstreamApiKey(e.currentTarget.value)}
            placeholder={t("providers.upstream_key_hint")}
          />
          <div className="rounded-2xl border border-slate-200 bg-white/70 p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-950/60">
            <ToggleSwitch
              label={t("providers.force_mapping")}
              description={t("providers.force_mapping_desc")}
              checked={ampForceMappings}
              onCheckedChange={setAmpForceMappings}
            />
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white/70 p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-950/60">
            <p className="text-xs text-slate-600 dark:text-white/65">
              {t("providers.current_status", {
                status: ampcode
                  ? t("providers.status_loaded")
                  : t("providers.status_not_loaded"),
                count: ampMappings.length,
              })}
            </p>
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-sm font-semibold text-slate-900 dark:text-white">
            {t("providers.model_mappings")}
          </p>
          {ampMappings.map((entry, idx) => (
            <div key={entry.id} className="grid gap-2 md:grid-cols-12">
              <div className="md:col-span-5">
                <TextInput
                  value={entry.from}
                  onChange={(e) => {
                    const value = e.currentTarget.value;
                    setAmpMappings((prev) =>
                      prev.map((it, i) => (i === idx ? { ...it, from: value } : it)),
                    );
                  }}
                  placeholder={t("providers.mapping_from_placeholder")}
                />
              </div>
              <div className="md:col-span-5">
                <TextInput
                  value={entry.to}
                  onChange={(e) => {
                    const value = e.currentTarget.value;
                    setAmpMappings((prev) =>
                      prev.map((it, i) => (i === idx ? { ...it, to: value } : it)),
                    );
                  }}
                  placeholder={t("providers.mapping_to_placeholder")}
                />
              </div>
              <div className="md:col-span-2 flex items-center justify-end">
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() => setAmpMappings((prev) => prev.filter((_, i) => i !== idx))}
                  disabled={ampMappings.length <= 1}
                  aria-label={t("providers.delete_mapping")}
                  title={t("providers.delete_mapping")}
                >
                  <Trash2 size={14} />
                </Button>
              </div>
            </div>
          ))}
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() =>
                setAmpMappings((prev) => [...prev, { id: `map-${Date.now()}`, from: "", to: "" }])
              }
            >
              <Plus size={14} />
              {t("providers.add")}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setAmpMappings([{ id: `map-${Date.now()}`, from: "", to: "" }])}
            >
              {t("providers.clear")}
            </Button>
          </div>
        </div>
      </div>
    </Card>
  );
}
