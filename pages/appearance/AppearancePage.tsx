import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { RotateCcw } from "lucide-react";
import {
  BAR_THICKNESS_RANGE,
  Button,
  DEFAULT_APPEARANCE,
  DEFAULT_STATUS_HEX,
  SegmentedControl,
  SettingGroup,
  SettingRow,
  STYLE_PRESETS,
  TEXT_SCALE_RANGE,
  ToggleSwitch,
  UI_SCALE_RANGE,
  WEIGHT_SHIFTS,
  useAppearance,
  useTheme,
  type AppearanceSettings,
  type StatusRole,
  type ThemePreference,
} from "@code-proxy/ui";
import { AccentPicker, RangeControl, StatusColorInput } from "./AppearanceControls";
import { AppearancePreview } from "./AppearancePreview";
import { StylePresetCards } from "./StylePresetCards";

/*
 * 系统设置 → 外观。设置只存在当前浏览器（theme/appearance.ts），每一项改动立即生效：
 * 全站的颜色、粗细和字号都读 <html> 上的开关与变量，这一页右侧的预览、左侧导航和页面本身
 * 一起变。「撤销」回到当前风格预设里的值（配色项）或默认值（尺寸项）。
 */

const STATUS_ROLES: readonly StatusRole[] = ["success", "warning", "danger"];

const WEIGHT_KEYS: Record<(typeof WEIGHT_SHIFTS)[number], string> = {
  [-100]: "appearance.weight_light",
  0: "appearance.weight_regular",
  50: "appearance.weight_medium",
  100: "appearance.weight_bold",
};

const percent = (value: number) => `${Math.round(value * 100)}%`;

/** 平台默认的界面缩放（与 styles/index.css 的 --ui-scale 一致）。 */
const platformScale = () =>
  typeof document !== "undefined" && document.documentElement.dataset.os === "windows" ? 1 : 0.9;

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div>
        <h3 className="text-base font-semibold text-ink">{title}</h3>
        {description ? <p className="mt-0.5 text-sm text-ink-3">{description}</p> : null}
      </div>
      {children}
    </section>
  );
}

