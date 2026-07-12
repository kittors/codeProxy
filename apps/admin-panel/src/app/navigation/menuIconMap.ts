import {
  Activity,
  ArrowDownToLine,
  Bot,
  Building2,
  Circle,
  Cpu,
  ExternalLink,
  FileText,
  FolderTree,
  Image,
  Info,
  KeyRound,
  Layers,
  LayoutDashboard,
  Link2,
  Menu as MenuIcon,
  Network,
  ScrollText,
  Settings,
  ShieldCheck,
  Sparkles,
  UserRound,
  UsersRound,
  type LucideIcon,
} from "lucide-react";

/** Sidebar/seed icons only — keep this map small for the main shell chunk. */
const ICON_MAP: Record<string, LucideIcon> = {
  activity: Activity,
  "arrow-down-to-line": ArrowDownToLine,
  bot: Bot,
  "building-2": Building2,
  cpu: Cpu,
  "external-link": ExternalLink,
  file: FileText,
  "file-text": FileText,
  folder: FolderTree,
  "folder-tree": FolderTree,
  image: Image,
  info: Info,
  "key-round": KeyRound,
  layers: Layers,
  dashboard: LayoutDashboard,
  "layout-dashboard": LayoutDashboard,
  link: Link2,
  menu: MenuIcon,
  network: Network,
  "scroll-text": ScrollText,
  settings: Settings,
  "shield-check": ShieldCheck,
  sparkles: Sparkles,
  "user-round": UserRound,
  "users-round": UsersRound,
};

export function resolveMenuIcon(name: string | undefined | null): LucideIcon {
  if (!name) return Circle;
  const key = name.trim().toLowerCase().replace(/^lucide:/, "").replace(/^carbon:/, "");
  return ICON_MAP[key] ?? Circle;
}
