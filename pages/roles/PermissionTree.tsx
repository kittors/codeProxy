import { useEffect, useMemo, useState } from "react";
import { ChevronRight, FileKey2, Folder, PanelTop } from "lucide-react";
import { Button, Checkbox } from "@code-proxy/ui";
import type { MenuIdentity, PermissionIdentity } from "@code-proxy/api-client";

export interface PermissionTreeNode {
  id: string;
  kind: "directory" | "menu" | "permission";
  label: string;
  description: string;
  permissionCodes: string[];
  children: PermissionTreeNode[];
}

interface BuildPermissionTreeOptions {
  menus: MenuIdentity[];
  permissions: PermissionIdentity[];
  menuLabel: (menu: MenuIdentity) => string;
  permissionLabel: (permission: PermissionIdentity) => string;
  resourceLabel: (resource: string) => string;
}

export function buildPermissionTree({
  menus,
  permissions,
  menuLabel,
  permissionLabel,
  resourceLabel,
}: BuildPermissionTreeOptions): PermissionTreeNode[] {
  const menuByCode = new Map(menus.map((menu) => [menu.code, menu]));
  const childMenus = new Map<string, MenuIdentity[]>();
  for (const menu of menus) {
    childMenus.set(menu.parent_code, [...(childMenus.get(menu.parent_code) ?? []), menu]);
  }
  for (const children of childMenus.values()) {
    children.sort((a, b) => a.sort_order - b.sort_order || a.code.localeCompare(b.code));
  }

  const permissionsByMenu = new Map<string, PermissionIdentity[]>();
  const unmatched: PermissionIdentity[] = [];
  for (const permission of permissions) {
    if (permission.menu_code && menuByCode.has(permission.menu_code)) {
      permissionsByMenu.set(permission.menu_code, [
        ...(permissionsByMenu.get(permission.menu_code) ?? []),
        permission,
      ]);
    } else {
      unmatched.push(permission);
    }
  }

  const buildMenuNode = (menu: MenuIdentity): PermissionTreeNode | null => {
    const mapped = permissionsByMenu.get(menu.code) ?? [];
    const direct = mapped.filter((permission) => permission.code === menu.permission_code);
    const actions = mapped
      .filter((permission) => permission.code !== menu.permission_code)
      .map((permission) => ({
        id: `permission:${permission.code}`,
        kind: "permission" as const,
        label: permissionLabel(permission),
        description: permission.code,
        permissionCodes: [permission.code],
        children: [],
      }));
    const children = (childMenus.get(menu.code) ?? [])
      .map(buildMenuNode)
      .filter((node): node is PermissionTreeNode => node !== null);
    if (direct.length === 0 && actions.length === 0 && children.length === 0) return null;
    return {
      id: `menu:${menu.code}`,
      kind: menu.type,
      label: menuLabel(menu),
      description: menu.path || menu.code,
      permissionCodes: direct.map((permission) => permission.code),
      children: [...children, ...actions],
    };
  };

  const roots = (childMenus.get("") ?? [])
    .map(buildMenuNode)
    .filter((node): node is PermissionTreeNode => node !== null);

  const unmatchedByResource = new Map<string, PermissionIdentity[]>();
  for (const permission of unmatched) {
    unmatchedByResource.set(permission.resource, [
      ...(unmatchedByResource.get(permission.resource) ?? []),
      permission,
    ]);
  }
  for (const [resource, resourcePermissions] of unmatchedByResource) {
    roots.push({
      id: `resource:${resource}`,
      kind: "directory",
      label: resourceLabel(resource),
      description: resource,
      permissionCodes: [],
      children: resourcePermissions.map((permission) => ({
        id: `permission:${permission.code}`,
        kind: "permission",
        label: permissionLabel(permission),
        description: permission.code,
        permissionCodes: [permission.code],
        children: [],
      })),
    });
  }
  return roots;
}

function collectPermissionCodes(node: PermissionTreeNode): string[] {
  return [node.permissionCodes, ...node.children.map(collectPermissionCodes)].flat();
}

function collectExpandableIds(nodes: PermissionTreeNode[]): string[] {
  return nodes.flatMap((node) => [
    ...(node.children.length > 0 ? [node.id] : []),
    ...collectExpandableIds(node.children),
  ]);
}

interface PermissionTreeProps {
  nodes: PermissionTreeNode[];
  selected: Set<string>;
  disabled?: boolean;
  onChange: (selected: Set<string>) => void;
  expandLabel: string;
  collapseLabel: string;
}

export function PermissionTree({
  nodes,
  selected,
  disabled = false,
  onChange,
  expandLabel,
  collapseLabel,
}: PermissionTreeProps) {
  const expandableIds = useMemo(() => collectExpandableIds(nodes), [nodes]);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(expandableIds));

  useEffect(() => {
    setExpanded((current) => new Set([...current, ...expandableIds]));
  }, [expandableIds]);

  const renderNode = (node: PermissionTreeNode, depth: number) => {
    const codes = collectPermissionCodes(node);
    const selectedCount = codes.filter((code) => selected.has(code)).length;
    const checked = codes.length > 0 && selectedCount === codes.length;
    const indeterminate = selectedCount > 0 && !checked;
    const hasChildren = node.children.length > 0;
    const isExpanded = expanded.has(node.id);
    const Icon = node.kind === "directory" ? Folder : node.kind === "menu" ? PanelTop : FileKey2;

    return (
      <li
        key={node.id}
        role="treeitem"
        aria-level={depth + 1}
        aria-expanded={hasChildren ? isExpanded : undefined}
      >
        <div
          className="flex min-h-11 items-center gap-2 border-b border-black/[0.045] px-3 py-2 last:border-b-0 hover:bg-slate-50/80 dark:border-white/[0.055] dark:hover:bg-white/[0.035]"
          style={{ paddingLeft: 12 + depth * 24 }}
        >
          {hasChildren ? (
            <Button
              size="xs"
              variant="ghost"
              tooltip={isExpanded ? collapseLabel : expandLabel}
              onClick={() => {
                setExpanded((current) => {
                  const next = new Set(current);
                  if (isExpanded) next.delete(node.id);
                  else next.add(node.id);
                  return next;
                });
              }}
            >
              <ChevronRight
                size={15}
                className={isExpanded ? "rotate-90 transition-transform" : "transition-transform"}
              />
            </Button>
          ) : (
            <span className="h-7 w-7" aria-hidden="true" />
          )}
          <Checkbox
            checked={checked}
            indeterminate={indeterminate}
            disabled={disabled || codes.length === 0}
            aria-label={node.label}
            onCheckedChange={(nextChecked) => {
              const next = new Set(selected);
              for (const code of codes) {
                if (nextChecked) next.add(code);
                else next.delete(code);
              }
              onChange(next);
            }}
          />
          <Icon size={15} className="shrink-0 text-slate-400" aria-hidden="true" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium text-slate-800 dark:text-slate-200">
              {node.label}
            </span>
            <span className="block truncate text-xs text-slate-400">{node.description}</span>
          </span>
        </div>
        {hasChildren && isExpanded ? (
          <ul role="group">{node.children.map((child) => renderNode(child, depth + 1))}</ul>
        ) : null}
      </li>
    );
  };

  return (
    <ul
      role="tree"
      className="overflow-hidden rounded-2xl bg-slate-50/70 ring-1 ring-black/[0.045] dark:bg-white/[0.025] dark:ring-white/[0.055]"
    >
      {nodes.map((node) => renderNode(node, 0))}
    </ul>
  );
}
