import { useEffect, useMemo, useState } from "react";
import { Eye, Plus, Tags, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { AuthFileItem } from "@code-proxy/api-client";
import { Button, Checkbox, FormSection, Modal, TextInput } from "@code-proxy/ui";
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

  const formId = "auth-file-tags-form";
  const fileName = file ? resolveAuthFileDisplayName(file) || file.name : "";

  return (
    <Modal
      open={open}
      title={t("auth_files.tags_modal_title")}
      description={fileName ? t("auth_files.tags_modal_desc", { name: fileName }) : undefined}
      icon={<Tags />}
      size="lg"
      onClose={onClose}
      footerStart={
        // 预览：保存后列表 / 卡片里会显示成这样，勾选时实时变化。
        selectedDisplayTags.length ? (
          <span className="flex min-w-0 flex-wrap items-center gap-1.5">
            <span className="shrink-0">{t("auth_files.tags_preview")}</span>
            {selectedDisplayTags.map((tag) => (
              <span
                key={tag}
                className="rounded-full bg-selected px-2 py-0.5 text-2xs font-medium text-ink-2"
              >
                {tag}
              </span>
            ))}
          </span>
        ) : (
          t("auth_files.tags_preview_empty")
        )
      }
      footer={
        <>
          <Button variant="default" onClick={onClose} disabled={saving}>
            {t("common.cancel")}
          </Button>
          <Button type="submit" form={formId} variant="primary" disabled={!file} loading={saving}>
            {t("common.save")}
          </Button>
        </>
      }
    >
      <form
        id={formId}
        className="space-y-6"
        onSubmit={(event) => {
          event.preventDefault();
          void handleSave();
        }}
      >
        <FormSection
          title={t("auth_files.custom_tags_section")}
          description={t("auth_files.custom_tag_limit", { count: MAX_CUSTOM_TAGS })}
          icon={<Plus />}
        >
          <div className="flex items-center gap-2">
            <TextInput
              value={customTagInput}
              onChange={(event) => setCustomTagInput(event.currentTarget.value)}
              onKeyDown={(event) => {
                if (event.key !== "Enter") return;
                // 回车是「加这个标签」，不是保存整个弹窗。
                event.preventDefault();
                handleAddCustomTag();
              }}
              placeholder={t("auth_files.custom_tag_placeholder")}
              aria-label={t("auth_files.custom_tag_label")}
              disabled={saving || customTags.length >= MAX_CUSTOM_TAGS}
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
                  className="inline-flex items-center gap-1 rounded-full bg-ink/[0.05] py-1 pr-1 pl-2.5 text-xs font-medium text-ink dark:bg-white/[0.07]"
                >
                  <span>{tag}</span>
                  <button
                    type="button"
                    onClick={() => handleRemoveCustomTag(tag)}
                    aria-label={t("auth_files.remove_custom_tag", { tag })}
                    className="rounded-full p-0.5 text-ink-3 transition-colors hover:bg-hover hover:text-ink disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={saving}
                  >
                    <X size={12} />
                  </button>
                </span>
              ))}
            </div>
          ) : (
            <p className="text-xs text-ink-3">{t("auth_files.no_custom_tags")}</p>
          )}
        </FormSection>

        <FormSection
          title={t("auth_files.display_tags_label")}
          description={t("auth_files.display_tags_desc")}
          icon={<Eye />}
        >
          {tagOptions.length > 0 ? (
            <div className="grid gap-2 sm:grid-cols-2">
              {tagOptions.map((tag) => {
                const checked = selectedTagSet.has(tag);
                const custom = customTags.includes(tag);
                const inherited = defaultTags.includes(tag);
                return (
                  <label
                    key={tag}
                    // 不描边：未选是淡底，选中换成强调色淡底（勾选框本身也是强调色）。
                    className={[
                      "flex cursor-pointer items-center justify-between gap-3 rounded-2xl px-3.5 py-2.5 text-sm transition-colors",
                      checked ? "bg-accent-soft text-ink" : "bg-subtle text-ink-2 hover:bg-hover",
                    ].join(" ")}
                  >
                    <span className="flex min-w-0 items-center gap-2.5">
                      <Checkbox
                        checked={checked}
                        onCheckedChange={(next) => handleToggleDisplayTag(tag, next)}
                        aria-label={tag}
                        disabled={saving}
                      />
                      <span className="min-w-0 truncate font-medium">{tag}</span>
                    </span>
                    {custom ? (
                      <span className="shrink-0 rounded-full bg-ink/[0.05] px-2 py-0.5 text-2xs font-medium text-ink-2 dark:bg-white/[0.07] colorful:bg-sky-500/10 colorful:text-sky-700 colorful:dark:text-sky-300">
                        {t("auth_files.custom_tag_label")}
                      </span>
                    ) : inherited ? (
                      <span className="shrink-0 rounded-full bg-ink/[0.05] px-2 py-0.5 text-2xs font-medium text-ink-3 dark:bg-white/[0.07]">
                        {t("auth_files.default_tags_label")}
                      </span>
                    ) : null}
                  </label>
                );
              })}
            </div>
          ) : (
            <p className="text-xs text-ink-3">{t("auth_files.no_tags")}</p>
          )}
        </FormSection>
      </form>
    </Modal>
  );
}
