import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/modules/ui/Button";
import { TextInput } from "@/modules/ui/Input";

export type ModelEntryDraft = {
  id: string;
  name: string;
  alias: string;
  priorityText: string;
  testModel: string;
};

const uid = () => `model-${Date.now()}-${Math.random().toString(16).slice(2)}`;

export const createEmptyModelEntry = (): ModelEntryDraft => ({
  id: uid(),
  name: "",
  alias: "",
  priorityText: "",
  testModel: "",
});

export function ModelInputList({
  title,
  entries,
  onChange,
  namePlaceholder = "模型名称",
  aliasPlaceholder = "模型别名（可选）",
  disabled = false,
  showPriority = true,
  showTestModel = false,
}: {
  title: string;
  entries: ModelEntryDraft[];
  onChange: (next: ModelEntryDraft[]) => void;
  namePlaceholder?: string;
  aliasPlaceholder?: string;
  disabled?: boolean;
  showPriority?: boolean;
  showTestModel?: boolean;
}) {
  return (
    <section className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold text-slate-900 dark:text-white">{title}</p>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => onChange([...entries, createEmptyModelEntry()])}
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
              <div className={showPriority || showTestModel ? "md:col-span-4" : "md:col-span-5"}>
                <TextInput
                  value={entry.name}
                  placeholder={namePlaceholder}
                  disabled={disabled}
                  onChange={(e) => {
                    const value = e.currentTarget.value;
                    onChange(entries.map((it, i) => (i === idx ? { ...it, name: value } : it)));
                  }}
                />
              </div>
              <div className={showPriority || showTestModel ? "md:col-span-4" : "md:col-span-6"}>
                <TextInput
                  value={entry.alias}
                  placeholder={aliasPlaceholder}
                  disabled={disabled}
                  onChange={(e) => {
                    const value = e.currentTarget.value;
                    onChange(entries.map((it, i) => (i === idx ? { ...it, alias: value } : it)));
                  }}
                />
              </div>
              {showPriority ? (
                <div className={showTestModel ? "md:col-span-2" : "md:col-span-3"}>
                  <TextInput
                    value={entry.priorityText}
                    placeholder="优先级（可选）"
                    disabled={disabled}
                    inputMode="numeric"
                    onChange={(e) => {
                      const value = e.currentTarget.value;
                      onChange(
                        entries.map((it, i) => (i === idx ? { ...it, priorityText: value } : it)),
                      );
                    }}
                  />
                </div>
              ) : null}
              {showTestModel ? (
                <div className="md:col-span-2">
                  <TextInput
                    value={entry.testModel}
                    placeholder="testModel（可选）"
                    disabled={disabled}
                    onChange={(e) => {
                      const value = e.currentTarget.value;
                      onChange(
                        entries.map((it, i) => (i === idx ? { ...it, testModel: value } : it)),
                      );
                    }}
                  />
                </div>
              ) : null}
              <div className="md:col-span-1 flex items-center justify-end">
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() => onChange(entries.filter((_, i) => i !== idx))}
                  disabled={disabled}
                  aria-label="删除模型"
                  title="删除"
                >
                  <Trash2 size={14} />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <p className="text-xs text-slate-500 dark:text-white/55">
        提示：每个模型一行；别名用于重写下游的模型名。优先级数字越大越优先。
      </p>
    </section>
  );
}
