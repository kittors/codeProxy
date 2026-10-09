import { isValidElement, type ReactNode } from "react";

/**
 * 全站色相体系。
 *
 * 每个图标有自己的色相：用于「认出这是什么」（用户是蓝、权限是紫、密钥是琥珀……），不表达好坏——
 * 侧边栏的几个顶层分组（仪表盘靛蓝、运行观测翠绿、接入与凭证紫、模型与调度橙、组织与权限蓝、
 * 系统设置蓝绿、系统信息天蓝）彼此不撞色，调整注册表时注意保持这一点——
 * 危险 / 警告 / 完成仍然只用 DialogIcon 的 danger / warning / success 语义色调。
 *
 * 着色受「外观」设置控制（见 theme/appearance.ts 与 styles/index.css 顶部的变体说明）：
 * - 图标块、无底图标、实色块、按钮图标（HUE_TILE / GLYPH / SOLID / BUTTON_ICON）挂在
 *   `icon-hue:` 变体上——图标着色选「多彩」时生效，选「单色」时落回调用方写的中性基础类；
 * - 淡底胶囊、小圆点（HUE_SOFT / DOT）是页面里的装饰色，挂在 `colorful:` 变体上，跟随配色风格。
 * 所以这里的类名只是「多彩时叠上去的那一层」，调用方必须自己写中性的基础类（例如图标的
 * text-ink-3、图标块的淡灰底），否则单色 / 简约时元素没有颜色可落。
 *
 * 不画描边：盒子的边一律由阴影表达（见 index.css 的 .cp-edge），图标块只用同色系渐变淡底。
 * 图标块先把基础类的淡灰底清成透明，渐变才不会叠在灰底上发脏。
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

/** 图标块（多彩时）：同色系由浓到淡的渐变底 + 饱和的图标色。 */
export const HUE_TILE: Record<Hue, string> = {
  blue: "icon-hue:bg-transparent icon-hue:bg-gradient-to-b icon-hue:from-blue-500/[0.14] icon-hue:to-blue-500/[0.06] icon-hue:text-blue-600 icon-hue:dark:from-blue-400/20 icon-hue:dark:to-blue-400/10 icon-hue:dark:text-blue-300",
  sky: "icon-hue:bg-transparent icon-hue:bg-gradient-to-b icon-hue:from-sky-500/[0.14] icon-hue:to-sky-500/[0.06] icon-hue:text-sky-600 icon-hue:dark:from-sky-400/20 icon-hue:dark:to-sky-400/10 icon-hue:dark:text-sky-300",
  cyan: "icon-hue:bg-transparent icon-hue:bg-gradient-to-b icon-hue:from-cyan-500/[0.14] icon-hue:to-cyan-500/[0.06] icon-hue:text-cyan-600 icon-hue:dark:from-cyan-400/20 icon-hue:dark:to-cyan-400/10 icon-hue:dark:text-cyan-300",
  teal: "icon-hue:bg-transparent icon-hue:bg-gradient-to-b icon-hue:from-teal-500/[0.14] icon-hue:to-teal-500/[0.06] icon-hue:text-teal-600 icon-hue:dark:from-teal-400/20 icon-hue:dark:to-teal-400/10 icon-hue:dark:text-teal-300",
  emerald:
    "icon-hue:bg-transparent icon-hue:bg-gradient-to-b icon-hue:from-emerald-500/[0.14] icon-hue:to-emerald-500/[0.06] icon-hue:text-emerald-600 icon-hue:dark:from-emerald-400/20 icon-hue:dark:to-emerald-400/10 icon-hue:dark:text-emerald-300",
  lime: "icon-hue:bg-transparent icon-hue:bg-gradient-to-b icon-hue:from-lime-500/[0.16] icon-hue:to-lime-500/[0.07] icon-hue:text-lime-700 icon-hue:dark:from-lime-400/20 icon-hue:dark:to-lime-400/10 icon-hue:dark:text-lime-300",
  amber:
    "icon-hue:bg-transparent icon-hue:bg-gradient-to-b icon-hue:from-amber-500/[0.16] icon-hue:to-amber-500/[0.07] icon-hue:text-amber-600 icon-hue:dark:from-amber-400/20 icon-hue:dark:to-amber-400/10 icon-hue:dark:text-amber-300",
  orange:
    "icon-hue:bg-transparent icon-hue:bg-gradient-to-b icon-hue:from-orange-500/[0.14] icon-hue:to-orange-500/[0.06] icon-hue:text-orange-600 icon-hue:dark:from-orange-400/20 icon-hue:dark:to-orange-400/10 icon-hue:dark:text-orange-300",
  rose: "icon-hue:bg-transparent icon-hue:bg-gradient-to-b icon-hue:from-rose-500/[0.13] icon-hue:to-rose-500/[0.05] icon-hue:text-rose-600 icon-hue:dark:from-rose-400/20 icon-hue:dark:to-rose-400/10 icon-hue:dark:text-rose-300",
  pink: "icon-hue:bg-transparent icon-hue:bg-gradient-to-b icon-hue:from-pink-500/[0.13] icon-hue:to-pink-500/[0.05] icon-hue:text-pink-600 icon-hue:dark:from-pink-400/20 icon-hue:dark:to-pink-400/10 icon-hue:dark:text-pink-300",
  fuchsia:
    "icon-hue:bg-transparent icon-hue:bg-gradient-to-b icon-hue:from-fuchsia-500/[0.13] icon-hue:to-fuchsia-500/[0.05] icon-hue:text-fuchsia-600 icon-hue:dark:from-fuchsia-400/20 icon-hue:dark:to-fuchsia-400/10 icon-hue:dark:text-fuchsia-300",
  purple:
    "icon-hue:bg-transparent icon-hue:bg-gradient-to-b icon-hue:from-purple-500/[0.13] icon-hue:to-purple-500/[0.05] icon-hue:text-purple-600 icon-hue:dark:from-purple-400/20 icon-hue:dark:to-purple-400/10 icon-hue:dark:text-purple-300",
  violet:
    "icon-hue:bg-transparent icon-hue:bg-gradient-to-b icon-hue:from-violet-500/[0.13] icon-hue:to-violet-500/[0.05] icon-hue:text-violet-600 icon-hue:dark:from-violet-400/20 icon-hue:dark:to-violet-400/10 icon-hue:dark:text-violet-300",
  indigo:
    "icon-hue:bg-transparent icon-hue:bg-gradient-to-b icon-hue:from-indigo-500/[0.13] icon-hue:to-indigo-500/[0.05] icon-hue:text-indigo-600 icon-hue:dark:from-indigo-400/20 icon-hue:dark:to-indigo-400/10 icon-hue:dark:text-indigo-300",
};

