import { useMemo } from "react";
import { useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { surface } from "@code-proxy/ui";
import { useAuth } from "@app/providers/AuthProvider";

export function EmbedPage() {
  const { t } = useTranslation();
  const location = useLocation();
  const {
    state: { principal },
  } = useAuth();
  const menu = useMemo(
    () => principal?.menus?.find((item) => item.path === location.pathname && item.type === "embed"),
    [location.pathname, principal?.menus],
  );
  if (!menu?.link_url) {
    return (
      <div className={`p-6 text-sm text-ink-3 ${surface({ radius: "3xl" })}`}>
        {t("identity_admin.embed_unavailable", { defaultValue: "Embed URL unavailable." })}
      </div>
    );
  }
  return (
    // 嵌入页钉满一屏：iframe 没有内容高度可言，高度只能来自外壳分配的剩余空间。
    // 内嵌页面就是这一页的内容，直接铺在外壳内容区上，不再描一圈边框。
    <iframe
      data-page-fill="always"
      title={t(menu.label_key, { defaultValue: menu.title || menu.code })}
      src={menu.link_url}
      className="w-full rounded-2xl bg-surface"
    />
  );
}