export function AppearancePage() {
  const { t } = useTranslation();
  const { settings, preset, update, applyPreset, reset } = useAppearance();
  const {
    state: { preference },
    actions: { setMode },
  } = useTheme();
  // 配色项的「撤销」回到当前风格预设的值；自定义状态下没有可回的预设，回到默认（多彩）。
  const base = STYLE_PRESETS[preset === "custom" ? "colorful" : preset];
  const isDefault = JSON.stringify(settings) === JSON.stringify(DEFAULT_APPEARANCE);
  const setStatus = (role: StatusRole, hex: string | null) =>
    update({ status: { ...settings.status, [role]: hex } });
  const choice = <K extends keyof AppearanceSettings>(key: K) => ({
    value: settings[key],
    onChange: (value: AppearanceSettings[K]) =>
      update({ [key]: value } as Partial<AppearanceSettings>),
  });

  return (
    <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_22rem] xl:items-start">
      <div className="min-w-0 space-y-8">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-2xl font-semibold tracking-tight text-ink">
              {t("appearance.title")}
            </h2>
            <p className="mt-1 max-w-3xl text-sm text-ink-2">{t("appearance.description")}</p>
          </div>
          <Button size="sm" onClick={reset} disabled={isDefault}>
            <RotateCcw size={15} />
            {t("appearance.reset")}
          </Button>
        </header>

        <Section
          title={t("appearance.style_title")}
          description={t("appearance.style_description")}
        >
          <StylePresetCards current={preset} onSelect={applyPreset} />
          {preset === "custom" ? (
            <p className="text-xs text-ink-3">{t("appearance.preset_custom_note")}</p>
          ) : null}
        </Section>

        <Section title={t("appearance.colors_title")}>
          <SettingGroup>
            <SettingRow
              label={t("appearance.accent")}
              description={t("appearance.accent_description")}
              controlWidth="full"
              modified={settings.accent !== base.accent}
              onReset={() => update({ accent: base.accent })}
              control={
                <AccentPicker value={settings.accent} onChange={(accent) => update({ accent })} />
              }
            />
            <SettingRow
              label={t("appearance.palette")}
              description={t("appearance.palette_description")}
              controlWidth="auto"
              modified={settings.palette !== base.palette}
              onReset={() => update({ palette: base.palette })}
              control={
                <SegmentedControl
                  ariaLabel={t("appearance.palette")}
                  size="sm"
                  {...choice("palette")}
                  options={[
                    { value: "colorful", label: t("appearance.palette_colorful") },
                    { value: "quiet", label: t("appearance.palette_quiet") },
                  ]}
                />
              }
            />
            <SettingRow
              label={t("appearance.icons")}
              description={t("appearance.icons_description")}
              controlWidth="auto"
              modified={settings.icons !== base.icons}
              onReset={() => update({ icons: base.icons })}
              control={
                <SegmentedControl
                  ariaLabel={t("appearance.icons")}
                  size="sm"
                  {...choice("icons")}
                  options={[
                    { value: "colorful", label: t("appearance.icons_colorful") },
                    { value: "mono", label: t("appearance.icons_mono") },
                  ]}
                />
              }
            />
            <SettingRow
              label={t("appearance.bars")}
              description={t("appearance.bars_description")}
              controlWidth="auto"
              modified={settings.bars !== base.bars}
              onReset={() => update({ bars: base.bars })}
              control={
                <SegmentedControl
                  ariaLabel={t("appearance.bars")}
                  size="sm"
                  {...choice("bars")}
                  options={[
                    { value: "semantic", label: t("appearance.bars_semantic") },
                    { value: "accent", label: t("appearance.bars_accent") },
                  ]}
                />
              }
            />
            <SettingRow
              label={t("appearance.charts")}
              description={t("appearance.charts_description")}
              controlWidth="auto"
              modified={settings.charts !== base.charts}
              onReset={() => update({ charts: base.charts })}
              control={
                <SegmentedControl
                  ariaLabel={t("appearance.charts")}
                  size="sm"
                  {...choice("charts")}
                  options={[
                    { value: "colorful", label: t("appearance.charts_colorful") },
                    { value: "accent", label: t("appearance.charts_accent") },
                  ]}
                />
              }
            />
            {STATUS_ROLES.map((role) => {
              const label = t(`appearance.status_${role}`);
              return (
                <SettingRow
                  key={role}
                  label={label}
                  description={t(`appearance.status_${role}_description`)}
                  controlWidth="auto"
                  modified={settings.status[role] !== null}
                  onReset={() => setStatus(role, null)}
                  control={
                    <StatusColorInput
                      label={t("appearance.status_pick", { name: label })}
                      value={settings.status[role] ?? DEFAULT_STATUS_HEX[role]}
                      onChange={(hex) => setStatus(role, hex)}
                    />
                  }
                />
              );
            })}
          </SettingGroup>
        </Section>

        <Section title={t("appearance.sizes_title")}>
          <SettingGroup>
            <SettingRow
              label={t("appearance.bar_thickness")}
              description={t("appearance.bar_thickness_description")}
              controlWidth="lg"
              modified={settings.barThickness !== BAR_THICKNESS_RANGE.default}
              onReset={() => update({ barThickness: BAR_THICKNESS_RANGE.default })}
              control={
                <RangeControl
                  label={t("appearance.bar_thickness")}
                  min={BAR_THICKNESS_RANGE.min}
                  max={BAR_THICKNESS_RANGE.max}
                  step={BAR_THICKNESS_RANGE.step}
                  value={settings.barThickness}
                  format={(value) => `${value} px`}
                  onChange={(barThickness) => update({ barThickness })}
                />
              }
            />
            <SettingRow
              label={t("appearance.ui_scale")}
              description={t("appearance.ui_scale_description")}
              controlWidth="lg"
              modified={settings.uiScale !== null}
              onReset={() => update({ uiScale: null })}
              control={
                <div className="flex w-full flex-col gap-2">
                  <ToggleSwitch
                    checked={settings.uiScale === null}
                    onCheckedChange={(auto) => update({ uiScale: auto ? null : platformScale() })}
                    label={t("appearance.ui_scale_auto_value", { value: percent(platformScale()) })}
                  />
                  <RangeControl
                    label={t("appearance.ui_scale")}
                    min={UI_SCALE_RANGE.min}
                    max={UI_SCALE_RANGE.max}
                    step={UI_SCALE_RANGE.step}
                    value={settings.uiScale ?? platformScale()}
                    format={percent}
                    disabled={settings.uiScale === null}
                    onChange={(uiScale) => update({ uiScale })}
                  />
                </div>
              }
            />
            <SettingRow
              label={t("appearance.text_scale")}
              description={t("appearance.text_scale_description")}
              controlWidth="lg"
              modified={settings.textScale !== TEXT_SCALE_RANGE.default}
              onReset={() => update({ textScale: TEXT_SCALE_RANGE.default })}
              control={
                <RangeControl
                  label={t("appearance.text_scale")}
                  min={TEXT_SCALE_RANGE.min}
                  max={TEXT_SCALE_RANGE.max}
                  step={TEXT_SCALE_RANGE.step}
                  value={settings.textScale}
                  format={percent}
                  onChange={(textScale) => update({ textScale })}
                />
              }
            />
            <SettingRow
              label={t("appearance.weight")}
              description={t("appearance.weight_description")}
              controlWidth="auto"
              modified={settings.weightShift !== 0}
              onReset={() => update({ weightShift: 0 })}
              control={
                <SegmentedControl
                  ariaLabel={t("appearance.weight")}
                  size="sm"
                  value={String(settings.weightShift)}
                  onChange={(value) => update({ weightShift: Number(value) })}
                  options={WEIGHT_SHIFTS.map((shift) => ({
                    value: String(shift),
                    label: t(WEIGHT_KEYS[shift]),
                  }))}
                />
              }
            />
          </SettingGroup>
        </Section>

        <Section title={t("appearance.mode_title")}>
          <SettingGroup>
            <SettingRow
              label={t("appearance.mode")}
              description={t("appearance.mode_description")}
              controlWidth="auto"
              control={
                <SegmentedControl<ThemePreference>
                  ariaLabel={t("appearance.mode")}
                  size="sm"
                  value={preference}
                  onChange={setMode}
                  options={[
                    { value: "light", label: t("theme.light") },
                    { value: "dark", label: t("theme.dark") },
                    { value: "auto", label: t("theme.auto") },
                  ]}
                />
              }
            />
          </SettingGroup>
        </Section>
      </div>

      <aside className="min-w-0 xl:sticky xl:top-0">
        <AppearancePreview />
      </aside>
    </div>
  );
}
