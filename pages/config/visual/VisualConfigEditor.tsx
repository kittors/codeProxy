import {
  useCallback,
  useDeferredValue,
  useEffect,
  useId,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { Search, SearchX, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { VisualConfigValues } from "@features/visual-config-editor";
import { Callout, DialogIcon, HUE_GLYPH, SettingGroup, TextInput, useScrollFade } from "@code-proxy/ui";
import { ConfigFieldRow } from "./ConfigFieldRow";
import { ConfigGroupTabs, ConfigSectionChips, type ConfigGroupTab } from "./ConfigNavBar";
import {
  CONFIG_GROUPS,
  CONFIG_SECTIONS,
  collectModified,
  fieldsOfSection,
  type ConfigNavGroupId,
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
      {/* 分区标题：图标 + 名称 + 说明。图标着色多彩时图标垫一块分区色相的图标块，单色时只是
          中性的线性图标（标题下面的设置组才是卡片）。 */}
      <header className="flex items-start gap-2.5 px-1 icon-hue:gap-3">
        <DialogIcon size="sm" tone={section.hue} className="hidden icon-hue:grid">
          <Icon />
        </DialogIcon>
        <Icon size={18} className="mt-0.5 shrink-0 text-ink-3 icon-hue:hidden" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 id={titleId} className="text-base font-semibold tracking-tight text-ink">
              {t(`config_ui.sections.${section.id}.title`)}
            </h2>
            {modifiedCount > 0 ? (
              <span className="rounded-full bg-accent-soft px-2 py-px text-2xs font-medium text-accent-ink colorful:bg-sky-500/10 colorful:text-sky-700 colorful:dark:text-sky-300">
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
 * config.yaml 的可视化编辑：上方是分组页签 + 搜索，下面一行是当前分组的分区胶囊，
 * 再往下是这一组的分区。
 *
 * - 以前分区目录竖在页面左侧，和外壳的侧边栏并排成两层纵向菜单；现在分组横向排在上方，
 *   一次只看一组（3–5 个分区），不用在一整页长滚动里找；
 * - 每个分区一个色相（configSchema）：多彩时胶囊、分区标题的图标块、选中态都用它；
 *   简约 / 单色时都是中性的线性图标，选中与「改过」只用强调色表达；
 * - 每一项说明常驻、YAML 键作为辅助信息；改过的项有圆点并可单独撤销，有改动的分区与分组带圆点；
 * - 搜索跨分组：按名称 / 说明 / 键名过滤，结果按分组排开，页签上显示各组命中数；
 * - 内容区上下渐隐，滚动时不会被页签条和保存条硬生生截断。
 * 保存、重新加载仍由页面底部的保存条统一处理。
 */
export function VisualConfigEditor({
  values,
  baseline,
  disabled,
  onChange,
  codexAdmission,
  toolbarEnd,
}: {
  values: VisualConfigValues;
  /** 加载时的值，用来标出「改过的项」；不传时视为没有改动。 */
  baseline?: VisualConfigValues;
  disabled?: boolean;
  onChange: (values: Partial<VisualConfigValues>) => void;
  /** 「Codex 客户端准入」分区的内容（它直接调用接口、立即生效，由页面注入）。 */
  codexAdmission?: ReactNode;
  /** 工具栏最右侧的附加控件（页面把「可视化 / 源码」切换放在这里，省掉单独一行）。 */
  toolbarEnd?: ReactNode;
}) {
  const { t } = useTranslation();
  const idPrefix = useId().replace(/:/g, "");
  const panelId = `${idPrefix}-panel`;
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState<ConfigNavGroupId>("basics");
  const deferredQuery = useDeferredValue(query);
  const reference = baseline ?? values;
  const fade = useScrollFade<HTMLDivElement>({ size: 36 });

  const search = useMemo(() => searchConfig(deferredQuery, t), [deferredQuery, t]);
  const modified = useMemo(() => collectModified(values, reference), [reference, values]);
  const searching = search.fields !== null;

  const availableSections = useMemo(
    () => CONFIG_SECTIONS.filter((section) => section.id !== "codex" || Boolean(codexAdmission)),
    [codexAdmission],
  );
  const visibleSections = useMemo(
    () =>
      availableSections.filter((section) =>
        searching ? Boolean(search.sections?.has(section.id)) : section.group === group,
      ),
    [availableSections, group, search.sections, searching],
  );
  const visibleIds = useMemo(() => visibleSections.map((section) => section.id), [visibleSections]);
  const { active, scrollTo } = useSectionScrollSpy<ConfigSectionId>(fade.ref, visibleIds);

  // 换组（或开始 / 结束搜索）时内容整体替换：回到顶部，渐隐重新量一次。
  const { measure } = fade;
  useEffect(() => {
    const node = fade.ref.current;
    if (node) node.scrollTop = 0;
    measure();
  }, [fade.ref, group, measure, searching]);

  const modifiedCountOf = useCallback(
    (id: ConfigSectionId) => {
      if (id === "payload") return modified.payload.length;
      return fieldsOfSection(id).filter((field) => modified.fields.includes(field.id)).length;
    },
    [modified],
  );

  const groupTabs = useMemo<ConfigGroupTab[]>(
    () =>
      CONFIG_GROUPS.map((def) => {
        const sections = availableSections.filter((section) => section.group === def.id);
        return {
          def,
          modified: sections.reduce((sum, section) => sum + modifiedCountOf(section.id), 0),
          matches: searching
            ? sections.filter((section) => search.sections?.has(section.id)).length
            : null,
        };
      }),
    [availableSections, modifiedCountOf, search.sections, searching],
  );

  const selectGroup = (next: ConfigNavGroupId) => {
    // 搜索时点分组：结束搜索、打开这一组——用户已经从命中数里看到想去哪了。
    if (query) setQuery("");
    setGroup(next);
  };

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

  const renderSections = (sections: readonly ConfigSectionDef[]) =>
    sections.map((section) => (
      <ConfigSection key={section.id} section={section} modifiedCount={modifiedCountOf(section.id)}>
        {renderSectionBody(section)}
      </ConfigSection>
    ));

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="flex shrink-0 flex-col gap-3">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <ConfigGroupTabs
            tabs={groupTabs}
            value={searching ? null : group}
            panelId={panelId}
            idPrefix={idPrefix}
            onChange={selectGroup}
          />
          <div className="ml-auto flex min-w-0 flex-1 items-center justify-end gap-3 sm:flex-none">
            <TextInput
              value={query}
              onChange={(event) => setQuery(event.currentTarget.value)}
              placeholder={t("config_ui.search_placeholder")}
              aria-label={t("config_ui.search_label")}
              className="sm:w-64"
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
            {toolbarEnd}
          </div>
        </div>
        {searching ? null : (
          <ConfigSectionChips
            sections={visibleSections}
            active={active ?? visibleIds[0] ?? null}
            modifiedOf={modifiedCountOf}
            onSelect={scrollTo}
          />
        )}
      </div>

      <div
        ref={fade.ref}
        onScroll={fade.onScroll}
        style={fade.style}
        id={panelId}
        role="tabpanel"
        aria-labelledby={searching ? undefined : `${idPrefix}-tab-${group}`}
        aria-label={searching ? t("config_ui.search_results") : undefined}
        data-testid="config-visual-scroll"
        className={`min-h-0 flex-1 space-y-8 overflow-y-auto pt-2 pr-1 pb-28 ${fade.className}`}
      >
        {/* 推荐档位动的主要是日志、保留与监控：在打开页面看到的「基础」和「日志与数据」两组都放一份。 */}
        {!searching && (group === "basics" || group === "data") ? (
          <ResourceProfileBanner values={values} disabled={disabled} onChange={onChange} />
        ) : null}
        {visibleSections.length === 0 ? (
          <div className="grid place-items-center rounded-2xl bg-subtle px-6 py-16 text-center">
            <SearchX size={22} className="text-ink-3 icon-hue:text-sky-500" aria-hidden="true" />
            <p className="mt-3 text-sm font-medium text-ink">
              {t("config_ui.search_empty_title", { query: deferredQuery.trim() })}
            </p>
            <p className="mt-1 text-xs text-ink-3">{t("config_ui.search_empty_desc")}</p>
          </div>
        ) : searching ? (
          // 搜索结果按分组排开，每组前一个小标题，知道命中的设置在哪一组里。
          CONFIG_GROUPS.map((def) => {
            const sections = visibleSections.filter((section) => section.group === def.id);
            if (sections.length === 0) return null;
            const GroupIcon = def.icon;
            return (
              <div key={def.id} className="space-y-6">
                <p className="flex items-center gap-1.5 px-1 text-xs font-semibold text-ink-3">
                  <GroupIcon size={13} aria-hidden="true" className={HUE_GLYPH[def.hue]} />
                  {t(`config_ui.groups.${def.id}`)}
                </p>
                {renderSections(sections)}
              </div>
            );
          })
        ) : (
          renderSections(visibleSections)
        )}
      </div>
    </div>
  );
}
