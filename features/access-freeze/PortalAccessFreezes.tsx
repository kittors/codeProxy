import { useEffect, useState } from "react";
import { Lock } from "lucide-react";
import { useTranslation } from "react-i18next";
import { portalAccessFreezesApi, type PortalAccessFreeze } from "@code-proxy/api-client";
import { Callout, ProviderTag } from "@code-proxy/ui";
import { formatFreezeTime, freezeProviderName } from "./format";

/**
 * 门户里的「已冻结的上游」：登录的门户用户自己名下生效中的冻结，逐条写出网关给的说明（冻结了什么、
 * 何时、为什么、找谁解冻）。没有冻结时什么也不显示。
 *
 * 只在后端声明了 `access-freezes` 能力（enabled）时请求：面板会自动更新到仍是旧后端的部署上。门户不
 * 暴露渠道身份，接口也不返回上游账号和请求 ID；运营者自命名的上游只显示「其他上游」。
 *
 * 读不到就不显示：这是一条提示，不是用户能做什么的入口；用户被拦下时，请求的错误里也带着同一段说明。
 * 按账号 id 重新读取，切换账号后不把上一个账号的冻结留在页面上。
 */
export function PortalAccessFreezes({
  enabled,
  accountId,
}: {
  enabled: boolean;
  accountId: string;
}) {
  const { t, i18n } = useTranslation();
  const [items, setItems] = useState<PortalAccessFreeze[]>([]);

  useEffect(() => {
    setItems([]);
    if (!enabled) return;
    let cancelled = false;
    void portalAccessFreezesApi
      .list()
      .then((next) => {
        if (!cancelled) setItems(next);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [enabled, accountId]);

  if (!enabled || items.length === 0) return null;
  return (
    <section aria-label={t("access_freeze.portal_title")} data-testid="portal-access-freezes">
      <Callout tone="danger" icon={<Lock />} title={t("access_freeze.portal_title")}>
        <p className="text-ink-2">{t("access_freeze.portal_lead")}</p>
        <ul className="mt-3 divide-y divide-line">
          {items.map((item, index) => (
            <li
              key={`${index}:${item.provider}:${item.frozen_at}`}
              className="py-3 first:pt-0 last:pb-0"
            >
              <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                <ProviderTag vendor={item.provider} withLogo>
                  {freezeProviderName(t, item)}
                </ProviderTag>
                {item.frozen_at ? (
                  <span className="text-xs text-ink-3">
                    {t("access_freeze.frozen_at", {
                      time: formatFreezeTime(item.frozen_at, i18n.resolvedLanguage),
                    })}
                  </span>
                ) : null}
                {item.model ? (
                  <span className="text-xs text-ink-3">
                    {t("access_freeze.portal_model", { model: item.model })}
                  </span>
                ) : null}
              </div>
              {item.notice ? (
                <p className="mt-1.5 whitespace-pre-line leading-6 text-ink-2 [overflow-wrap:anywhere]">
                  {item.notice}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      </Callout>
    </section>
  );
}
