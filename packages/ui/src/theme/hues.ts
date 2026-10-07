import { isValidElement, type ReactNode } from "react";

/**
 * 全站色相体系。
 *
 * 以前图标块、分区图标、空态、侧边栏图标都是中性灰，整个面板读起来灰蒙蒙的。现在每个图标
 * 有自己的色相：用于「认出这是什么」（用户是蓝、权限是紫、密钥是琥珀……），不表达好坏——
 * 侧边栏的几个顶层分组（仪表盘靛蓝、运行观测翠绿、接入与凭证紫、模型与调度橙、组织与权限蓝、
 * 系统设置蓝绿、系统信息天蓝）彼此不撞色，调整注册表时注意保持这一点——
 * 危险 / 警告 / 完成仍然只用 DialogIcon 的 danger / warning / success 语义色调。
 *
 * Tailwind 只认源码里完整出现的类名，所以每个色相的每种用法都写成完整字符串，不能拼接。
 */
export const HUES = [
  "blue",
  "sky",
  "cyan",
  "teal",
  "emerald",
  "lime",
  "amber",
  "orange",
  "rose",
  "pink",
  "fuchsia",
  "purple",
  "violet",
  "indigo",
] as const;

export type Hue = (typeof HUES)[number];

export const isHue = (value: unknown): value is Hue =>
  typeof value === "string" && (HUES as readonly string[]).includes(value);

/** 图标块：同色系由浓到淡的渐变底 + 细描边 + 饱和的图标色（配合 DialogIcon 的 `border` 类）。 */
export const HUE_TILE: Record<Hue, string> = {
  blue: "border-blue-500/15 bg-gradient-to-b from-blue-500/[0.14] to-blue-500/[0.06] text-blue-600 dark:border-blue-400/20 dark:from-blue-400/20 dark:to-blue-400/10 dark:text-blue-300",
  sky: "border-sky-500/15 bg-gradient-to-b from-sky-500/[0.14] to-sky-500/[0.06] text-sky-600 dark:border-sky-400/20 dark:from-sky-400/20 dark:to-sky-400/10 dark:text-sky-300",
  cyan: "border-cyan-500/20 bg-gradient-to-b from-cyan-500/[0.14] to-cyan-500/[0.06] text-cyan-600 dark:border-cyan-400/20 dark:from-cyan-400/20 dark:to-cyan-400/10 dark:text-cyan-300",
  teal: "border-teal-500/20 bg-gradient-to-b from-teal-500/[0.14] to-teal-500/[0.06] text-teal-600 dark:border-teal-400/20 dark:from-teal-400/20 dark:to-teal-400/10 dark:text-teal-300",
  emerald:
    "border-emerald-500/20 bg-gradient-to-b from-emerald-500/[0.14] to-emerald-500/[0.06] text-emerald-600 dark:border-emerald-400/20 dark:from-emerald-400/20 dark:to-emerald-400/10 dark:text-emerald-300",
  lime: "border-lime-500/25 bg-gradient-to-b from-lime-500/[0.16] to-lime-500/[0.07] text-lime-700 dark:border-lime-400/20 dark:from-lime-400/20 dark:to-lime-400/10 dark:text-lime-300",
  amber:
    "border-amber-500/20 bg-gradient-to-b from-amber-500/[0.16] to-amber-500/[0.07] text-amber-600 dark:border-amber-400/20 dark:from-amber-400/20 dark:to-amber-400/10 dark:text-amber-300",
  orange:
    "border-orange-500/20 bg-gradient-to-b from-orange-500/[0.14] to-orange-500/[0.06] text-orange-600 dark:border-orange-400/20 dark:from-orange-400/20 dark:to-orange-400/10 dark:text-orange-300",
  rose: "border-rose-500/15 bg-gradient-to-b from-rose-500/[0.13] to-rose-500/[0.05] text-rose-600 dark:border-rose-400/20 dark:from-rose-400/20 dark:to-rose-400/10 dark:text-rose-300",
  pink: "border-pink-500/15 bg-gradient-to-b from-pink-500/[0.13] to-pink-500/[0.05] text-pink-600 dark:border-pink-400/20 dark:from-pink-400/20 dark:to-pink-400/10 dark:text-pink-300",
  fuchsia:
    "border-fuchsia-500/15 bg-gradient-to-b from-fuchsia-500/[0.13] to-fuchsia-500/[0.05] text-fuchsia-600 dark:border-fuchsia-400/20 dark:from-fuchsia-400/20 dark:to-fuchsia-400/10 dark:text-fuchsia-300",
  purple:
    "border-purple-500/15 bg-gradient-to-b from-purple-500/[0.13] to-purple-500/[0.05] text-purple-600 dark:border-purple-400/20 dark:from-purple-400/20 dark:to-purple-400/10 dark:text-purple-300",
  violet:
    "border-violet-500/15 bg-gradient-to-b from-violet-500/[0.13] to-violet-500/[0.05] text-violet-600 dark:border-violet-400/20 dark:from-violet-400/20 dark:to-violet-400/10 dark:text-violet-300",
  indigo:
    "border-indigo-500/15 bg-gradient-to-b from-indigo-500/[0.13] to-indigo-500/[0.05] text-indigo-600 dark:border-indigo-400/20 dark:from-indigo-400/20 dark:to-indigo-400/10 dark:text-indigo-300",
};

