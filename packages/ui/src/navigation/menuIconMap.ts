import { createElement, type ComponentProps, type ComponentType } from "react";
import { Icon } from "satin-ui/react";

type SatinIconName = ComponentProps<typeof Icon>["name"];

export interface MenuIconProps {
  size?: number | string;
  strokeWidth?: number | string;
  className?: string;
  "aria-hidden"?: boolean | "true" | "false";
}

export type MenuIconComponent = ComponentType<MenuIconProps> & {
  displayName?: string;
};

/**
 * 将 Satin Solar 图标封装为与原菜单组件签名一致的轻组件，并显式写入 `displayName`：
 * 这样 `hueForIconName`、`iconHueClass` 与侧边栏多色方案继续按语义名稳定取色，不因构建压缩失效。
 */
function makeSatinMenuIcon(name: SatinIconName, displayName: string): MenuIconComponent {
  const SatinMenuIcon: MenuIconComponent = ({ size = 16, className }) =>
    createElement(Icon, {
      name,
      size: typeof size === "string" ? Number(size) || 16 : size,
      className,
    });
  SatinMenuIcon.displayName = displayName;
  return SatinMenuIcon;
}

const ActivityIcon = makeSatinMenuIcon("activity", "Activity");
const ArrowDownToLineIcon = makeSatinMenuIcon("download", "ArrowDownToLine");
const BellIcon = makeSatinMenuIcon("bell", "Bell");
const BotIcon = makeSatinMenuIcon("component", "Bot");
const Building2Icon = makeSatinMenuIcon("house", "Building2");
const CircleFallbackIcon = makeSatinMenuIcon("circle-dashed", "Circle");
const CpuIcon = makeSatinMenuIcon("cpu", "Cpu");
const ExternalLinkIcon = makeSatinMenuIcon("external-link", "ExternalLink");
const FileTextIcon = makeSatinMenuIcon("file-text", "FileText");
const FolderTreeIcon = makeSatinMenuIcon("folder", "FolderTree");
const ImageIcon = makeSatinMenuIcon("image", "Image");
const InfoIcon = makeSatinMenuIcon("info", "Info");
const KeyRoundIcon = makeSatinMenuIcon("key-round", "KeyRound");
const LayersIcon = makeSatinMenuIcon("layers", "Layers");
const LayoutDashboardIcon = makeSatinMenuIcon("layout-dashboard", "LayoutDashboard");
const Link2Icon = makeSatinMenuIcon("link", "Link2");
const MenuGlyphIcon = makeSatinMenuIcon("menu", "Menu");
const NetworkIcon = makeSatinMenuIcon("workflow", "Network");
const ScrollTextIcon = makeSatinMenuIcon("clipboard", "ScrollText");
const SettingsIcon = makeSatinMenuIcon("settings", "Settings");
const ShieldAlertIcon = makeSatinMenuIcon("shield", "ShieldAlert");
const ShieldBanIcon = makeSatinMenuIcon("shield", "ShieldBan");
const ShieldCheckIcon = makeSatinMenuIcon("shield", "ShieldCheck");
const SparklesIcon = makeSatinMenuIcon("sparkles", "Sparkles");
const StoreIcon = makeSatinMenuIcon("layout-grid", "Store");
const UserRoundIcon = makeSatinMenuIcon("user", "UserRound");
const UsersRoundIcon = makeSatinMenuIcon("users", "UsersRound");
const VideoIcon = makeSatinMenuIcon("clapperboard", "Video");
const WalletIcon = makeSatinMenuIcon("credit-card", "Wallet");

/** Sidebar/seed icons only — keep this map small for the main shell chunk. */
const ICON_MAP: Record<string, MenuIconComponent> = {
  activity: ActivityIcon,
  "arrow-down-to-line": ArrowDownToLineIcon,
  bell: BellIcon,
  bot: BotIcon,
  "building-2": Building2Icon,
  cpu: CpuIcon,
  "external-link": ExternalLinkIcon,
  file: FileTextIcon,
  "file-text": FileTextIcon,
  folder: FolderTreeIcon,
  "folder-tree": FolderTreeIcon,
  image: ImageIcon,
  info: InfoIcon,
  "key-round": KeyRoundIcon,
  layers: LayersIcon,
  dashboard: LayoutDashboardIcon,
  "layout-dashboard": LayoutDashboardIcon,
  link: Link2Icon,
  menu: MenuGlyphIcon,
  network: NetworkIcon,
  "scroll-text": ScrollTextIcon,
  settings: SettingsIcon,
  "shield-alert": ShieldAlertIcon,
  "shield-ban": ShieldBanIcon,
  "shield-check": ShieldCheckIcon,
  sparkles: SparklesIcon,
  store: StoreIcon,
  "user-round": UserRoundIcon,
  "users-round": UsersRoundIcon,
  video: VideoIcon,
  wallet: WalletIcon,
};

export function resolveMenuIcon(name: string | undefined | null): MenuIconComponent {
  if (!name) return CircleFallbackIcon;
  const key = name.trim().toLowerCase().replace(/^lucide:/, "").replace(/^carbon:/, "");
  return ICON_MAP[key] ?? CircleFallbackIcon;
}
