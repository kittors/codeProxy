import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { AuthFileItem } from "@/lib/http/types";
import { Button } from "@/modules/ui/Button";
import { TextInput } from "@/modules/ui/Input";
import { Modal } from "@/modules/ui/Modal";
import {
  buildAuthFileDisplayTags,
  normalizeTagValue,
  readAuthFileCustomTags,
  readAuthFileDefaultTags,
  readAuthFileHiddenDefaultTags,
  resolveAuthFileDisplayName,
} from "@/modules/auth-files/helpers/authFilesPageUtils";

const MAX_CUSTOM_TAGS = 3;

export function AuthFileTagsModal({
  open,
  file,
  saving,
  onClose,
  onSave,
}: {
  open: boolean;
  file: AuthFileItem | null;
  saving?: boolean;
  onClose: () => void;
  onSave: (file: AuthFileItem, customTags: string[], hiddenDefaultTags: string[]) => Promise<boolean>;
}) {
  const { t } = useTranslation();
  const [customTagInput, setCustomTagInput] = useState("");
  const [customTags, setCustomTags] = useState<string[]>([]);
  const [hiddenDefaultTags, setHiddenDefaultTags] = useState<string[]>([]);

  useEffect(() => {
    if (!open || !file) return;
    setCustomTagInput("");
    setCustomTags(readAuthFileCustomTags(file));
    setHiddenDefaultTags(readAuthFileHiddenDefaultTags(file));
  }, [file, open]);

  const defaultTags = useMemo(() => (file ? readAuthFileDefaultTags(file) : []), [file]);
  const hiddenTagSet = useMemo(() => new Set(hiddenDefaultTags), [hiddenDefaultTags]);
  const displayTags = useMemo(
    () => buildAuthFileDisplayTags(defaultTags, customTags, hiddenDefaultTags),
    [customTags, defaultTags, hiddenDefaultTags],
  );

  const normalizedCustomTagInput = normalizeTagValue(customTagInput);
  const canAddCustomTag =
    normalizedCustomTagInput.length > 0 &&
    customTags.length < MAX_CUSTOM_TAGS &&
    !customTags.includes(normalizedCustomTagInput);

  const handleAddCustomTag = () => {
    if (!canAddCustomTag) return;
    setCustomTags((prev) => [...prev, normalizedCustomTagInput]);
    setCustomTagInput("");
  };

  const handleSave = async () => {
    if (!file) return;
    const saved = await onSave(file, customTags, hiddenDefaultTags);
    if (saved) onClose();
  };

  return (
    <Modal
      open={open}
      title={t("auth_files.tags_modal_title")}
      description={file ? resolveAuthFileDisplayName(file) || file.name : undefined}
      onClose={onClose}
      maxWidth="max-w-2xl"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            {t("common.cancel")}
          </Button>
          <Button variant="primary" onClick={() => void handleSave()} disabled={saving || !file}>
            {t("common.save")}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <label className="text-sm font-semibold text-slate-900 dark:text-white">
              {t("auth_files.custom_tag_label")}
            </label>
            <span className="text-xs text-slate-500 dark:text-white/55">
              {t("auth_files.custom_tag_limit", { count: MAX_CUSTOM_TAGS })}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <TextInput
              value={customTagInput}
              onChange={(event) => setCustomTagInput(event.currentTarget.value)}
              onKeyDown={(event) => {
                if (event.key !== "Enter") return;
                event.preventDefault();
                handleAddCustomTag();
              }}
              placeholder={t("auth_files.custom_tag_placeholder")}
              aria-label={t("auth_files.custom_tag_label")}
              disabled={saving}
            />
            <Button
              variant="secondary"
              onClick={handleAddCustomTag}
              disabled={saving || !canAddCustomTag}
            >
              {t("auth_files.custom_tag_add")}
            </Button>
          </div>

          {customTags.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {customTags.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-700 dark:border-neutral-700/70 dark:bg-neutral-900 dark:text-white/80"
                >
                  <span>{tag}</span>
                  <button
                    type="button"
                    onClick={() => setCustomTags((prev) => prev.filter((entry) => entry !== tag))}
                    aria-label={t("auth_files.remove_custom_tag", { tag })}
                    className="rounded-full p-0.5 text-slate-400 transition-colors hover:bg-slate-200 hover:text-slate-700 dark:text-white/40 dark:hover:bg-white/10 dark:hover:text-white/80"
                    disabled={saving}
                  >
                    <X size={12} />
                  </button>
                </span>
              ))}
            </div>
          ) : (
            <p className="text-xs text-slate-500 dark:text-white/55">{t("auth_files.no_tags")}</p>
          )}
        </div>

        <div className="space-y-2">
          <div className="text-sm font-semibold text-slate-900 dark:text-white">
            {t("auth_files.default_tags_label")}
          </div>
          {defaultTags.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {defaultTags.map((tag) => {
                const hidden = hiddenTagSet.has(tag);
                return (
                  <Button
                    key={tag}
                    variant={hidden ? "secondary" : "ghost"}
                    size="sm"
                    onClick={() =>
                      setHiddenDefaultTags((prev) =>
                        prev.includes(tag) ? prev.filter((entry) => entry !== tag) : [...prev, tag],
                      )
                    }
                    disabled={saving}
                    className={[
                      "!h-auto rounded-full px-3 py-1 text-xs",
                      hidden
                        ? "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-500/25 dark:bg-amber-500/10 dark:text-amber-200"
                        : "border-slate-200 bg-white text-slate-700 dark:border-neutral-700/70 dark:bg-neutral-900 dark:text-white/80",
                    ].join(" ")}
                  >
                    {hidden
                      ? t("auth_files.restore_tag", { tag })
                      : t("auth_files.hide_tag", { tag })}
                  </Button>
                );
              })}
            </div>
          ) : (
            <p className="text-xs text-slate-500 dark:text-white/55">{t("auth_files.no_tags")}</p>
          )}
        </div>

        <div className="space-y-2">
          <div className="text-sm font-semibold text-slate-900 dark:text-white">
            {t("auth_files.display_tags_label")}
          </div>
          {displayTags.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {displayTags.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center rounded-full bg-sky-50 px-2.5 py-1 text-xs font-semibold text-sky-700 dark:bg-sky-500/15 dark:text-sky-200"
                >
                  {tag}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-xs text-slate-500 dark:text-white/55">{t("auth_files.no_tags")}</p>
          )}
        </div>
      </div>
    </Modal>
  );
}
