import {
  Activity,
  ArrowDownToLine,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ArrowDown,
  Bell,
  BookOpen,
  Bot,
  Box,
  Building2,
  ChartColumn,
  Check,
  Circle,
  ClipboardList,
  Cloud,
  Code2,
  Copyright,
  Cpu,
  Database,
  ExternalLink,
  Eye,
  FileText,
  FolderTree,
  Gauge,
  Globe,
  Home,
  Image,
  Info,
  KeyRound,
  Layers,
  LayoutDashboard,
  LayoutGrid,
  Link2,
  List,
  Lock,
  Menu as MenuIcon,
  Monitor,
  Network,
  Package,
  Puzzle,
  ScrollText,
  Search,
  Server,
  Settings,
  ShieldCheck,
  Sparkles,
  Terminal,
  UserRound,
  UsersRound,
  Wrench,
  type LucideIcon,
} from "lucide-react";

export type MenuIconOption = {
  name: string;
  icon: LucideIcon;
};

export const MENU_ICON_OPTIONS: MenuIconOption[] = [
  { name: "layout-dashboard", icon: LayoutDashboard },
  { name: "activity", icon: Activity },
  { name: "monitor", icon: Monitor },
  { name: "scroll-text", icon: ScrollText },
  { name: "file-text", icon: FileText },
  { name: "folder-tree", icon: FolderTree },
  { name: "bot", icon: Bot },
  { name: "sparkles", icon: Sparkles },
  { name: "arrow-down-to-line", icon: ArrowDownToLine },
  { name: "cpu", icon: Cpu },
  { name: "image", icon: Image },
  { name: "layers", icon: Layers },
  { name: "network", icon: Network },
  { name: "building-2", icon: Building2 },
  { name: "user-round", icon: UserRound },
  { name: "users-round", icon: UsersRound },
  { name: "shield-check", icon: ShieldCheck },
  { name: "settings", icon: Settings },
  { name: "menu", icon: MenuIcon },
  { name: "info", icon: Info },
  { name: "link", icon: Link2 },
  { name: "external-link", icon: ExternalLink },
  { name: "home", icon: Home },
  { name: "search", icon: Search },
  { name: "bell", icon: Bell },
  { name: "book-open", icon: BookOpen },
  { name: "box", icon: Box },
  { name: "package", icon: Package },
  { name: "database", icon: Database },
  { name: "server", icon: Server },
  { name: "cloud", icon: Cloud },
  { name: "globe", icon: Globe },
  { name: "key-round", icon: KeyRound },
  { name: "lock", icon: Lock },
  { name: "gauge", icon: Gauge },
  { name: "chart-column", icon: ChartColumn },
  { name: "clipboard-list", icon: ClipboardList },
  { name: "list", icon: List },
  { name: "layout-grid", icon: LayoutGrid },
  { name: "code-2", icon: Code2 },
  { name: "terminal", icon: Terminal },
  { name: "puzzle", icon: Puzzle },
  { name: "wrench", icon: Wrench },
  { name: "eye", icon: Eye },
  { name: "check", icon: Check },
  { name: "copyright", icon: Copyright },
  { name: "arrow-left", icon: ArrowLeft },
  { name: "arrow-right", icon: ArrowRight },
  { name: "arrow-up", icon: ArrowUp },
  { name: "arrow-down", icon: ArrowDown },
];

const ICON_MAP: Record<string, LucideIcon> = Object.fromEntries(
  MENU_ICON_OPTIONS.map((item) => [item.name, item.icon]),
);

// aliases used by seed / legacy data
ICON_MAP.file = FileText;
ICON_MAP.folder = FolderTree;
ICON_MAP.dashboard = LayoutDashboard;

export function resolveMenuIcon(name: string | undefined | null): LucideIcon {
  if (!name) return Circle;
  const key = name.trim().toLowerCase().replace(/^lucide:/, "").replace(/^carbon:/, "");
  return ICON_MAP[key] ?? Circle;
}

export function listMenuIcons(query = ""): MenuIconOption[] {
  const q = query.trim().toLowerCase();
  if (!q) return MENU_ICON_OPTIONS;
  return MENU_ICON_OPTIONS.filter((item) => item.name.includes(q));
}
