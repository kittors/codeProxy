import { type ReactNode } from "react";
import { surface } from "@code-proxy/ui";

type ProviderWorkspaceProps = {
  title: string;
  description: string;
  count: number;
  children: ReactNode;
  actions?: ReactNode;
};

export function ProviderWorkspace({
  title,
  description,
  count,
  children,
  actions,
}: ProviderWorkspaceProps) {
  return (
    // 卡片外观来自 surface()（伪元素细边 + 投影），标题区和正文之间靠留白分开，不画分隔线。
    <section className={`flex min-h-0 flex-1 flex-col ${surface()}`}>
      <header className="flex flex-wrap items-center justify-between gap-2 px-4 pt-4 pb-1">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate text-sm font-semibold text-ink">
              {title}
            </h3>
            {count > 0 ? (
              <span className="text-xs text-ink-3">{count}</span>
            ) : null}
          </div>
          <p className="mt-0.5 text-xs text-ink-3">{description}</p>
        </div>
        {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
      </header>
      <div className="min-h-0 flex-1 overflow-hidden p-4">{children}</div>
    </section>
  );
}
