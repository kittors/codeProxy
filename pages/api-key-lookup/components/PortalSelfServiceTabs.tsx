import { lazy, Suspense, useState } from "react";
import { useTranslation } from "react-i18next";
import { PageLoader } from "@code-proxy/ui";
import type { PortalGrants } from "../portalGrants";
import type { ApiKeyLookupTab } from "./LookupResultsToolbar";
import { PortalWordsTab } from "./PortalWordsTab";

// 脱敏的整套界面（约 17 kB gzip）只在第一次点开标签时下载：门户页还给没登录的访客画落地页，
// 登录的大多也只看用量。
const PrivacyMaskingWorkspace = lazy(() =>
  import("@features/privacy-masking").then((module) => ({
    default: module.PrivacyMaskingWorkspace,
  })),
);

/**
 * 门户账号自己设置的两个标签：敏感词、隐私脱敏。都是一直挂着、只在当前标签时显示：切到别的标签
 * 再回来，未保存的修改还在。页面按账号给它 key，切换账号时整个换掉，不把上一个账号的草稿留下。
 *
 * 隐私脱敏第一次点开才挂上：概览每 15 秒刷新一次记录，不能让每个只看用量的门户用户都在后台查库；
 * 挂上之后切走也只是停下刷新。
 */
export function PortalSelfServiceTabs({
  activeTab,
  grants,
}: {
  activeTab: ApiKeyLookupTab;
  grants: PortalGrants;
}) {
  const { t } = useTranslation();
  const [privacyOpened, setPrivacyOpened] = useState(false);
  if (activeTab === "privacy" && grants.privacyMasking !== null && !privacyOpened)
    setPrivacyOpened(true);

  return (
    <>
      {grants.words ? (
        <div hidden={activeTab !== "words"} className="flex flex-col md:min-h-0 md:flex-1">
          <PortalWordsTab />
        </div>
      ) : null}
      {grants.privacyMasking !== null && privacyOpened ? (
        // 桌面上是这个标签自己的滚动区（钉满一屏，见 lookupLayout.ts）；左右各借出 main 的内边距，
        // 子标签栏的底色才能铺到边、卡片投影不被滚动区裁掉
        <div
          hidden={activeTab !== "privacy"}
          className="-mx-4 flex flex-col px-4 sm:-mx-6 sm:px-6 md:min-h-0 md:flex-1 md:overflow-y-auto"
        >
          <Suspense
            fallback={
              <div className="flex items-center justify-center py-16">
                <PageLoader variant="inline" text={t("common.loading")} />
              </div>
            }
          >
            {/* 能不能改以设置接口返回的 allowed 为准，/auth/me 那个可能已经过时 */}
            <PrivacyMaskingWorkspace scope="portal" canWrite active={activeTab === "privacy"} />
          </Suspense>
        </div>
      ) : null}
    </>
  );
}