/** 不带底块的彩色图标（侧边栏、行内小图标）。基础类由调用方给（通常是 text-ink-3）。 */
export const HUE_GLYPH: Record<Hue, string> = {
  blue: "icon-hue:text-blue-500 icon-hue:dark:text-blue-400",
  sky: "icon-hue:text-sky-500 icon-hue:dark:text-sky-400",
  cyan: "icon-hue:text-cyan-500 icon-hue:dark:text-cyan-400",
  teal: "icon-hue:text-teal-500 icon-hue:dark:text-teal-400",
  emerald: "icon-hue:text-emerald-500 icon-hue:dark:text-emerald-400",
  lime: "icon-hue:text-lime-600 icon-hue:dark:text-lime-400",
  amber: "icon-hue:text-amber-500 icon-hue:dark:text-amber-400",
  orange: "icon-hue:text-orange-500 icon-hue:dark:text-orange-400",
  rose: "icon-hue:text-rose-500 icon-hue:dark:text-rose-400",
  pink: "icon-hue:text-pink-500 icon-hue:dark:text-pink-400",
  fuchsia: "icon-hue:text-fuchsia-500 icon-hue:dark:text-fuchsia-400",
  purple: "icon-hue:text-purple-500 icon-hue:dark:text-purple-400",
  violet: "icon-hue:text-violet-500 icon-hue:dark:text-violet-400",
  indigo: "icon-hue:text-indigo-500 icon-hue:dark:text-indigo-400",
};

