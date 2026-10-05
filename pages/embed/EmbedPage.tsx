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
    <iframe
      title={t(menu.label_key, { defaultValue: menu.title || menu.code })}
      src={menu.link_url}
      className="h-[calc(100dvh-140px)] min-h-[420px] w-full rounded-2xl border border-line bg-surface"
    />
  );
}
