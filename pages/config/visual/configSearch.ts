import {
  CONFIG_FIELDS,
  CONFIG_SECTIONS,
  type ConfigFieldDef,
  type ConfigSectionId,
} from "./configSchema";

type Translate = (key: string) => string;

export function fieldLabelKey(field: ConfigFieldDef) {
  return field.labelKey ?? `config_ui.fields.${field.id}.label`;
}

export function fieldDescriptionKey(field: ConfigFieldDef) {
  return field.descriptionKey ?? `config_ui.fields.${field.id}.desc`;
}

export interface ConfigSearchResult {
  /** null 表示没有在搜索：全部显示。 */
  fields: Set<string> | null;
  sections: Set<ConfigSectionId> | null;
}

const normalize = (value: string) => value.toLowerCase().replace(/[\s_\-.]+/g, " ").trim();

/**
 * 设置搜索：名称、说明、YAML 键、分区标题都算。多个词之间是「且」——
 * 「日志 上限」能直接找到「文件日志总上限」，而不是把所有带「日志」的项都列出来。
 * 命中分区标题时整个分区都显示（找「流式」就看到流式传输的全部设置）。
 */
export function searchConfig(query: string, t: Translate): ConfigSearchResult {
  const tokens = normalize(query).split(" ").filter(Boolean);
  if (tokens.length === 0) return { fields: null, sections: null };
  const matches = (haystack: string) => {
    const text = normalize(haystack);
    return tokens.every((token) => text.includes(token));
  };

  const fields = new Set<string>();
  const sections = new Set<ConfigSectionId>();
  for (const section of CONFIG_SECTIONS) {
    const sectionText = [
      t(`config_ui.sections.${section.id}.title`),
      t(`config_ui.sections.${section.id}.desc`),
      ...(section.keywords ?? []),
    ].join(" ");
    const sectionHit = matches(sectionText);
    const sectionFields = CONFIG_FIELDS.filter((field) => field.section === section.id);
    for (const field of sectionFields) {
      const fieldText = [
        t(fieldLabelKey(field)),
        t(fieldDescriptionKey(field)),
        field.yamlKey,
        field.id,
        sectionText,
      ].join(" ");
      if (sectionHit || matches(fieldText)) fields.add(field.id);
    }
    if (sectionHit || sectionFields.some((field) => fields.has(field.id))) {
      sections.add(section.id);
    }
  }
  return { fields, sections };
}
