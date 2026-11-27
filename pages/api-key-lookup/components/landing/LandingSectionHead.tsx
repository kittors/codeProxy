import { LandingFade } from "./landingMotion";

export function LandingSectionHead({
  index,
  eyebrow,
  title,
  subtitle,
  align = "left",
}: {
  index: string;
  eyebrow: string;
  title: string;
  subtitle?: string;
  align?: "left" | "center";
}) {
  const centered = align === "center";

  return (
    <LandingFade className={centered ? "mx-auto max-w-2xl text-center" : "max-w-2xl"}>
      <div
        className={[
          "flex items-center gap-3 font-display text-2xs uppercase tracking-[0.28em]",
          centered ? "justify-center" : "",
        ].join(" ")}
      >
        <span className="text-sn-label">{index}</span>
        <span className="h-px w-8 bg-sn-line-control" aria-hidden />
        <span className="tracking-[0.1em] text-sn-label3">{eyebrow}</span>
      </div>

      <h2 className="mt-6 font-display text-3xl font-bold leading-tight tracking-tight text-sn-label sm:text-4xl">
        {title}
      </h2>

      {subtitle ? (
        <p className="mt-5 text-base leading-8 text-sn-label2">{subtitle}</p>
      ) : null}
    </LandingFade>
  );
}
