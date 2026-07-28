/**
 * Release notes on this project are published as one document containing several
 * language sections. This picks the section matching the active UI language and
 * falls back through the others, so a user never sees release notes in a language
 * they did not ask for just because their own section was omitted.
 */
type ReleaseNotesLocale = "zh-CN" | "en" | "ru";

const RELEASE_NOTES_LOCALE_FALLBACKS: Record<ReleaseNotesLocale, ReleaseNotesLocale[]> = {
  "zh-CN": ["zh-CN", "en", "ru"],
  en: ["en", "zh-CN", "ru"],
  ru: ["ru", "en", "zh-CN"],
};

const resolveReleaseNotesLocale = (language?: string): ReleaseNotesLocale => {
  const normalized = language?.trim().toLowerCase() ?? "";
  if (normalized.startsWith("zh")) return "zh-CN";
  if (normalized.startsWith("ru")) return "ru";
  return "en";
};

const normalizeReleaseNotesMarker = (line: string) =>
  line
    .trim()
    .replace(/^#{1,6}\s+/, "")
    .replace(/^\*\*(.+)\*\*$/, "$1")
    .replace(/^__(.+)__$/, "$1")
    .replace(/[:：]$/, "")
    .trim()
    .toLowerCase();

const releaseNotesMarkerLocale = (line: string): ReleaseNotesLocale | null => {
  const marker = normalizeReleaseNotesMarker(line);
  if (["中文", "简体中文", "chinese", "zh", "zh-cn"].includes(marker)) return "zh-CN";
  if (["english", "英文", "en", "en-us"].includes(marker)) return "en";
  if (["русский", "russian", "ru", "ru-ru"].includes(marker)) return "ru";
  return null;
};

const trimBlankReleaseNoteLines = (lines: string[]) => {
  let start = 0;
  let end = lines.length;
  while (start < end && lines[start].trim() === "") start += 1;
  while (end > start && lines[end - 1].trim() === "") end -= 1;
  return lines.slice(start, end);
};

const localizeBilingualReleaseNoteLine = (line: string, locale: ReleaseNotesLocale) => {
  const parts = line.split(/\s+[/／]\s+/);
  if (parts.length < 2) return line;
  if (locale === "zh-CN") return parts[0];

  const left = parts[0];
  const right = parts.slice(1).join(" / ").trimStart();
  const prefixMatch = left.match(
    /^(\s*(?:#{1,6}\s*)?(?:[-*+]\s*)?(?:v?\d[\w.+-]*(?:\s*[-:]\s*)?)?)(.*)$/i,
  );
  return `${prefixMatch?.[1] ?? ""}${right}`;
};

export const selectLocalizedReleaseNotes = (text: string, language?: string) => {
  const trimmed = text.trim();
  if (!trimmed) return "";

  const lines = trimmed.split(/\r?\n/);
  const preamble: string[] = [];
  const sections: Array<{ locale: ReleaseNotesLocale; lines: string[] }> = [];
  let currentSection: { locale: ReleaseNotesLocale; lines: string[] } | null = null;

  lines.forEach((line) => {
    const locale = releaseNotesMarkerLocale(line);
    if (locale) {
      currentSection = { locale, lines: [] };
      sections.push(currentSection);
      return;
    }
    if (currentSection) {
      currentSection.lines.push(line);
      return;
    }
    preamble.push(line);
  });

  if (sections.length === 0) return trimmed;

  const requestedLocale = resolveReleaseNotesLocale(language);
  const selectedSection =
    RELEASE_NOTES_LOCALE_FALLBACKS[requestedLocale]
      .map((locale) => sections.find((section) => section.locale === locale))
      .find((section): section is { locale: ReleaseNotesLocale; lines: string[] } =>
        Boolean(section),
      ) ?? sections[0];
  const localizedPreamble = trimBlankReleaseNoteLines(preamble)
    .map((line) => localizeBilingualReleaseNoteLine(line, selectedSection.locale))
    .join("\n")
    .trim();
  const localizedBody = trimBlankReleaseNoteLines(selectedSection.lines).join("\n").trim();

  return [localizedPreamble, localizedBody].filter(Boolean).join("\n\n").trim();
};