/** 不带底块的彩色图标（侧边栏、行内小图标）。 */
export const HUE_GLYPH: Record<Hue, string> = {
  blue: "text-blue-500 dark:text-blue-400",
  sky: "text-sky-500 dark:text-sky-400",
  cyan: "text-cyan-500 dark:text-cyan-400",
  teal: "text-teal-500 dark:text-teal-400",
  emerald: "text-emerald-500 dark:text-emerald-400",
  lime: "text-lime-600 dark:text-lime-400",
  amber: "text-amber-500 dark:text-amber-400",
  orange: "text-orange-500 dark:text-orange-400",
  rose: "text-rose-500 dark:text-rose-400",
  pink: "text-pink-500 dark:text-pink-400",
  fuchsia: "text-fuchsia-500 dark:text-fuchsia-400",
  purple: "text-purple-500 dark:text-purple-400",
  violet: "text-violet-500 dark:text-violet-400",
  indigo: "text-indigo-500 dark:text-indigo-400",
};

/** 淡底胶囊（标签、计数、选中的分区胶囊）。 */
export const HUE_SOFT: Record<Hue, string> = {
  blue: "bg-blue-500/10 text-blue-700 dark:bg-blue-400/15 dark:text-blue-300",
  sky: "bg-sky-500/10 text-sky-700 dark:bg-sky-400/15 dark:text-sky-300",
  cyan: "bg-cyan-500/10 text-cyan-700 dark:bg-cyan-400/15 dark:text-cyan-300",
  teal: "bg-teal-500/10 text-teal-700 dark:bg-teal-400/15 dark:text-teal-300",
  emerald: "bg-emerald-500/10 text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-300",
  lime: "bg-lime-500/15 text-lime-800 dark:bg-lime-400/15 dark:text-lime-300",
  amber: "bg-amber-500/10 text-amber-700 dark:bg-amber-400/15 dark:text-amber-300",
  orange: "bg-orange-500/10 text-orange-700 dark:bg-orange-400/15 dark:text-orange-300",
  rose: "bg-rose-500/10 text-rose-700 dark:bg-rose-400/15 dark:text-rose-300",
  pink: "bg-pink-500/10 text-pink-700 dark:bg-pink-400/15 dark:text-pink-300",
  fuchsia: "bg-fuchsia-500/10 text-fuchsia-700 dark:bg-fuchsia-400/15 dark:text-fuchsia-300",
  purple: "bg-purple-500/10 text-purple-700 dark:bg-purple-400/15 dark:text-purple-300",
  violet: "bg-violet-500/10 text-violet-700 dark:bg-violet-400/15 dark:text-violet-300",
  indigo: "bg-indigo-500/10 text-indigo-700 dark:bg-indigo-400/15 dark:text-indigo-300",
};

