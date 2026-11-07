import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Copy, Eye, EyeOff, Plus, Upload, X } from "lucide-react";
import { Button, Textarea, TextInput } from "@code-proxy/ui";

/** 一次粘贴进来的多个词：按行或逗号（中英文）分开，去掉空的。 */
export const splitWords = (text: string) =>
  text
    .split(/[\n,，]/)
    .map((w) => w.trim())
    .filter(Boolean);

/**
 * 脱敏词和「从不脱敏」共用的词表：一行一个，原地改、回车或离开时生效，清空或点 × 删掉；
 * 下面的输入框加一个或几个（逗号分开）；「批量导入」粘一大段，已有的跳过；「复制」按行复制出去。
 *
 * 脱敏词默认显示成圆点（`concealed`）：分享屏幕时不该把要瞒着上游的词露出来，点「显示」才看得见。
 */
export function WordListEditor({
  values,
  onChange,
  placeholder,
  label,
  concealable = false,
  disabled = false,
}: {
  values: string[];
  onChange: (next: string[]) => void;
  placeholder: string;
  label: string;
  concealable?: boolean;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState("");
  const [shown, setShown] = useState(!concealable);
  const [importing, setImporting] = useState(false);
  const [bulk, setBulk] = useState("");
  const conceal = concealable && !shown ? "[-webkit-text-security:disc]" : "";

  const add = (text: string) => {
    const have = new Set(values);
    const fresh = splitWords(text).filter((w) => !have.has(w) && (have.add(w), true));
    if (fresh.length > 0) onChange([...values, ...fresh]);
    return fresh.length;
  };
  const bulkFresh = splitWords(bulk).filter((w) => !values.includes(w));

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-xs text-ink-3">{t("privacy_masking.words.count", { count: values.length })}</span>
        <span className="flex-1" />
        {concealable ? (
          <Button size="xs" variant="ghost" onClick={() => setShown((v) => !v)} aria-pressed={shown}>
            {shown ? <EyeOff size={13} aria-hidden="true" /> : <Eye size={13} aria-hidden="true" />}
            {shown ? t("privacy_masking.words.hide") : t("privacy_masking.words.show")}
          </Button>
        ) : null}
        <Button size="xs" variant="ghost" onClick={() => setImporting((v) => !v)} disabled={disabled}>
          <Upload size={13} aria-hidden="true" />
          {t("privacy_masking.words.import")}
        </Button>
        <Button
          size="xs"
          variant="ghost"
          disabled={values.length === 0}
          onClick={() => void navigator.clipboard?.writeText(values.join("\n"))}
        >
          <Copy size={13} aria-hidden="true" />
          {t("privacy_masking.words.copy")}
        </Button>
      </div>

      {values.length > 0 ? (
        <ul className="flex flex-wrap gap-1.5" aria-label={label}>
          {values.map((word, index) => (
            <li
              key={`${word}-${index}`}
              className="group inline-flex max-w-full items-center gap-1 rounded-lg bg-subtle py-1 pr-1 pl-2.5 text-xs text-ink"
            >
              <span className={`truncate font-mono ${conceal}`}>{word}</span>
              <button
                type="button"
                disabled={disabled}
                onClick={() => onChange(values.filter((_, i) => i !== index))}
                aria-label={t("privacy_masking.words.remove", { word: shown ? word : "" })}
                className="grid size-5 place-items-center rounded-md text-ink-3 transition-colors hover:bg-rose-500/10 hover:text-rose-600"
              >
                <X size={12} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          add(draft);
          setDraft("");
        }}
      >
        <TextInput
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder={placeholder}
          aria-label={label}
          disabled={disabled}
          className={conceal}
        />
        <Button type="submit" size="sm" variant="secondary" disabled={disabled || !draft.trim()}>
          <Plus size={14} aria-hidden="true" />
          {t("privacy_masking.words.add")}
        </Button>
      </form>

      {importing ? (
        <div className="space-y-2 rounded-2xl bg-subtle p-3">
          <Textarea
            rows={4}
            value={bulk}
            onChange={(event) => setBulk(event.target.value)}
            placeholder={t("privacy_masking.words.import_placeholder")}
            aria-label={t("privacy_masking.words.import")}
            className={conceal}
          />
          <div className="flex items-center gap-2">
            <span className="text-xs text-ink-3">
              {bulk.trim() ? t("privacy_masking.words.import_new", { count: bulkFresh.length }) : null}
            </span>
            <span className="flex-1" />
            <Button size="sm" variant="ghost" onClick={() => (setImporting(false), setBulk(""))}>
              {t("common.cancel")}
            </Button>
            <Button
              size="sm"
              variant="primary"
              disabled={bulkFresh.length === 0}
              onClick={() => {
                add(bulk);
                setBulk("");
                setImporting(false);
              }}
            >
              {t("privacy_masking.words.import_confirm", { count: bulkFresh.length })}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
