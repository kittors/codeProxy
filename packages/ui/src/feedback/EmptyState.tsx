import type { ReactNode } from "react";
import { EmptyArt } from "satin-ui/react";

export type EmptyStateScene = "projects" | "search" | "error" | "inbox" | "folder" | "lock";

function inferScene(title: string, description?: string): EmptyStateScene {
  const text = `${title} ${description ?? ""}`.toLowerCase();
  if (/搜索|筛选|匹配|查找|filter|search|match|query|no results/.test(text)) return "search";
  if (/失败|错误|异常|超时|error|fail|broken|unavailable/.test(text)) return "error";
  if (/权限|无权|禁止|锁定|受限|forbidden|denied|permission|lock/.test(text)) return "lock";
  if (/日志|消息|通知|告警|记录|inbox|log|alert|notification|audit/.test(text)) return "inbox";
  if (/文件|目录|导入|上传|folder|file|import|upload/.test(text)) return "folder";
  return "projects";
}

/**
 * 基于 Satin 空状态规范（.sn-empty-state + <EmptyArt />）的统一空态展示。
 *
 * - 未传 `icon` 时：使用 Satin 纯中性场景 SVG 插画（projects/search/error/inbox/folder/lock），
 *   随浅深主题自适应且绝不套杂乱的彩色装饰盒；
 * - 传入 `icon={null}` 时：仅展示标题、说明与操作按钮；
 * - 传入自定义 `icon` 时：放入 Satin `.sn-art` 双层中性容器内。
 */
export function EmptyState({
  title = "",
  description,
  icon,
  scene,
  compact = false,
  action,
}: {
  title?: string;
  description?: string;
  /** Custom icon node. Omit for Satin's contextual scene illustration; pass `null` to hide. */
  icon?: ReactNode | null;
  /** Explicit Satin EmptyArt scene override when `icon` is omitted. */
  scene?: EmptyStateScene;
  /** Compact density for tight cards or drawers. */
  compact?: boolean;
  action?: ReactNode;
}) {
  const showVisual = icon !== null;
  const resolvedScene = scene ?? inferScene(title, description);

  return (
    <div
      className={["sn-empty-state", compact ? "sn-sm" : ""].filter(Boolean).join(" ")}
      data-empty-state=""
    >
      {showVisual ? (
        icon === undefined ? (
          <div data-empty-icon="">
            <EmptyArt name={resolvedScene} />
          </div>
        ) : (
          <div className="sn-art" data-empty-icon="">
            {icon}
          </div>
        )
      ) : null}
      {title ? <h4>{title}</h4> : null}
      {description ? <p>{description}</p> : null}
      {action ? <div className="sn-acts">{action}</div> : null}
    </div>
  );
}
