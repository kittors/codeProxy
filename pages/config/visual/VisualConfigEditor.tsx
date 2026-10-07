import { useCallback, useDeferredValue, useMemo, useRef, useState, type ReactNode } from "react";
import { Search, SearchX, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { VisualConfigValues } from "@features/visual-config-editor";
import {
  Callout,
  DialogIcon,
  NavList,
  SettingGroup,
  TextInput,
  type NavListGroup,
} from "@code-proxy/ui";
import { ConfigFieldRow } from "./ConfigFieldRow";
import {
  CONFIG_NAV_GROUPS,
  CONFIG_SECTIONS,
  collectModified,
  fieldsOfSection,
  type ConfigSectionDef,
  type ConfigSectionId,
} from "./configSchema";
import { searchConfig } from "./configSearch";
import { PayloadFilterRulesEditor, PayloadRulesEditor } from "./PayloadRuleEditors";
import { ResourceProfileBanner } from "./ResourceProfileBanner";
import { useSectionScrollSpy } from "./useSectionScrollSpy";

function ConfigSection({
  section,
  modifiedCount,
  children,
}: {
  section: ConfigSectionDef;
  modifiedCount: number;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const Icon = section.icon;
  const titleId = `config-section-${section.id}-title`;
  return (
    <section
      data-config-section={section.id}
      aria-labelledby={titleId}
      className="scroll-mt-4 space-y-3"
    >
      <header className="flex items-start gap-3 px-1">
        <DialogIcon size="sm">
          <Icon />
        </DialogIcon>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 id={titleId} className="text-base font-semibold tracking-tight text-ink">
              {t(`config_ui.sections.${section.id}.title`)}
            </h2>
            {modifiedCount > 0 ? (
              <span className="rounded-full bg-sky-500/10 px-2 py-px text-2xs font-medium text-sky-700 dark:text-sky-300">
                {t("config_ui.modified_count", { count: modifiedCount })}
              </span>
            ) : null}
          </div>
          <p className="mt-0.5 text-sm text-ink-3">{t(`config_ui.sections.${section.id}.desc`)}</p>
        </div>
      </header>
      {children}
    </section>
  );
}

/**
 * config.yaml 的可视化编辑：左侧分区目录（跟随滚动高亮、可搜索），右侧按分区排列的设置行。
 *
 * - 每一项说明常驻、YAML 键作为辅助信息；改过的项有圆点并可单独撤销；
 * - 目录里有改动的分区带圆点，保存前一眼知道改了哪几处；
 * - 搜索按名称 / 说明 / 键名过滤，命中项短暂高亮。
 * 保存、重新加载仍由页面底部的保存条统一处理。
 */
export function VisualConfigEditor({
  values,
  baseline,
  disabled,
  onChange,
  codexAdmission,
}: {
  values: VisualConfigValues;
  /** 加载时的值，用来标出「改过的项」；不传时视为没有改动。 */
  baseline?: VisualConfigValues;
  disabled?: boolean;
  onChange: (values: Partial<VisualConfigValues>) => void;
  /** 「Codex 客户端准入」分区的内容（它直接调用接口、立即生效，由页面注入）。 */
  codexAdmission?: ReactNode;
}) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const reference = baseline ?? values;

  const search = useMemo(() => searchConfig(deferredQuery, t), [deferredQuery, t]);
  const modified = useMemo(() => collectModified(values, reference), [reference, values]);

  const visibleSections = useMemo(
    () =>
      CONFIG_SECTIONS.filter((section) => {
        if (section.id === "codex" && !codexAdmission) return false;
        return search.sections ? search.sections.has(section.id) : true;
      }),
    [codexAdmission, search.sections],
  );
  const visibleIds = useMemo(() => visibleSections.map((section) => section.id), [visibleSections]);
  const { active, scrollTo } = useSectionScrollSpy<ConfigSectionId>(scrollRef, visibleIds);

  const modifiedCountOf = useCallback(
    (id: ConfigSectionId) => {
      if (id === "payload") return modified.payload.length;
      return fieldsOfSection(id).filter((field) => modified.fields.includes(field.id)).length;
    },
    [modified],
  );

  const navGroups = useMemo<NavListGroup[]>(
    () =>
      CONFIG_NAV_GROUPS.map((group) => ({
        id: group,
        label: t(`config_ui.groups.${group}`),
        items: visibleSections
          .filter((section) => section.group === group)
          .map((section) => {
            const Icon = section.icon;
            const dirty = modifiedCountOf(section.id) > 0;
            return {
              id: section.id,
              label: t(`config_ui.sections.${section.id}.title`),
              icon: <Icon />,
              dot: dirty,
              srHint: dirty ? t("config_ui.section_modified") : undefined,
            };
          }),
      })),
    [modifiedCountOf, t, visibleSections],
  );

  const searching = search.fields !== null;
  const renderSectionBody = (section: ConfigSectionDef) => {
    if (section.id === "payload") {
      return (
        <div className="space-y-3">
          <Callout tone="neutral">{t("config_ui.payload.hint")}</Callout>
          <PayloadRulesEditor
            title={t("config_ui.payload.default.title")}
            description={t("config_ui.payload.default.desc")}
            meta="payload.default"
            rules={values.payloadDefaultRules}
            disabled={disabled}
            onChange={(payloadDefaultRules) => onChange({ payloadDefaultRules })}
          />
          <PayloadRulesEditor
            title={t("config_ui.payload.override.title")}
            description={t("config_ui.payload.override.desc")}
            meta="payload.override"
            rules={values.payloadOverrideRules}
            disabled={disabled}
            onChange={(payloadOverrideRules) => onChange({ payloadOverrideRules })}
          />
          <PayloadFilterRulesEditor
            rules={values.payloadFilterRules}
            disabled={disabled}
            onChange={(payloadFilterRules) => onChange({ payloadFilterRules })}
          />
        </div>
      );
    }
    if (section.id === "codex") return codexAdmission;
    const fields = fieldsOfSection(section.id).filter(
      (field) => !search.fields || search.fields.has(field.id),
    );
    return (
      <SettingGroup>
        {fields.map((field) => (
          <ConfigFieldRow
            key={field.id}
            field={field}
            values={values}
            baseline={reference}
            disabled={disabled}
            onChange={onChange}
          />
        ))}
      </SettingGroup>
    );
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 lg:flex-row lg:gap-8">
      {/* 不用 <aside>：外壳的侧边栏就是页面里唯一的 aside，测试与读屏的「地标」都按它定位；
          这里的目录本身已经是 role=navigation。 */}
      <div data-nav-scroll="" className="flex shrink-0 flex-col gap-3 lg:w-56 lg:overflow-y-auto">
        <TextInput
          value={query}
          onChange={(event) => setQuery(event.currentTarget.value)}
          placeholder={t("config_ui.search_placeholder")}
          aria-label={t("config_ui.search_label")}
          startAdornment={<Search size={15} className="text-ink-3" aria-hidden="true" />}
          endAdornment={
            query ? (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label={t("config_ui.search_clear")}
                className="inline-flex h-6 w-6 items-center justify-center rounded-full text-ink-3 transition-colors hover:bg-hover hover:text-ink"
              >
                <X size={14} aria-hidden="true" />
              </button>
            ) : undefined
          }
          onKeyDown={(event) => {
            if (event.key === "Escape" && query) {
              // 只清空搜索，别让外层把这次 Esc 当成别的操作。
              event.preventDefault();
              setQuery("");
            }
          }}
        />
        <NavList
          mode="nav"
          breakpoint="lg"
          ariaLabel={t("config_ui.nav_label")}
          groups={navGroups}
          value={active ?? visibleIds[0] ?? "server"}
          onChange={(id) => scrollTo(id as ConfigSectionId)}
          idPrefix="config-nav"
        />
      </div>

      <div
        ref={scrollRef}
        data-testid="config-visual-scroll"
        className="min-h-0 flex-1 space-y-8 overflow-y-auto pr-1 pb-28"
      >
        {searching ? null : (
          <ResourceProfileBanner values={values} disabled={disabled} onChange={onChange} />
        )}
        {visibleSections.length === 0 ? (
          <div className="grid place-items-center rounded-2xl border border-dashed border-line px-6 py-16 text-center">
            <SearchX size={22} className="text-ink-3" aria-hidden="true" />
            <p className="mt-3 text-sm font-medium text-ink">
              {t("config_ui.search_empty_title", { query: deferredQuery.trim() })}
            </p>
            <p className="mt-1 text-xs text-ink-3">{t("config_ui.search_empty_desc")}</p>
          </div>
        ) : (
          visibleSections.map((section) => (
            <ConfigSection
              key={section.id}
              section={section}
              modifiedCount={modifiedCountOf(section.id)}
            >
              {renderSectionBody(section)}
            </ConfigSection>
          ))
        )}
      </div>
    </div>
  );
}
