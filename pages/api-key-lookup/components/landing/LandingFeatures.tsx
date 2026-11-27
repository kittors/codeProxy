import { BarChart3, GaugeCircle, Layers, Repeat, ScrollText, Store } from "@code-proxy/ui/icons";
import type { SatinIconComponent } from "@code-proxy/ui/icons";
import { LandingFadeItem } from "./landingMotion";
import { LandingRelayDiagram } from "./LandingRelayDiagram";
import { LandingSectionHead } from "./LandingSectionHead";
import type { LandingCopy, LandingFeatureCopy } from "./landingCopy";

const CARD_CLASS =
  "border border-sn-line group relative flex flex-col overflow-hidden rounded-2xl bg-[var(--sn-raised)] p-8 transition-shadow duration-200 hover:shadow-sn-lift";

function FeatureCard({
  copy,
  icon: Icon,
  delay,
  className,
}: {
  copy: LandingFeatureCopy;
  icon: SatinIconComponent;
  delay: number;
  className?: string;
}) {
  return (
    <LandingFadeItem
      delay={delay}
      className={[CARD_CLASS, className].filter(Boolean).join(" ")}
    >
      <Icon
        size={22}
        strokeWidth={1.7}
        aria-hidden
        className="text-sn-label transition-transform duration-200 group-hover:scale-110"
      />
      <h3 className="mt-6 font-display text-lg font-bold tracking-tight text-sn-label">{copy.title}</h3>
      <p className="mt-3 text-sm leading-7 text-sn-label2">{copy.desc}</p>
    </LandingFadeItem>
  );
}

export function LandingFeatures({ copy }: { copy: LandingCopy }) {
  const { features } = copy;

  return (
    <section className="mx-auto w-full max-w-screen-xl px-5 py-28 sm:px-8 lg:px-10 lg:py-40">
      <LandingSectionHead
        index="02"
        eyebrow={features.eyebrow}
        title={features.title}
        subtitle={features.subtitle}
      />

      <ul className="mt-16 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <LandingFadeItem
          delay={0.04}
          className={`${CARD_CLASS} sm:col-span-2 lg:row-span-2`}
        >
          <Layers
            size={22}
            strokeWidth={1.7}
            aria-hidden
            className="text-sn-label"
          />
          <h3 className="mt-6 font-display text-2xl font-bold tracking-tight text-sn-label">
            {features.gateway.title}
          </h3>
          <p className="mt-3 max-w-xl text-sm leading-7 text-sn-label2">
            {features.gateway.desc}
          </p>
          <LandingRelayDiagram appLabel={features.gateway.diagramLabel} />
        </LandingFadeItem>

        <FeatureCard copy={features.usage} icon={BarChart3} delay={0.08} />
        <FeatureCard copy={features.logs} icon={ScrollText} delay={0.12} />
        <FeatureCard copy={features.quota} icon={GaugeCircle} delay={0.16} />
        <FeatureCard copy={features.pool} icon={Repeat} delay={0.2} />
        <FeatureCard copy={features.plaza} icon={Store} delay={0.24} />
      </ul>
    </section>
  );
}
