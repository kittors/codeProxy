import { LandingSectionHead } from "./LandingSectionHead";
import type { LandingCopy } from "./landingCopy";

export function LandingWorkflow({ copy }: { copy: LandingCopy }) {
  return (
    <section className="border-t border-sn-line py-16 lg:py-20">
      <div className="mx-auto w-full max-w-screen-xl px-4 sm:px-6">
        <LandingSectionHead
          index="03"
          eyebrow={copy.workflow.eyebrow}
          title={copy.workflow.title}
          subtitle={copy.workflow.subtitle}
        />

        <ol className="mt-8 grid grid-cols-1 gap-px overflow-hidden rounded-2xl border border-sn-line bg-sn-line md:grid-cols-3">
          {copy.workflow.steps.map((step, index) => (
            <li
              key={step.title}
              className="bg-sn-raised p-6 transition-colors duration-150 hover:bg-sn-hover/60"
            >
              <span className="font-mono text-2xs font-medium tabular-nums text-sn-label3">
                {`STEP 0${index + 1}`}
              </span>
              <h3 className="mt-3 font-sans text-base font-semibold tracking-tight text-sn-label">
                {step.title}
              </h3>
              <p className="mt-2 text-sm leading-6 text-sn-label2">{step.desc}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
