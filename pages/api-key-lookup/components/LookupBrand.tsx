import { LogoMark, Wordmark } from "@code-proxy/assets";

/**
 * 顶栏左侧的品牌区。
 *
 * 落地页面向未登录访客，展示完整词标建立品牌认知；登录后进入工作区，
 * 词标让位给当前页面名，只保留标记维持一致性。
 */
export function LookupBrand({ showLanding, title }: { showLanding: boolean; title: string }) {
  if (showLanding) {
    return (
      <Wordmark
        markSize={26}
        className="text-base text-slate-900 dark:text-white"
        textClassName="text-base"
      />
    );
  }

  return (
    <div className="flex items-center gap-2.5">
      <LogoMark size={26} />
      <span className="font-display text-base font-bold tracking-tight text-slate-900 dark:text-white">
        {title}
      </span>
    </div>
  );
}