/** 淡底胶囊（标签、计数、选中的分区胶囊）：叠在 HUE_SOFT_BASE 这类中性淡底上。 */
export const HUE_SOFT: Record<Hue, string> = {
  blue: "colorful:bg-blue-500/10 colorful:text-blue-700 colorful:dark:bg-blue-400/15 colorful:dark:text-blue-300",
  sky: "colorful:bg-sky-500/10 colorful:text-sky-700 colorful:dark:bg-sky-400/15 colorful:dark:text-sky-300",
  cyan: "colorful:bg-cyan-500/10 colorful:text-cyan-700 colorful:dark:bg-cyan-400/15 colorful:dark:text-cyan-300",
  teal: "colorful:bg-teal-500/10 colorful:text-teal-700 colorful:dark:bg-teal-400/15 colorful:dark:text-teal-300",
  emerald: "colorful:bg-emerald-500/10 colorful:text-emerald-700 colorful:dark:bg-emerald-400/15 colorful:dark:text-emerald-300",
  lime: "colorful:bg-lime-500/15 colorful:text-lime-800 colorful:dark:bg-lime-400/15 colorful:dark:text-lime-300",
  amber: "colorful:bg-amber-500/10 colorful:text-amber-700 colorful:dark:bg-amber-400/15 colorful:dark:text-amber-300",
  orange: "colorful:bg-orange-500/10 colorful:text-orange-700 colorful:dark:bg-orange-400/15 colorful:dark:text-orange-300",
  rose: "colorful:bg-rose-500/10 colorful:text-rose-700 colorful:dark:bg-rose-400/15 colorful:dark:text-rose-300",
  pink: "colorful:bg-pink-500/10 colorful:text-pink-700 colorful:dark:bg-pink-400/15 colorful:dark:text-pink-300",
  fuchsia: "colorful:bg-fuchsia-500/10 colorful:text-fuchsia-700 colorful:dark:bg-fuchsia-400/15 colorful:dark:text-fuchsia-300",
  purple: "colorful:bg-purple-500/10 colorful:text-purple-700 colorful:dark:bg-purple-400/15 colorful:dark:text-purple-300",
  violet: "colorful:bg-violet-500/10 colorful:text-violet-700 colorful:dark:bg-violet-400/15 colorful:dark:text-violet-300",
  indigo: "colorful:bg-indigo-500/10 colorful:text-indigo-700 colorful:dark:bg-indigo-400/15 colorful:dark:text-indigo-300",
};

/** HUE_SOFT 叠上去之前的中性淡底（简约风格下胶囊就是这个样子）。 */
export const HUE_SOFT_BASE = "bg-ink/[0.05] text-ink-2 dark:bg-white/[0.07]";

/** 小圆点（有改动、状态点）。 */
export const HUE_DOT: Record<Hue, string> = {
  blue: "colorful:bg-blue-500",
  sky: "colorful:bg-sky-500",
  cyan: "colorful:bg-cyan-500",
  teal: "colorful:bg-teal-500",
  emerald: "colorful:bg-emerald-500",
  lime: "colorful:bg-lime-500",
  amber: "colorful:bg-amber-500",
  orange: "colorful:bg-orange-500",
  rose: "colorful:bg-rose-500",
  pink: "colorful:bg-pink-500",
  fuchsia: "colorful:bg-fuchsia-500",
  purple: "colorful:bg-purple-500",
  violet: "colorful:bg-violet-500",
  indigo: "colorful:bg-indigo-500",
};

/** 实色渐变块（选中的分组页签、强调按钮的图标底）：白色图标压在上面。 */
export const HUE_SOLID: Record<Hue, string> = {
  blue: "icon-hue:bg-gradient-to-br icon-hue:from-blue-400 icon-hue:to-blue-600 icon-hue:text-white",
  sky: "icon-hue:bg-gradient-to-br icon-hue:from-sky-400 icon-hue:to-sky-600 icon-hue:text-white",
  cyan: "icon-hue:bg-gradient-to-br icon-hue:from-cyan-400 icon-hue:to-cyan-600 icon-hue:text-white",
  teal: "icon-hue:bg-gradient-to-br icon-hue:from-teal-400 icon-hue:to-teal-600 icon-hue:text-white",
  emerald: "icon-hue:bg-gradient-to-br icon-hue:from-emerald-400 icon-hue:to-emerald-600 icon-hue:text-white",
  lime: "icon-hue:bg-gradient-to-br icon-hue:from-lime-400 icon-hue:to-lime-600 icon-hue:text-white",
  amber: "icon-hue:bg-gradient-to-br icon-hue:from-amber-400 icon-hue:to-orange-500 icon-hue:text-white",
  orange: "icon-hue:bg-gradient-to-br icon-hue:from-orange-400 icon-hue:to-orange-600 icon-hue:text-white",
  rose: "icon-hue:bg-gradient-to-br icon-hue:from-rose-400 icon-hue:to-rose-600 icon-hue:text-white",
  pink: "icon-hue:bg-gradient-to-br icon-hue:from-pink-400 icon-hue:to-pink-600 icon-hue:text-white",
  fuchsia: "icon-hue:bg-gradient-to-br icon-hue:from-fuchsia-400 icon-hue:to-fuchsia-600 icon-hue:text-white",
  purple: "icon-hue:bg-gradient-to-br icon-hue:from-purple-400 icon-hue:to-purple-600 icon-hue:text-white",
  violet: "icon-hue:bg-gradient-to-br icon-hue:from-violet-400 icon-hue:to-violet-600 icon-hue:text-white",
  indigo: "icon-hue:bg-gradient-to-br icon-hue:from-indigo-400 icon-hue:to-indigo-600 icon-hue:text-white",
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
  Palette: "pink",
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

/**
 * 不上色的图标：关闭、展开 / 收起箭头、拖拽手柄、「更多」、加载圈这类纯操作提示，
 * 它们不代表任何「东西」，染上颜色只会让一排按钮花掉。
 */
const NEUTRAL_ICONS = new Set([
  "X",
  "XIcon",
  "ChevronDown",
  "ChevronUp",
  "ChevronLeft",
  "ChevronRight",
  "ChevronsLeft",
  "ChevronsRight",
  "ChevronsUpDown",
  "ChevronsDownUp",
  "ArrowLeft",
  "ArrowRight",
  "ArrowUp",
  "ArrowDown",
  "ArrowUpDown",
  "MoreHorizontal",
  "MoreVertical",
  "Ellipsis",
  "EllipsisVertical",
  "GripVertical",
  "GripHorizontal",
  "Minus",
  "PanelLeft",
  "PanelLeftClose",
  "PanelLeftOpen",
  "Loader",
  "Loader2",
  "LoaderCircle",
  "Dot",
]);

export const isNeutralIconName = (name: string) => NEUTRAL_ICONS.has(name);

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
  if (!name || isNeutralIconName(name)) return null;
  return hueForIconName(name);
}

