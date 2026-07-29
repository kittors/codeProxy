import { motion } from "framer-motion";
import { BarChart3, GaugeCircle, Layers, Repeat, ScrollText, Store } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useLandingFade } from "./landingMotion";
import { LandingRelayDiagram } from "./LandingRelayDiagram";
import { LandingSectionHead } from "./LandingSectionHead";
import type { LandingCopy, LandingFeatureCopy } from "./landingCopy";

/**
 * 卡片刻意不加边框和阴影，只用一层极淡的底色与画布拉开层次。
 * 描边 + 阴影 + 模糊叠在一起会让整页显得毛躁，留白本身就足以分区。
 */
const CARD_CLASS =
  "group relative flex flex-col overflow-hidden rounded-3xl bg-white p-8 ring-1 ring-slate-900/8 transition-colors duration-200 hover:ring-slate-900/15 dark:bg-white/[0.03] dark:ring-white/8 dark:hover:bg-white/[0.05] dark:hover:ring-white/15";

function FeatureCard({
  copy,
  icon: Icon,
  delay,
  className,
}: {
  copy: LandingFeatureCopy;
  icon: LucideIcon;
  delay: number;
  className?: string;
}) {
  const fade = useLandingFade();

  return (
    <motion.li
      {...fade({ delay })}
      className={[CARD_CLASS, className].filter(Boolean).join(" ")}
    >
      <Icon
        size={22}
        strokeWidth={1.7}
        aria-hidden
        className="text-indigo-600 transition-transform duration-200 group-hover:scale-110 dark:text-indigo-400"
      />
      <h3 className="mt-6 font-display text-lg font-bold tracking-tight text-slate-900 dark:text-white">
        {copy.title}
      </h3>
      <p className="mt-3 text-sm leading-7 text-slate-600 dark:text-white/50">{copy.desc}</p>
    </motion.li>
  );
}

export function LandingFeatures({ copy }: { copy: LandingCopy }) {
  const fade = useLandingFade();
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
        {/* 统一入口是核心卖点，占两列两行，并用示意图替代纯文字描述。 */}
        <motion.li
          {...fade({ delay: 0.04 })}
          className={`${CARD_CLASS} sm:col-span-2 lg:row-span-2`}
        >
          <Layers
            size={22}
            strokeWidth={1.7}
            aria-hidden
            className="text-indigo-600 dark:text-indigo-400"
          />
          <h3 className="mt-6 font-display text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            {features.gateway.title}
          </h3>
          <p className="mt-3 max-w-xl text-sm leading-7 text-slate-600 dark:text-white/50">
            {features.gateway.desc}
          </p>
          <LandingRelayDiagram appLabel={features.gateway.diagramLabel} />
        </motion.li>

        <FeatureCard copy={features.usage} icon={BarChart3} delay={0.08} />
        <FeatureCard copy={features.logs} icon={ScrollText} delay={0.12} />
        <FeatureCard copy={features.quota} icon={GaugeCircle} delay={0.16} />
        <FeatureCard copy={features.pool} icon={Repeat} delay={0.2} />
        <FeatureCard copy={features.plaza} icon={Store} delay={0.24} />
      </ul>
    </section>
  );
}
