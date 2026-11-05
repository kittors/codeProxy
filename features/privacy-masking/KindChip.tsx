import { useTranslation } from "react-i18next";
import { KNOWN_KINDS, kindStyle } from "./maskKinds";

/** 内置类型的名字有译文；用户规则的类型名原样显示。 */
export function useKindLabel() {
  const { t } = useTranslation();
  return (kind: string) => (KNOWN_KINDS.includes(kind) ? t(`privacy_masking.kind.${kind}`) : kind);
}

/** 类型标签：类目色的圆点、类型名，可带「×N」。 */
export function KindChip({ kind, count }: { kind: string; count?: number }) {
  const label = useKindLabel();
  const style = kindStyle(kind);
  return (
    <span className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-2xs font-medium whitespace-nowrap ${style.chip}`}>
      <span aria-hidden="true" className={`size-1.5 rounded-full ${style.dot}`} />
      {label(kind)}
      {count !== undefined ? <span className="tabular-nums opacity-80">×{count.toLocaleString()}</span> : null}
    </span>
  );
}

/** 只有类目色圆点。 */
export function KindDot({ kind }: { kind: string }) {
  return <span aria-hidden="true" className={`size-2 shrink-0 rounded-full ${kindStyle(kind).dot}`} />;
}
