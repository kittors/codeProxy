import { BarChart3, GaugeCircle, Layers, Repeat, ScrollText, Store } from "@code-proxy/ui/icons";
import type { SatinIconComponent } from "@code-proxy/ui/icons";
import { LandingSectionHead } from "./LandingSectionHead";
import type { LandingCopy, LandingFeatureCopy } from "./landingCopy";

interface FeatureRow {
  index: string;
  copy: LandingFeatureCopy;
  icon: SatinIconComponent;
}

export function LandingFeatures({ copy }: { copy: LandingCopy }) {
  const { features } = copy;
  const items: FeatureRow[] = [
    { index: "01", copy: features.gateway, icon: Layers },
    { index: "02", copy: features.usage, icon: BarChart3 },
    { index: "03", copy: features.logs, icon: ScrollText },
    { index: "04", copy: features.quota, icon: GaugeCircle },
    { index: "05", copy: features.pool, icon: Repeat },
    { index: "06", copy: features.plaza, icon: Store },
  ];

  return (
    <section className="border-t border-sn-line py-16 lg:py-20">
      <div className="mx-auto w-full max-w-screen-xl px-4 sm:px-6">
        <LandingSectionHead
          index="02"
          eyebrow={features.eyebrow}
          title={features.title}
          subtitle={features.subtitle}
        />

        {/* 扁平发丝 2×3 网格（gap-px 无双边线）：消除零碎 Bento 阴影卡片海 */}
        <ul className="mt-8 grid grid-cols-1 gap-px overflow-hidden rounded-2xl border border-sn-line bg-sn-line sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => {
            const Icon = item.icon;
            return (
              <li
                key={item.index}
                className="bg-sn-raised p-6 transition-colors duration-150 hover:bg-sn-hover/60"
              >
                <div className="flex items-center justify-between text-sn-label3">
                  <Icon size={18} strokeWidth={1.7} aria-hidden className="text-sn-label" />
                  <span className="font-mono text-2xs tabular-nums">{item.index}</span>
                </div>
                <h3 className="mt-4 font-sans text-base font-semibold tracking-tight text-sn-label">
                  {item.copy.title}
                </h3>
                <p className="mt-2 text-sm leading-6 text-sn-label2">{item.copy.desc}</p>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