/** 小圆点（有改动、状态点）。 */
export const HUE_DOT: Record<Hue, string> = {
  blue: "bg-blue-500",
  sky: "bg-sky-500",
  cyan: "bg-cyan-500",
  teal: "bg-teal-500",
  emerald: "bg-emerald-500",
  lime: "bg-lime-500",
  amber: "bg-amber-500",
  orange: "bg-orange-500",
  rose: "bg-rose-500",
  pink: "bg-pink-500",
  fuchsia: "bg-fuchsia-500",
  purple: "bg-purple-500",
  violet: "bg-violet-500",
  indigo: "bg-indigo-500",
};

/** 实色渐变块（选中的分组页签、强调按钮的图标底）：白色图标压在上面。 */
export const HUE_SOLID: Record<Hue, string> = {
  blue: "bg-gradient-to-br from-blue-400 to-blue-600 text-white",
  sky: "bg-gradient-to-br from-sky-400 to-sky-600 text-white",
  cyan: "bg-gradient-to-br from-cyan-400 to-cyan-600 text-white",
  teal: "bg-gradient-to-br from-teal-400 to-teal-600 text-white",
  emerald: "bg-gradient-to-br from-emerald-400 to-emerald-600 text-white",
  lime: "bg-gradient-to-br from-lime-400 to-lime-600 text-white",
  amber: "bg-gradient-to-br from-amber-400 to-orange-500 text-white",
  orange: "bg-gradient-to-br from-orange-400 to-orange-600 text-white",
  rose: "bg-gradient-to-br from-rose-400 to-rose-600 text-white",
  pink: "bg-gradient-to-br from-pink-400 to-pink-600 text-white",
  fuchsia: "bg-gradient-to-br from-fuchsia-400 to-fuchsia-600 text-white",
  purple: "bg-gradient-to-br from-purple-400 to-purple-600 text-white",
  violet: "bg-gradient-to-br from-violet-400 to-violet-600 text-white",
  indigo: "bg-gradient-to-br from-indigo-400 to-indigo-600 text-white",
};

/** 画布（echarts / SVG）用的色值：浅色取 500，深色取 400，与上面的类名同一档。 */
export const HUE_HEX: Record<Hue, { light: string; dark: string }> = {
  blue: { light: "#3b82f6", dark: "#60a5fa" },
  sky: { light: "#0ea5e9", dark: "#38bdf8" },
  cyan: { light: "#06b6d4", dark: "#22d3ee" },
  teal: { light: "#14b8a6", dark: "#2dd4bf" },
  emerald: { light: "#10b981", dark: "#34d399" },
  lime: { light: "#84cc16", dark: "#a3e635" },
  amber: { light: "#f59e0b", dark: "#fbbf24" },
  orange: { light: "#f97316", dark: "#fb923c" },
  rose: { light: "#f43f5e", dark: "#fb7185" },
  pink: { light: "#ec4899", dark: "#f472b6" },
  fuchsia: { light: "#d946ef", dark: "#e879f9" },
  purple: { light: "#a855f7", dark: "#c084fc" },
  violet: { light: "#8b5cf6", dark: "#a78bfa" },
  indigo: { light: "#6366f1", dark: "#818cf8" },
};

export const hueHex = (hue: Hue, isDark: boolean) => (isDark ? HUE_HEX[hue].dark : HUE_HEX[hue].light);

/**
 * 图标 → 色相。按 lucide 组件的名字（displayName）查：同一个图标在弹窗、分区、侧边栏、空态里
 * 永远是同一种颜色，看多了就能「按颜色认东西」。同一类事物放在同一个色相里：
 * 人蓝、组织靛蓝、权限与安全紫、密钥与额度琥珀、网络天蓝 / 青、路由蓝绿、数据库与统计翠绿、
 * 日志与文档橙、代码与规则品红、模型与 AI 紫 / 品红、图片粉、视频玫红、标签青柠。
 */
