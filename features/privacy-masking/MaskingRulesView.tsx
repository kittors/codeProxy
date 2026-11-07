import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Check } from "lucide-react";
import { SettingGroup, SettingRow } from "@code-proxy/ui";
import {
  privacyMaskingPortalApi,
  type MaskKindAction,
  type PortalPrivacyMaskSettings,
} from "@code-proxy/api-client";
import { KindDot, useKindLabel } from "./KindChip";
import {
  ACTION_CHIP,
  ACTION_PERSONAL_KINDS,
  ACTION_SECRET_KINDS,
  PERSONAL_CATEGORIES,
  maskCategory,
} from "./maskKinds";
import { MaskingTryIt } from "./MaskingTryIt";

// 门户的试一试只发文字，由服务器按租户的设置处理；模块级的函数引用稳定，不让试一试反复重发
const portalPreview = (text: string) => privacyMaskingPortalApi.preview(text);

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-2">
      <div className="px-1">
        <h3 className="text-sm font-semibold text-ink">{title}</h3>
        {description ? <p className="mt-0.5 text-xs text-ink-3">{description}</p> : null}
      </div>
      {children}
    </section>
  );
}

/**
 * 门户的「生效的规则」：租户管理员定的脱敏规则，只读。要不要脱敏、遮什么全由管理员决定，这里只让
 * 门户用户知道哪些类别在遮、每类怎么处理，再配一个试一试看效果。
 *
 * 数据是门户的 GET settings：租户的设置，但脱敏词、自定义规则和「从不脱敏」被服务器清空了——有意
 * 不给门户看，这里也不设法去拿，只写一句说明；actions 里另记了处理方式的脱敏词、规则类型照样列出
 * （命中时会被拦下的，用户该知道）。试一试只发文字，同样不含它们。
 */
export function MaskingRulesView({ settings }: { settings: PortalPrivacyMaskSettings }) {
  const { t } = useTranslation();
  const kindLabel = useKindLabel();
  const { policy } = settings;
  const secretsOn = policy.secrets;
  const personalOn = policy.personal;
  const actionOf = (kind: string): MaskKindAction => policy.actions[kind] ?? "mask";
  // 设置页能逐类选的那些，加上 actions 里另记了处理方式的同类类型
  const kindsOf = (category: string, base: string[]) => [
    ...base,
    ...Object.keys(policy.actions).filter(
      (kind) => maskCategory(kind) === category && !base.includes(kind),
    ),
  ];
  const otherKinds = Object.keys(policy.actions).filter((kind) => {
    const category = maskCategory(kind);
    return category === "word" || category === "rule";
  });

  const state = (on: boolean) => (
    <span
      className={[
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium",
        on
          ? "bg-violet-500/10 text-violet-700 dark:bg-violet-400/15 dark:text-violet-200"
          : "bg-ink/[0.05] text-ink-3 dark:bg-white/[0.07]",
      ].join(" ")}
    >
      <span
        aria-hidden="true"
        className={`size-1.5 rounded-full ${on ? "bg-violet-500" : "bg-ink-3"}`}
      />
      {on ? t("privacy_masking.portal.state_on") : t("privacy_masking.portal.state_off")}
    </span>
  );
  const kindActions = (kinds: string[]) => (
    <ul
      className="mt-3 flex flex-wrap gap-1.5"
      aria-label={t("privacy_masking.settings.actions_title")}
    >
      {kinds.map((kind) => {
        const action = actionOf(kind);
        return (
          <li
            key={kind}
            className="inline-flex items-center gap-1.5 rounded-full bg-ink/[0.04] py-1 pr-1 pl-2.5 text-xs text-ink-2 dark:bg-white/[0.06]"
          >
            <KindDot kind={kind} />
            {kindLabel(kind)}
            <span
              className={[
                "rounded-full px-1.5 py-0.5 text-2xs font-medium",
                action === "mask" ? "text-ink-3" : ACTION_CHIP[action],
              ].join(" ")}
            >
              {t(`privacy_masking.action.${action}`)}
            </span>
          </li>
        );
      })}
    </ul>
  );

  return (
    <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,25rem)]">
      <Section
        title={t("privacy_masking.portal.rules_title")}
        description={t("privacy_masking.portal.rules_desc")}
      >
        <SettingGroup>
          <SettingRow
            label={t("privacy_masking.facet.secret")}
            description={t("privacy_masking.settings.secrets_desc")}
            controlWidth="auto"
            control={state(secretsOn)}
          >
            {secretsOn ? kindActions(kindsOf("secret", ACTION_SECRET_KINDS)) : null}
          </SettingRow>
          <SettingRow
            label={t("privacy_masking.facet.personal")}
            description={t("privacy_masking.settings.personal_desc")}
            controlWidth="auto"
            control={state(personalOn)}
          >
            {personalOn ? (
              <>
                {kindActions(kindsOf("personal", ACTION_PERSONAL_KINDS))}
                <ul
                  className="mt-2 flex flex-wrap gap-1.5"
                  aria-label={t("privacy_masking.portal.categories")}
                >
                  {PERSONAL_CATEGORIES.filter((c) => policy.kinds[c.id] ?? c.on).map((c) => (
                    <li
                      key={c.id}
                      title={t(`privacy_masking.category.${c.id}_desc`)}
                      className="inline-flex items-center gap-1 rounded-full bg-sky-500/10 px-2.5 py-1 text-xs font-medium text-sky-700 dark:bg-sky-400/15 dark:text-sky-200"
                    >
                      <Check size={12} aria-hidden="true" />
                      {t(`privacy_masking.category.${c.id}`)}
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
          </SettingRow>
          <SettingRow
            label={t("privacy_masking.portal.hidden_title")}
            description={t("privacy_masking.portal.hidden_note")}
          >
            {otherKinds.length > 0 ? kindActions(otherKinds) : null}
          </SettingRow>
        </SettingGroup>
      </Section>

      {/* 同设置页：top 落在子标签栏下方的渐隐带以下，贴在渐隐带里会被淡掉一截 */}
      <aside className="flex flex-col gap-3 xl:sticky xl:top-20">
        <Section
          title={t("privacy_masking.try.title")}
          description={t("privacy_masking.portal.try_desc")}
        >
          <SettingGroup>
            <div className="px-4 py-3.5">
              <MaskingTryIt preview={portalPreview} stacked />
            </div>
          </SettingGroup>
        </Section>
        <p className="px-1 text-xs leading-relaxed text-ink-3">
          {t("privacy_masking.explain.where")}
        </p>
      </aside>
    </div>
  );
}
