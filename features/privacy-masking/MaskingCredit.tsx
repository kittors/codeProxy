import { Trans } from "react-i18next";

/** 致谢：识别规则、占位符和还原的做法移植自 magpie（MIT），控制台和门户都显示。 */
export function MaskingCredit() {
  return (
    <p className="px-1 text-xs leading-relaxed text-ink-3">
      <Trans
        i18nKey="privacy_masking.explain.credit"
        components={[
          <a
            key="magpie"
            href="https://github.com/yetone/magpie"
            target="_blank"
            rel="noreferrer"
            className="font-medium text-ink-2 underline decoration-ink/20 underline-offset-2 hover:text-ink"
          />,
        ]}
      />
    </p>
  );
}