const ICON_HUE: Record<string, Hue> = {
  // 人与组织
  User: "blue",
  UserRound: "blue",
  UserPlus: "blue",
  UserRoundPlus: "blue",
  UserCog: "blue",
  UserRoundCog: "blue",
  UserCheck: "blue",
  UserX: "blue",
  UserMinus: "blue",
  Users: "blue",
  UsersRound: "blue",
  Contact: "blue",
  Mail: "blue",
  AtSign: "blue",
  Building: "indigo",
  Building2: "indigo",
  Landmark: "indigo",
  // 权限与安全
  Shield: "violet",
  ShieldCheck: "violet",
  ShieldAlert: "violet",
  ShieldBan: "violet",
  ShieldOff: "violet",
  ShieldPlus: "violet",
  ShieldUser: "violet",
  Lock: "violet",
  LockKeyhole: "violet",
  Unlock: "violet",
  Fingerprint: "indigo",
  BadgeCheck: "violet",
  ScanFace: "violet",
  // 密钥、额度与费用
  Key: "amber",
  KeyRound: "amber",
  KeySquare: "amber",
  Ticket: "amber",
  Gauge: "amber",
  Wallet: "amber",
  Coins: "amber",
  CircleDollarSign: "amber",
  DollarSign: "amber",
  Receipt: "amber",
  PiggyBank: "amber",
  Star: "amber",
  Crown: "amber",
  Bell: "amber",
  // 网络、代理与路由
  Network: "sky",
  Globe: "cyan",
  Earth: "cyan",
  Cloud: "sky",
  Wifi: "sky",
  Cable: "sky",
  Link: "cyan",
  Link2: "cyan",
  ExternalLink: "cyan",
  Route: "teal",
  Waypoints: "teal",
  Split: "teal",
  GitBranch: "teal",
  Shuffle: "teal",
  Waves: "teal",
  // 服务器、数据与统计
  Server: "blue",
  Cpu: "indigo",
  HardDrive: "indigo",
  MemoryStick: "indigo",
  Database: "emerald",
  DatabaseZap: "emerald",
  Archive: "lime",
  MonitorDot: "emerald",
  Monitor: "emerald",
  Activity: "emerald",
  ChartLine: "emerald",
  ChartColumn: "emerald",
  ChartBar: "emerald",
  ChartNoAxesColumn: "emerald",
  ChartPie: "emerald",
  BarChart3: "emerald",
  LineChart: "emerald",
  TrendingUp: "emerald",
  // 时间
  Clock: "cyan",
  Clock3: "cyan",
  Timer: "cyan",
  TimerReset: "cyan",
  Hourglass: "cyan",
  History: "cyan",
  Calendar: "cyan",
  CalendarClock: "cyan",
  CalendarDays: "cyan",
  CalendarRange: "cyan",
  // 日志、文档、代码与规则
  ScrollText: "orange",
  FileText: "orange",
  File: "orange",
  Files: "orange",
  FileInput: "orange",
  FileOutput: "orange",
  Notebook: "orange",
  BookOpen: "orange",
  Braces: "fuchsia",
  Code: "fuchsia",
  Code2: "fuchsia",
  CodeXml: "fuchsia",
  FileJson: "fuchsia",
  FileCode: "fuchsia",
  Terminal: "purple",
  SquareTerminal: "purple",
  Webhook: "fuchsia",
  ListFilter: "teal",
  Filter: "teal",
  // 模型与 AI
  Bot: "violet",
  Sparkles: "fuchsia",
  Wand2: "purple",
  WandSparkles: "purple",
  Brain: "pink",
  Layers: "orange",
  Boxes: "indigo",
  Box: "indigo",
  Package: "amber",
  Store: "orange",
  // 图片与视频
  Image: "pink",
  Images: "pink",
  ImagePlay: "pink",
  ImagePlus: "pink",
  Camera: "pink",
  Video: "rose",
  Clapperboard: "rose",
  Film: "rose",
  // 标签、分类
  Tag: "lime",
  Tags: "lime",
  Hash: "lime",
  // 设置、菜单与布局
  Settings: "teal",
  Settings2: "teal",
  SlidersHorizontal: "indigo",
  SlidersVertical: "indigo",
  Cog: "teal",
  Wrench: "orange",
  Menu: "sky",
  PanelsTopLeft: "sky",
  LayoutDashboard: "indigo",
  LayoutGrid: "blue",
  FolderTree: "amber",
  Folder: "amber",
  FolderOpen: "amber",
  // 导入、导出、同步
  Upload: "teal",
  Download: "teal",
  Import: "teal",
  ArrowDownToLine: "teal",
  FileUp: "teal",
  FileDown: "teal",
  ClipboardPaste: "teal",
  ClipboardList: "teal",
  Copy: "sky",
  RefreshCw: "teal",
  RotateCw: "teal",
  RotateCcw: "teal",
  Repeat: "teal",
  // 说明、测试、动作
  Info: "sky",
  CircleHelp: "sky",
  HelpCircle: "sky",
  Lightbulb: "amber",
  FlaskConical: "teal",
  TestTube: "teal",
  Zap: "orange",
  Rocket: "orange",
  Flame: "orange",
  Plus: "blue",
  CirclePlus: "blue",
  Pencil: "indigo",
  PencilLine: "indigo",
  SquarePen: "indigo",
  Eye: "sky",
  EyeOff: "sky",
  Search: "sky",
  MessageSquare: "blue",
  MessagesSquare: "blue",
  Ban: "rose",
  Trash: "rose",
  Trash2: "rose",
  TriangleAlert: "amber",
  AlertTriangle: "amber",
  CircleAlert: "rose",
  AlertCircle: "rose",
  CircleCheck: "emerald",
  CheckCircle: "emerald",
  CheckCircle2: "emerald",
  Check: "emerald",
  Power: "emerald",
  Inbox: "sky",
  SearchX: "sky",
};

