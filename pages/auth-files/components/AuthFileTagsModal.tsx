import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { AuthFileItem } from "@code-proxy/api-client";
import { Button } from "@code-proxy/ui";
import { Checkbox } from "@code-proxy/ui";
import { Fieldset } from "@code-proxy/ui";
import { TextInput } from "@code-proxy/ui";
import { Modal } from "@code-proxy/ui";
import {
  normalizeTagValue,
  readAuthFileCustomTags,
  readAuthFileDefaultTags,
  readAuthFileTagCandidates,
  resolveAuthFileDisplayTags,
  resolveAuthFileDisplayName,
} from "@code-proxy/domain";

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
  onSave: (file: AuthFileItem, customTags: string[], displayTags: string[]) => Promise<boolean>;
}) {
  const { t } = useTranslation();
  const [customTagInput, setCustomTagInput] = useState("");
  const [customTags, setCustomTags] = useState<string[]>([]);
  const [selectedDisplayTags, setSelectedDisplayTags] = useState<string[]>([]);

  useEffect(() => {
    if (!open || !file) return;
    setCustomTagInput("");
    setCustomTags(readAuthFileCustomTags(file));
    setSelectedDisplayTags(resolveAuthFileDisplayTags(file));
  }, [file, open]);

  const defaultTags = useMemo(() => (file ? readAuthFileDefaultTags(file) : []), [file]);
  const tagOptions = useMemo(
    () =>
      file
        ? readAuthFileTagCandidates({
            ...file,
            custom_tags: customTags,
            display_tags: selectedDisplayTags,
          })
        : [],
    [customTags, file, selectedDisplayTags],
  );
  const selectedTagSet = useMemo(() => new Set(selectedDisplayTags), [selectedDisplayTags]);

  const normalizedCustomTagInput = normalizeTagValue(customTagInput);
  const canAddCustomTag =
    normalizedCustomTagInput.length > 0 &&
    customTags.length < MAX_CUSTOM_TAGS &&
    !customTags.includes(normalizedCustomTagInput);

  const handleAddCustomTag = () => {
    if (!canAddCustomTag) return;
    setCustomTags((prev) => [...prev, normalizedCustomTagInput]);
    setSelectedDisplayTags((prev) =>
      prev.includes(normalizedCustomTagInput) ? prev : [...prev, normalizedCustomTagInput],
    );
    setCustomTagInput("");
  };

  const handleRemoveCustomTag = (tag: string) => {
    setCustomTags((prev) => prev.filter((entry) => entry !== tag));
    setSelectedDisplayTags((prev) => prev.filter((entry) => entry !== tag));
  };

  const handleToggleDisplayTag = (tag: string, checked: boolean) => {
    setSelectedDisplayTags((prev) => {
      if (checked) return prev.includes(tag) ? prev : [...prev, tag];
      return prev.filter((entry) => entry !== tag);
    });
  };

  const handleSave = async () => {
    if (!file) return;
    const optionSet = new Set(tagOptions);
    const displayTags = selectedDisplayTags.filter((tag) => optionSet.has(tag));
    const saved = await onSave(file, customTags, displayTags);
    if (saved) onClose();
  };

  return (
    <Modal
      open={open}
      title={t("auth_files.tags_modal_title")}
      description={file ? resolveAuthFileDisplayName(file) || file.name : undefined}
      onClose={onClose}
      maxWidth="max-w-2xl"
    >
      <form
        className="space-y-7"
        onSubmit={(event) => {
          event.preventDefault();
          void handleSave();
        }}
      >
        <Fieldset disabled={saving}>
          <Fieldset.Legend
            description={t("auth_files.custom_tag_limit", { count: MAX_CUSTOM_TAGS })}
          >
            {t("auth_files.custom_tag_label")}
          </Fieldset.Legend>
          <Fieldset.Group>
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
                variant="default"
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
                    className="inline-flex items-center gap-1.5 rounded-full bg-[#EBEBEC] px-2.5 py-1 text-xs font-medium text-[#3F3F46] dark:bg-[#27272A] dark:text-[#D4D4D8]"
                  >
                    <span>{tag}</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveCustomTag(tag)}
                      aria-label={t("auth_files.remove_custom_tag", { tag })}
                      className="rounded-full p-0.5 text-[#71717A] transition-colors hover:bg-black/[0.06] hover:text-[#18181B] disabled:cursor-not-allowed disabled:opacity-50 dark:text-[#A1A1AA] dark:hover:bg-white/10 dark:hover:text-white"
                      disabled={saving}
                    >
                      <X size={12} />
                    </button>
                  </span>
                ))}
              </div>
            ) : (
              <Fieldset.Description className="text-xs">
                {t("auth_files.no_tags")}
              </Fieldset.Description>
            )}
          </Fieldset.Group>
        </Fieldset>

        <Fieldset disabled={saving}>
          <Fieldset.Legend>{t("auth_files.display_tags_label")}</Fieldset.Legend>
          <Fieldset.Group>
            {tagOptions.length > 0 ? (
              <div className="grid gap-2 sm:grid-cols-2">
                {tagOptions.map((tag) => {
                  const checked = selectedTagSet.has(tag);
                  const custom = customTags.includes(tag);
                  const inherited = defaultTags.includes(tag);
                  return (
                    <label
                      key={tag}
                      className="flex cursor-pointer items-center justify-between gap-3 rounded-2xl bg-white px-3 py-2 text-sm text-[#18181B] shadow-[2px_2px_6px_rgb(0_0_0_/_0.055)] transition-colors hover:bg-[#FAFAFA] dark:bg-[#27272A] dark:text-white dark:shadow-[0_8px_24px_rgb(0_0_0_/_0.24)] dark:hover:bg-[#303036]"
                    >
                      <span className="min-w-0 truncate font-medium">{tag}</span>
                      <span className="flex shrink-0 items-center gap-2">
                        {custom ? (
                          <span className="rounded-full bg-sky-50 px-2 py-0.5 text-[10px] font-semibold text-sky-700 dark:bg-sky-500/15 dark:text-sky-200">
                            {t("auth_files.custom_tag_label")}
                          </span>
                        ) : inherited ? (
                          <span className="rounded-full bg-[#EBEBEC] px-2 py-0.5 text-[10px] font-semibold text-[#71717A] dark:bg-white/10 dark:text-white/60">
                            {t("auth_files.default_tags_label")}
                          </span>
                        ) : null}
                        <Checkbox
                          checked={checked}
                          onCheckedChange={(next) => handleToggleDisplayTag(tag, next)}
                          aria-label={tag}
                          disabled={saving}
                        />
                      </span>
                    </label>
                  );
                })}
              </div>
            ) : (
              <Fieldset.Description className="text-xs">
                {t("auth_files.no_tags")}
              </Fieldset.Description>
            )}
          </Fieldset.Group>
          <Fieldset.Actions className="justify-end">
            <Button variant="default" onClick={onClose} disabled={saving}>
              {t("common.cancel")}
            </Button>
            <Button type="submit" variant="primary" disabled={saving || !file}>
              {t("common.save")}
            </Button>
          </Fieldset.Actions>
        </Fieldset>
      </form>
    </Modal>
  );
}
