import {
  Archive,
  BadgeCheck,
  Braces,
  Database,
  Gauge,
  Globe,
  KeyRound,
  MonitorDot,
  Network,
  RefreshCw,
  ScrollText,
  Server,
  ShieldCheck,
  SlidersHorizontal,
  Tag,
  Waves,
  Workflow,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import type { VisualConfigValues } from "@features/visual-config-editor";
import type { Hue, SettingControlWidth } from "@code-proxy/ui";
import { parseProxyUrl, validateProxyParts } from "@features/proxy-pool";

/**
 * 配置页的信息架构：分区与每一项设置的唯一来源。
 *
 * 导航、搜索、「改了哪几项」、撤销单项、渲染都从这里读，不再在 JSX 里各写一份——
 * 以前改一个标签要同时改卡片、提示与测试，搜索也无从做起。
 * 文案全部是 `config_ui.*` 的键；YAML 键原样显示在说明后面，熟悉 config.yaml 的人照样能对上号。
 */

export type ConfigSectionId =
  | "server"
  | "remote"
  | "cors"
  | "runtime"
  | "network"
  | "access"
  | "streaming"
  | "quota"
  | "logging"
  | "retention"
  | "monitoring"
  | "payload"
  | "kimi"
  | "codex";

export type ConfigNavGroupId = "basics" | "behavior" | "data" | "advanced";

export interface ConfigSectionDef {
  id: ConfigSectionId;
  group: ConfigNavGroupId;
  icon: LucideIcon;
  /**
   * 分区的色相：同一组里相邻分区颜色分得开。图标着色多彩时用于分区标题的图标块与胶囊图标，
   * 配色风格多彩时用于选中胶囊的淡底；都关掉时是中性线性图标 + 强调色选中态。
   */
  hue: Hue;
  /** 自定义内容（规则编辑器、准入面板）的分区没有字段，搜索时额外匹配这些词。 */
  keywords?: string[];
}

export const CONFIG_NAV_GROUPS: readonly ConfigNavGroupId[] = ["basics", "behavior", "data", "advanced"];

export interface ConfigGroupDef {
  id: ConfigNavGroupId;
  icon: LucideIcon;
  hue: Hue;
}

/**
 * 顶部分组页签：四组各一个图标与色相。图标着色多彩时选中那组的图标块变成该色相的实色，
 * 单色时选中靠强调色表达。
 */
export const CONFIG_GROUPS: readonly ConfigGroupDef[] = [
  { id: "basics", icon: SlidersHorizontal, hue: "blue" },
  { id: "behavior", icon: Workflow, hue: "violet" },
  { id: "data", icon: Database, hue: "emerald" },
  { id: "advanced", icon: Wrench, hue: "orange" },
];

export const CONFIG_SECTIONS: readonly ConfigSectionDef[] = [
  { id: "server", group: "basics", icon: Server, hue: "blue" },
  { id: "remote", group: "basics", icon: ShieldCheck, hue: "violet" },
  { id: "cors", group: "basics", icon: Globe, hue: "cyan" },
  { id: "runtime", group: "behavior", icon: RefreshCw, hue: "indigo" },
  { id: "network", group: "behavior", icon: Network, hue: "sky" },
  { id: "access", group: "behavior", icon: KeyRound, hue: "amber" },
  { id: "streaming", group: "behavior", icon: Waves, hue: "teal" },
  { id: "quota", group: "behavior", icon: Gauge, hue: "orange" },
  { id: "logging", group: "data", icon: ScrollText, hue: "orange" },
  { id: "retention", group: "data", icon: Archive, hue: "lime" },
  { id: "monitoring", group: "data", icon: MonitorDot, hue: "emerald" },
  {
    id: "payload",
    group: "advanced",
    icon: Braces,
    hue: "fuchsia",
    keywords: ["payload", "default", "override", "filter", "body", "params"],
  },
  { id: "kimi", group: "advanced", icon: Tag, hue: "sky", keywords: ["kimi", "header", "user-agent"] },
  {
    id: "codex",
    group: "advanced",
    icon: BadgeCheck,
    hue: "indigo",
    keywords: ["codex", "oauth", "admission", "client", "preset"],
  },
];

export type ConfigBadge = "restart" | "security" | "cost";
export type ConfigFieldKind = "switch" | "text" | "number" | "choice" | "multiline" | "proxy";

export interface ConfigFieldDef {
  /** 稳定 id：用作 DOM id、搜索命中与 i18n 键 `config_ui.fields.<id>.*`。 */
  id: string;
  section: ConfigSectionId;
  kind: ConfigFieldKind;
  yamlKey: string;
  get: (values: VisualConfigValues) => string | boolean;
  set: (values: VisualConfigValues, next: string | boolean) => Partial<VisualConfigValues>;
  placeholder?: string;
  /** 单位文案键（`config_ui.units.*`），显示在输入框右侧。 */
  unit?: "seconds" | "minutes" | "days" | "mb";
  width?: SettingControlWidth;
  badges?: readonly ConfigBadge[];
  /** choice 类型的选项：值与文案键（`config_ui.fields.<id>.options.<value>.*`）。 */
  options?: readonly string[];
  /** 控件下方常驻的提醒（`config_ui.fields.<id>.warning`）。 */
  warning?: boolean;
  /**
   * 沿用的旧文案键：标签被现有测试和用户习惯按名称引用（例如「自动检查更新」），
   * 改名会让读屏和自动化测试都找不到它。
   */
  labelKey?: string;
  descriptionKey?: string;
  warningKey?: string;
  /** 敏感值：输入框默认遮住，可点眼睛显示。 */
  secret?: boolean;
  /**
   * 整数校验。保存时 `setIntFromString` 遇到非数字会把这个键从 YAML 里删掉——
   * 端口填错一个字母，服务就会回到默认端口——所以必须在保存前拦下来。
   */
  integer?: { min?: number; max?: number; allowNegative?: boolean; required?: boolean };
}

const text = (
  id: string,
  section: ConfigSectionId,
  yamlKey: string,
  pick: (v: VisualConfigValues) => string,
  put: (v: VisualConfigValues, next: string) => Partial<VisualConfigValues>,
  extra: Partial<ConfigFieldDef> = {},
): ConfigFieldDef => ({
  id,
  section,
  kind: "text",
  yamlKey,
  get: pick,
  set: (values, next) => put(values, String(next)),
  ...extra,
});

const number = (
  id: string,
  section: ConfigSectionId,
  yamlKey: string,
  pick: (v: VisualConfigValues) => string,
  put: (v: VisualConfigValues, next: string) => Partial<VisualConfigValues>,
  extra: Partial<ConfigFieldDef> = {},
): ConfigFieldDef => ({
  ...text(id, section, yamlKey, pick, put, extra),
  kind: "number",
  width: extra.width ?? "sm",
  integer: extra.integer ?? { min: 0 },
});

const toggle = (
  id: string,
  section: ConfigSectionId,
  yamlKey: string,
  pick: (v: VisualConfigValues) => boolean,
  put: (v: VisualConfigValues, next: boolean) => Partial<VisualConfigValues>,
  extra: Partial<ConfigFieldDef> = {},
): ConfigFieldDef => ({
  id,
  section,
  kind: "switch",
  yamlKey,
  get: pick,
  set: (values, next) => put(values, Boolean(next)),
  width: "auto",
  ...extra,
});

const storage = (
  values: VisualConfigValues,
  patch: Partial<VisualConfigValues["requestLogStorage"]>,
): Partial<VisualConfigValues> => ({
  requestLogStorage: { ...values.requestLogStorage, ...patch },
});

const streaming = (
  values: VisualConfigValues,
  patch: Partial<VisualConfigValues["streaming"]>,
): Partial<VisualConfigValues> => ({ streaming: { ...values.streaming, ...patch } });

const kimi = (
  values: VisualConfigValues,
  patch: Partial<VisualConfigValues["kimiHeaderDefaults"]>,
): Partial<VisualConfigValues> => ({
  kimiHeaderDefaults: { ...values.kimiHeaderDefaults, ...patch },
});

export const CONFIG_FIELDS: readonly ConfigFieldDef[] = [
  // 服务监听
  text("host", "server", "host", (v) => v.host, (_, host) => ({ host }), {
    placeholder: "0.0.0.0",
    width: "md",
    badges: ["restart"],
  }),
  number("port", "server", "port", (v) => v.port, (_, port) => ({ port }), {
    placeholder: "8317",
    badges: ["restart"],
    integer: { min: 1, max: 65535 },
  }),
  text("auth_dir", "server", "auth-dir", (v) => v.authDir, (_, authDir) => ({ authDir }), {
    placeholder: "./auth",
    width: "lg",
  }),
  toggle("tls_enable", "server", "tls.enable", (v) => v.tlsEnable, (_, tlsEnable) => ({ tlsEnable }), {
    badges: ["restart"],
  }),
  text("tls_cert", "server", "tls.cert", (v) => v.tlsCert, (_, tlsCert) => ({ tlsCert }), {
    placeholder: "./cert.pem",
    width: "lg",
  }),
  text("tls_key", "server", "tls.key", (v) => v.tlsKey, (_, tlsKey) => ({ tlsKey }), {
    placeholder: "./key.pem",
    width: "lg",
  }),

  // 远程管理
  toggle(
    "allow_remote",
    "remote",
    "remote-management.allow-remote",
    (v) => v.rmAllowRemote,
    (_, rmAllowRemote) => ({ rmAllowRemote }),
    { badges: ["security"] },
  ),
  text(
    "secret_key",
    "remote",
    "remote-management.secret-key",
    (v) => v.rmSecretKey,
    (_, rmSecretKey) => ({ rmSecretKey }),
    { placeholder: "******", width: "lg", badges: ["security"], secret: true },
  ),
  toggle(
    "disable_panel",
    "remote",
    "remote-management.disable-control-panel",
    (v) => v.rmDisableControlPanel,
    (_, rmDisableControlPanel) => ({ rmDisableControlPanel }),
  ),
  text(
    "panel_repo",
    "remote",
    "remote-management.panel-github-repository",
    (v) => v.rmPanelRepo,
    (_, rmPanelRepo) => ({ rmPanelRepo }),
    { placeholder: "owner/repo", width: "lg" },
  ),

  // 跨域访问
  {
    id: "cors_origins",
    section: "cors",
    kind: "multiline",
    yamlKey: "cors-allow-origins",
    get: (v) => v.corsAllowOriginsText,
    set: (_, next) => ({ corsAllowOriginsText: String(next) }),
    placeholder: [
      "chrome-extension://abcdefghijklmnop",
      "chrome-extension://*",
      "http://localhost:5173",
      "https://admin.example.com",
    ].join("\n"),
    width: "full",
    warning: true,
    labelKey: "visual_config.cors_origins_label",
  },

  // 运行模式与更新
  toggle(
    "commercial",
    "runtime",
    "commercial-mode",
    (v) => v.commercialMode,
    (_, commercialMode) => ({ commercialMode }),
    { badges: ["restart"], warning: true, warningKey: "resource_config.commercial_mode_warning" },
  ),
  toggle(
    "auto_update",
    "runtime",
    "auto-update.enabled",
    (v) => v.autoUpdateEnabled,
    (_, autoUpdateEnabled) => ({ autoUpdateEnabled }),
    { labelKey: "config_page.auto_update", descriptionKey: "config_page.auto_update_desc" },
  ),
  {
    id: "update_channel",
    section: "runtime",
    kind: "choice",
    yamlKey: "auto-update.channel",
    get: (v) => v.autoUpdateChannel,
    set: (_, next) => ({ autoUpdateChannel: next === "dev" ? "dev" : "main" }),
    options: ["main", "dev"],
    width: "full",
    labelKey: "config_page.auto_update_channel",
  },
  text(
    "docker_image",
    "runtime",
    "auto-update.docker-image",
    (v) => v.autoUpdateDockerImage,
    (_, autoUpdateDockerImage) => ({ autoUpdateDockerImage }),
    {
      placeholder: "ghcr.io/kittors/clirelay",
      width: "lg",
      warning: true,
      labelKey: "config_page.auto_update_docker_image",
      descriptionKey: "config_page.auto_update_docker_image_desc",
      warningKey: "config_page.auto_update_docker_image_warning",
    },
  ),

  // 网络与重试
  {
    id: "proxy_url",
    section: "network",
    // 结构化代理输入（协议 / 主机 / 端口 / 账号密码），拼出的仍是同一个 URL 字符串。
    kind: "proxy",
    yamlKey: "proxy-url",
    get: (v) => v.proxyUrl,
    set: (_, next) => ({ proxyUrl: String(next) }),
    width: "full",
  },
  toggle("prefer_ipv4", "network", "prefer-ipv4", (v) => v.preferIPv4, (_, preferIPv4) => ({
    preferIPv4,
  })),
  number(
    "request_retry",
    "network",
    "request-retry",
    (v) => v.requestRetry,
    (_, requestRetry) => ({ requestRetry }),
    { placeholder: "3" },
  ),
  number(
    "max_retry_interval",
    "network",
    "max-retry-interval",
    (v) => v.maxRetryInterval,
    (_, maxRetryInterval) => ({ maxRetryInterval }),
    { placeholder: "30", unit: "seconds" },
  ),

  // 访问规则
  toggle(
    "force_prefix",
    "access",
    "force-model-prefix",
    (v) => v.forceModelPrefix,
    (_, forceModelPrefix) => ({ forceModelPrefix }),
  ),
  toggle("ws_auth", "access", "ws-auth", (v) => v.wsAuth, (_, wsAuth) => ({ wsAuth }), {
    badges: ["security"],
  }),

  // 流式传输
  number(
    "keepalive",
    "streaming",
    "streaming.keepalive-seconds",
    (v) => v.streaming.keepaliveSeconds,
    (v, keepaliveSeconds) => streaming(v, { keepaliveSeconds }),
    { placeholder: "15", unit: "seconds", integer: { allowNegative: true } },
  ),
  number(
    "bootstrap_retries",
    "streaming",
    "streaming.bootstrap-retries",
    (v) => v.streaming.bootstrapRetries,
    (v, bootstrapRetries) => streaming(v, { bootstrapRetries }),
    { placeholder: "1" },
  ),
  number(
    "nonstream_keepalive",
    "streaming",
    "nonstream-keepalive-interval",
    (v) => v.streaming.nonstreamKeepaliveInterval,
    (v, nonstreamKeepaliveInterval) => streaming(v, { nonstreamKeepaliveInterval }),
    { placeholder: "0", unit: "seconds" },
  ),

  // 额度用尽时
  toggle(
    "switch_project",
    "quota",
    "quota-exceeded.switch-project",
    (v) => v.quotaSwitchProject,
    (_, quotaSwitchProject) => ({ quotaSwitchProject }),
  ),
  toggle(
    "switch_preview",
    "quota",
    "quota-exceeded.switch-preview-model",
    (v) => v.quotaSwitchPreviewModel,
    (_, quotaSwitchPreviewModel) => ({ quotaSwitchPreviewModel }),
  ),

  // 日志
  toggle("request_log", "logging", "request-log", (v) => v.requestLog, (_, requestLog) => ({ requestLog }), {
    badges: ["cost"],
  }),
  toggle(
    "store_content",
    "logging",
    "request-log-storage.store-content",
    (v) => v.requestLogStorage.storeContent,
    (v, storeContent) => storage(v, { storeContent }),
    { badges: ["cost"] },
  ),
  toggle(
    "log_to_file",
    "logging",
    "logging-to-file",
    (v) => v.loggingToFile,
    (_, loggingToFile) => ({ loggingToFile }),
  ),
  toggle("debug", "logging", "debug", (v) => v.debug, (_, debug) => ({ debug }), {
    badges: ["cost"],
  }),
  toggle(
    "usage_stats",
    "logging",
    "usage-statistics-enabled",
    (v) => v.usageStatisticsEnabled,
    (_, usageStatisticsEnabled) => ({ usageStatisticsEnabled }),
  ),
  number(
    "log_size",
    "logging",
    "logs-max-total-size-mb",
    (v) => v.logsMaxTotalSizeMb,
    (_, logsMaxTotalSizeMb) => ({ logsMaxTotalSizeMb }),
    { placeholder: "128", unit: "mb" },
  ),
  number(
    "error_files",
    "logging",
    "error-logs-max-files",
    (v) => v.errorLogsMaxFiles,
    (_, errorLogsMaxFiles) => ({ errorLogsMaxFiles }),
    { placeholder: "10", integer: { min: 0, required: true } },
  ),

  // 保留与清理
  number(
    "detail_retention",
    "retention",
    "request-log-storage.retention-days",
    (v) => v.requestLogStorage.retentionDays,
    (v, retentionDays) => storage(v, { retentionDays }),
    { placeholder: "7", unit: "days", integer: { min: 1, required: true } },
  ),
  number(
    "body_retention",
    "retention",
    "request-log-storage.content-retention-days",
    (v) => v.requestLogStorage.contentRetentionDays,
    (v, contentRetentionDays) => storage(v, { contentRetentionDays }),
    { placeholder: "3", unit: "days", integer: { min: 0, required: true } },
  ),
  toggle(
    "cleanup_enabled",
    "retention",
    "request-log-storage.cleanup-enabled",
    (v) => v.requestLogStorage.cleanupEnabled,
    (v, cleanupEnabled) => storage(v, { cleanupEnabled }),
  ),
  number(
    "cleanup_interval",
    "retention",
    "request-log-storage.cleanup-interval-minutes",
    (v) => v.requestLogStorage.cleanupIntervalMinutes,
    (v, cleanupIntervalMinutes) => storage(v, { cleanupIntervalMinutes }),
    { placeholder: "60", unit: "minutes", integer: { min: 1, required: true } },
  ),
  number(
    "max_rows",
    "retention",
    "request-log-storage.max-rows",
    (v) => v.requestLogStorage.maxRows,
    (v, maxRows) => storage(v, { maxRows }),
    { placeholder: "100000", width: "md", integer: { min: 0, required: true } },
  ),
  number(
    "metadata_cap",
    "retention",
    "request-log-storage.max-metadata-size-mb",
    (v) => v.requestLogStorage.maxMetadataSizeMb,
    (v, maxMetadataSizeMb) => storage(v, { maxMetadataSizeMb }),
    { placeholder: "256", unit: "mb", integer: { min: 0, required: true } },
  ),
  number(
    "body_cap",
    "retention",
    "request-log-storage.max-total-size-mb",
    (v) => v.requestLogStorage.maxTotalSizeMb,
    (v, maxTotalSizeMb) => storage(v, { maxTotalSizeMb }),
    { placeholder: "128", unit: "mb", integer: { min: 0, required: true } },
  ),

  // 系统监控
  number(
    "stats_cache",
    "monitoring",
    "system-stats-cache-seconds",
    (v) => v.systemStatsCacheSeconds,
    (_, systemStatsCacheSeconds) => ({ systemStatsCacheSeconds }),
    { placeholder: "60", unit: "seconds", integer: { min: 10, required: true } },
  ),
  number(
    "ws_max_age",
    "monitoring",
    "system-stats-websocket-max-age-seconds",
    (v) => v.systemStatsWebSocketMaxAgeSeconds,
    (_, systemStatsWebSocketMaxAgeSeconds) => ({ systemStatsWebSocketMaxAgeSeconds }),
    { placeholder: "300", unit: "seconds", integer: { min: 60, required: true } },
  ),

  // Kimi 请求头
  text(
    "kimi_user_agent",
    "kimi",
    "kimi-header-defaults.user-agent",
    (v) => v.kimiHeaderDefaults.userAgent,
    (v, userAgent) => kimi(v, { userAgent }),
    { placeholder: "KimiCLI/1.10.6", width: "lg" },
  ),
  text(
    "kimi_platform",
    "kimi",
    "kimi-header-defaults.platform",
    (v) => v.kimiHeaderDefaults.platform,
    (v, platform) => kimi(v, { platform }),
    { placeholder: "kimi_cli" },
  ),
  text(
    "kimi_version",
    "kimi",
    "kimi-header-defaults.version",
    (v) => v.kimiHeaderDefaults.version,
    (v, version) => kimi(v, { version }),
    { placeholder: "1.10.6", width: "sm" },
  ),
];

/** 请求体规则不是单值字段：整组比较，计入「改动项」时每类规则算一项。 */
export const PAYLOAD_RULE_KEYS = [
  "payloadDefaultRules",
  "payloadOverrideRules",
  "payloadFilterRules",
] as const;

export function fieldsOfSection(section: ConfigSectionId): ConfigFieldDef[] {
  return CONFIG_FIELDS.filter((field) => field.section === section);
}

export function isFieldModified(
  field: ConfigFieldDef,
  values: VisualConfigValues,
  baseline: VisualConfigValues,
): boolean {
  return field.get(values) !== field.get(baseline);
}

/** 改动了的字段 id，以及有改动的请求体规则类别（用于分区圆点与保存条计数）。 */
export function collectModified(values: VisualConfigValues, baseline: VisualConfigValues) {
  const fields = CONFIG_FIELDS.filter((field) => isFieldModified(field, values, baseline)).map(
    (field) => field.id,
  );
  const payload = PAYLOAD_RULE_KEYS.filter(
    (key) => JSON.stringify(values[key]) !== JSON.stringify(baseline[key]),
  );
  return { fields, payload };
}

export type FieldError = { key: string; params?: Record<string, number> };

/** 单项校验：返回错误文案键（`config_ui.errors.*`）与参数；没问题返回 null。 */
export function validateField(field: ConfigFieldDef, values: VisualConfigValues): FieldError | null {
  if (field.kind === "proxy") {
    const raw = String(field.get(values)).trim();
    if (!raw) return null;
    const parsed = parseProxyUrl(raw);
    if (!parsed?.scheme) return { key: "proxy_url" };
    return Object.keys(validateProxyParts(parsed.parts, false)).length ? { key: "proxy_url" } : null;
  }
  const rule = field.integer;
  if (!rule) return null;
  const raw = String(field.get(values)).trim();
  if (raw === "") return rule.required ? { key: "required" } : null;
  const pattern = rule.allowNegative ? /^-?\d+$/ : /^\d+$/;
  if (!pattern.test(raw)) return { key: rule.allowNegative ? "integer" : "non_negative" };
  const parsed = Number(raw);
  if (!Number.isSafeInteger(parsed)) return { key: "integer" };
  if (rule.max !== undefined && rule.min !== undefined && (parsed < rule.min || parsed > rule.max)) {
    return { key: "range", params: { min: rule.min, max: rule.max } };
  }
  if (rule.min !== undefined && parsed < rule.min) return { key: "min", params: { min: rule.min } };
  return null;
}

/** 所有校验不通过的项（按页面顺序），保存前用来拦截并定位第一项。 */
export function collectInvalidFields(values: VisualConfigValues): ConfigFieldDef[] {
  return CONFIG_FIELDS.filter((field) => validateField(field, values) !== null);
}
