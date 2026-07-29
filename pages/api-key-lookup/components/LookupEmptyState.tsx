import { useCallback, useMemo, useRef } from "react";
import { buildLandingCopy, type LandingTranslate } from "./landing/landingCopy";
import { LandingClosing } from "./landing/LandingClosing";
import { LandingFeatures } from "./landing/LandingFeatures";
import { LandingHero } from "./landing/LandingHero";
import { LandingProviders } from "./landing/LandingProviders";
import { LandingWorkflow } from "./landing/LandingWorkflow";

/**
 * 未登录时的公开落地页。
 *
 * 分区顺序按「先给结论、再给证据、最后给动作」排：
 * hero 讲价值 → 厂商墙给可信度 → 能力区讲差异化 → 接入区降低试用门槛 → 收尾 CTA。
 */
export function LookupEmptyState({ t, onLogin }: { t: LandingTranslate; onLogin: () => void }) {
  const providersRef = useRef<HTMLDivElement | null>(null);
  const copy = useMemo(() => buildLandingCopy(t), [t]);

  // 未登录时并没有公开的模型广场页面，所以次级 CTA 落到「已接入厂商」区块：
  // 承诺什么就展示什么，不把用户导向需要鉴权才能看的内容。
  const scrollToProviders = useCallback(() => {
    providersRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  return (
    <div data-testid="apikey-lookup-landing" className="relative w-full">
      <LandingHero copy={copy} onLogin={onLogin} onBrowseModels={scrollToProviders} />
      <div ref={providersRef} className="scroll-mt-14">
        <LandingProviders copy={copy} />
      </div>
      <LandingFeatures copy={copy} />
      <LandingWorkflow copy={copy} />
      <LandingClosing copy={copy} onLogin={onLogin} onBrowseModels={scrollToProviders} />
    </div>
  );
}
