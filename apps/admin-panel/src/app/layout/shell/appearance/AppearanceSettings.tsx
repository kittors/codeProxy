import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  BAR_THICKNESS_RANGE,
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
  type AppearanceSettings as AppearanceSettingsValue,
  type StatusRole,
  type ThemePreference,
} from "@code-proxy/ui";
import { AccentPicker, RangeControl, StatusColorInput } from "./AppearanceControls";
import { AppearancePreview } from "./AppearancePreview";
import { StylePresetCards } from "./StylePresetCards";

/*
 * 外观抽屉的正文（顶栏右侧的调色板按钮打开，见 AppearanceButton）。设置只存在当前浏览器
 * （theme/appearance.ts），每一项改动立即生效：全站的颜色、粗细和字号都读 <html> 上的开关与
 * 变量，抽屉里的预览和抽屉背后的页面一起变。「撤销」回到当前风格预设里的值（配色项）或
 * 默认值（尺寸项）。
 *
 * 抽屉本身已经是一层面板：设置组用扁平样式（只留行间分隔线），色块、滑杆这类宽控件放在说明
 * 下方占满一行，窄抽屉里不和标题挤在一行。
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

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="text-sm font-semibold text-ink">{title}</h3>
      {children}
    </section>
  );
}

export function AppearanceSettings() {
  const { t } = useTranslation();
  const { settings, preset, update, applyPreset } = useAppearance();
  const {
    state: { preference },
    actions: { setMode },
  } = useTheme();
  // 配色项的「撤销」回到当前风格预设的值；自定义状态下没有可回的预设，回到默认（多彩）。
  const base = STYLE_PRESETS[preset === "custom" ? "colorful" : preset];
  const setStatus = (role: StatusRole, hex: string | null) =>
    update({ status: { ...settings.status, [role]: hex } });
  const choice = <K extends keyof AppearanceSettingsValue>(key: K) => ({
    value: settings[key],
    onChange: (value: AppearanceSettingsValue[K]) =>
      update({ [key]: value } as Partial<AppearanceSettingsValue>),
  });

  return (
    <div className="space-y-7 pb-2">
      <AppearancePreview />

      <Section title={t("appearance.style_title")}>
        <StylePresetCards current={preset} onSelect={applyPreset} />
        {preset === "custom" ? (
          <p className="text-xs text-ink-3">{t("appearance.preset_custom_note")}</p>
        ) : null}
      </Section>

      <Section title={t("appearance.colors_title")}>
        <SettingGroup flat>
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
        <SettingGroup flat>
          <SettingRow
            label={t("appearance.bar_thickness")}
            description={t("appearance.bar_thickness_description")}
            controlWidth="full"
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
            controlWidth="full"
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
            controlWidth="full"
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
            controlWidth="full"
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
    </div>
  );
}

/** 抽屉第一次打开时才加载这一块（React.lazy 需要默认导出）。 */
export default AppearanceSettings;