/**
 * 按钮里的图标上色（图标按钮、带图标的次要按钮）：只改按钮里 lucide 图标的颜色，文字仍是中性色。
 * 用后代选择器而不是改按钮的 text 色——按钮的文字色与悬停色各变体自己管，不和它们抢优先级。
 */
export const HUE_BUTTON_ICON: Record<Hue, string> = {
  blue: "icon-hue:[&_svg.lucide]:text-blue-500 icon-hue:dark:[&_svg.lucide]:text-blue-400",
  sky: "icon-hue:[&_svg.lucide]:text-sky-500 icon-hue:dark:[&_svg.lucide]:text-sky-400",
  cyan: "icon-hue:[&_svg.lucide]:text-cyan-500 icon-hue:dark:[&_svg.lucide]:text-cyan-400",
  teal: "icon-hue:[&_svg.lucide]:text-teal-500 icon-hue:dark:[&_svg.lucide]:text-teal-400",
  emerald: "icon-hue:[&_svg.lucide]:text-emerald-500 icon-hue:dark:[&_svg.lucide]:text-emerald-400",
  lime: "icon-hue:[&_svg.lucide]:text-lime-600 icon-hue:dark:[&_svg.lucide]:text-lime-400",
  amber: "icon-hue:[&_svg.lucide]:text-amber-500 icon-hue:dark:[&_svg.lucide]:text-amber-400",
  orange: "icon-hue:[&_svg.lucide]:text-orange-500 icon-hue:dark:[&_svg.lucide]:text-orange-400",
  rose: "icon-hue:[&_svg.lucide]:text-rose-500 icon-hue:dark:[&_svg.lucide]:text-rose-400",
  pink: "icon-hue:[&_svg.lucide]:text-pink-500 icon-hue:dark:[&_svg.lucide]:text-pink-400",
  fuchsia: "icon-hue:[&_svg.lucide]:text-fuchsia-500 icon-hue:dark:[&_svg.lucide]:text-fuchsia-400",
  purple: "icon-hue:[&_svg.lucide]:text-purple-500 icon-hue:dark:[&_svg.lucide]:text-purple-400",
  violet: "icon-hue:[&_svg.lucide]:text-violet-500 icon-hue:dark:[&_svg.lucide]:text-violet-400",
  indigo: "icon-hue:[&_svg.lucide]:text-indigo-500 icon-hue:dark:[&_svg.lucide]:text-indigo-400",
};

/**
 * 直接拿图标组件（不是元素）取无底图标的颜色类：`<Icon className={cn("text-ink-3", iconHueClass(Icon))} />`。
 * 用在页面标题、行内小图标这类不需要底块的地方；认不出名字时用天蓝，纯操作提示类图标返回空串
 * （保持调用方的中性色）。
 */
export function iconHueClass(icon: unknown): string {
  const name = componentName(icon);
  if (name && isNeutralIconName(name)) return "";
  return HUE_GLYPH[name ? hueForIconName(name) : "sky"];
}

