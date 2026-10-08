import { useId, type ReactNode } from "react";
import { DialogIcon, type DialogTone } from "../overlays/DialogIcon";
import { cn } from "../utils/selectStyles";

/**
 * 表单分区：把一张长表单按用户的思路切成几段（基本信息 → 访问 → 限额 → 高级），
 * 每段一个小标题 + 一句说明，读的时候知道「这一段在决定什么」。
 *
 * 分区之间用细线分开而不是再套一层卡片：弹窗本身已经是一张卡片，里面再套卡片会显得重。
 * 连续的分区只在第二段起画分隔线（`first:`），调用方不用自己判断。
 */
export function FormSection({
  title,
  description,
  icon,
  tone = "auto",
  actions,
  children,
  className,
  contentClassName,
}: {
  title: ReactNode;
  description?: ReactNode;
  /** 标题前的小图标块（中性淡底），帮助扫读。 */
  icon?: ReactNode;
  /** 图标块色调，默认中性；只有危险 / 警告这类语义才需要指定。 */
  tone?: DialogTone;
  /** 标题行右侧的操作（例如「全部展开」「添加一条」）。 */
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
}) {
  const titleId = useId();
  return (
    <section
      aria-labelledby={titleId}
      data-slot="form-section"
      className={cn(
        // 分区之间靠留白分开，不再画分隔线：一张表单里每隔几行一道横线，读起来像一摞框。
        "pt-7 first:pt-0",
        className,
      )}
    >
      <header className="mb-4 flex items-start gap-2.5">
        {icon ? (
          <DialogIcon size="xs" tone={tone} className="-mt-px">
            {icon}
          </DialogIcon>
        ) : null}
        <div className="min-w-0 flex-1">
          <h3 id={titleId} className="text-sm font-semibold text-ink">
            {title}
          </h3>
          {description ? (
            <p className="mt-0.5 text-xs leading-5 text-ink-3">{description}</p>
          ) : null}
        </div>
        {actions ? <div className="shrink-0">{actions}</div> : null}
      </header>
      <div className={cn("space-y-4", contentClassName)}>{children}</div>
    </section>
  );
}
