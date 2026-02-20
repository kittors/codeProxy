import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/modules/ui/Button";
import { TextInput } from "@/modules/ui/Input";

export type KeyValueEntry = { id: string; key: string; value: string };

const uid = () => `kv-${Date.now()}-${Math.random().toString(16).slice(2)}`;

export const recordToKeyValueEntries = (record?: Record<string, string>): KeyValueEntry[] => {
  if (!record) return [];
  const entries: KeyValueEntry[] = [];
  Object.entries(record).forEach(([k, v]) => {
    const key = String(k ?? "").trim();
    if (!key) return;
    const value = typeof v === "string" ? v : String(v ?? "");
    entries.push({ id: uid(), key, value });
  });
  return entries;
};

export const keyValueEntriesToRecord = (
  entries: KeyValueEntry[],
): Record<string, string> | undefined => {
  const result: Record<string, string> = {};
  entries.forEach((entry) => {
    const key = entry.key.trim();
    if (!key) return;
    const value = entry.value.trim();
    if (!value) return;
    result[key] = value;
  });
  return Object.keys(result).length ? result : undefined;
};

export function KeyValueInputList({
  title,
  entries,
  onChange,
  keyPlaceholder = "Header 名称",
  valuePlaceholder = "Header 值",
  disabled = false,
}: {
  title: string;
  entries: KeyValueEntry[];
  onChange: (next: KeyValueEntry[]) => void;
  keyPlaceholder?: string;
  valuePlaceholder?: string;
  disabled?: boolean;
}) {
  return (
    <section className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold text-slate-900 dark:text-white">{title}</p>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => onChange([...entries, { id: uid(), key: "", value: "" }])}
          disabled={disabled}
        >
          <Plus size={14} />
          新增
        </Button>
      </div>

      {entries.length === 0 ? (
        <p className="text-xs text-slate-500 dark:text-white/55">未设置（可选）</p>
      ) : (
        <div className="space-y-2">
          {entries.map((entry, idx) => (
            <div key={entry.id} className="grid gap-2 md:grid-cols-12">
              <div className="md:col-span-5">
                <TextInput
                  value={entry.key}
                  placeholder={keyPlaceholder}
                  disabled={disabled}
                  onChange={(e) => {
                    const value = e.currentTarget.value;
                    onChange(entries.map((it, i) => (i === idx ? { ...it, key: value } : it)));
                  }}
                />
              </div>
              <div className="md:col-span-6">
                <TextInput
                  value={entry.value}
                  placeholder={valuePlaceholder}
                  disabled={disabled}
                  onChange={(e) => {
                    const value = e.currentTarget.value;
                    onChange(entries.map((it, i) => (i === idx ? { ...it, value } : it)));
                  }}
                />
              </div>
              <div className="md:col-span-1 flex items-center justify-end">
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() => onChange(entries.filter((_, i) => i !== idx))}
                  disabled={disabled}
                  aria-label="删除 Header"
                  title="删除"
                >
                  <Trash2 size={14} />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
