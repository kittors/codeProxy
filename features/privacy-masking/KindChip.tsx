import { useTranslation } from "react-i18next";
import { KNOWN_KINDS, kindStyle } from "./maskKinds";

/** 内置类型的名字有译文；用户规则的类型名原样显示。 */
export function useKindLabel() {
  const { t } = useTranslation();
  return (kind: string) => (KNOWN_KINDS.includes(kind) ? t(`privacy_masking.kind.${kind}`) : kind);
}

/**
 * 类型标签：类目色的圆点、类型名，可带「×N」。
 *
 * 放进定宽的列里（请求列表的标签列、按值排行的类型列）时不能把列撑破：最宽不超过父容器，放不下时
 * 只截类型名（俄文「Имя пользователя」这类长名），圆点和计数总在，悬停看全名。
 */
export function KindChip({ kind, count }: { kind: string; count?: number }) {
  const label = useKindLabel();
  const style = kindStyle(kind);
  const name = label(kind);
  return (
    <span
      title={name}
      className={`inline-flex max-w-full min-w-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-2xs font-medium whitespace-nowrap ${style.chip}`}
    >
      <span aria-hidden="true" className={`size-1.5 shrink-0 rounded-full ${style.dot}`} />
      <span className="truncate">{name}</span>
      {count !== undefined ? <span className="shrink-0 tabular-nums opacity-80">×{count.toLocaleString()}</span> : null}
    </span>
  );
}

/** 只有类目色圆点。 */
export function KindDot({ kind }: { kind: string }) {
  return <span aria-hidden="true" className={`size-2 shrink-0 rounded-full ${kindStyle(kind).dot}`} />;
}