/** 没登记的图标按名字散列到一个稳定的色相（避开语义上偏「危险 / 警告」的玫红与琥珀）。 */
const FALLBACK_HUES: readonly Hue[] = [
  "blue",
  "sky",
  "cyan",
  "teal",
  "emerald",
  "lime",
  "orange",
  "pink",
  "fuchsia",
  "purple",
  "violet",
  "indigo",
];

export function hueForIconName(name: string): Hue {
  const known = ICON_HUE[name];
  if (known) return known;
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return FALLBACK_HUES[hash % FALLBACK_HUES.length]!;
}

/** 组件的名字：lucide 图标在 createLucideIcon 里显式设了 displayName（压缩后仍保留）。 */
const componentName = (type: unknown): string | null => {
  if (!type || (typeof type !== "object" && typeof type !== "function")) return null;
  const named = type as { displayName?: unknown; name?: unknown };
  if (typeof named.displayName === "string" && named.displayName) return named.displayName;
  return null;
};

/**
 * 从图标节点推出色相：只认 lucide 这类带名字的图标组件；厂商 logo（img）、文字等返回 null，
 * 由调用方保持中性底色——logo 自带品牌色，底块再染色只会打架。
 */
export function hueForIcon(icon: ReactNode): Hue | null {
  if (!isValidElement(icon)) return null;
  const name = componentName(icon.type);
  return name ? hueForIconName(name) : null;
}

/**
 * 直接拿图标组件（不是元素）取无底图标的颜色类：`<Icon className={iconHueClass(Icon)} />`。
 * 用在页面标题、行内小图标这类不需要底块的地方；认不出名字时用天蓝。
 */
export function iconHueClass(icon: unknown): string {
  const name = componentName(icon);
  return HUE_GLYPH[name ? hueForIconName(name) : "sky"];
}

