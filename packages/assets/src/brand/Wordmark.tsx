import { LogoMark, type LogoMarkVariant } from "./LogoMark";

/** 品牌名唯一真源。顶栏、页脚、document.title、OG meta 都从这里取，避免各处写死后漂移。 */
export const BRAND_NAME = "CliRelay";
/** 词标拆分：`Cli` 常规字重 + `Relay` 半粗，让读者第一眼落在「Relay」这个产品语义上。 */
export const BRAND_NAME_PREFIX = "Cli";
export const BRAND_NAME_SUFFIX = "Relay";

export interface WordmarkProps {
  /** 标记的像素尺寸；文字大小由外部 className 控制，便于跟随各处排版比例。 */
  markSize?: number;
  markVariant?: LogoMarkVariant;
  className?: string;
  textClassName?: string;
  /** 词标已经把品牌名以文本呈现，标记本身默认保持装饰性，不重复播报。 */
  markClassName?: string;
}

export function Wordmark({
  markSize = 26,
  markVariant = "inline",
  className,
  textClassName,
  markClassName,
}: WordmarkProps) {
  return (
    <span className={["inline-flex items-center gap-2", className].filter(Boolean).join(" ")}>
      <LogoMark size={markSize} variant={markVariant} className={markClassName} />
      {/*
        品牌名被拆成两个字重不同的片段，读屏会当成两个词分别播报。
        用 aria-label 把它重新收敛成一个完整名称。
      */}
      <span
        aria-label={BRAND_NAME}
        className={["font-display font-normal tracking-tight", textClassName].filter(Boolean).join(" ")}
      >
        {BRAND_NAME_PREFIX}
        <span className="font-semibold">{BRAND_NAME_SUFFIX}</span>
      </span>
    </span>
  );
}
