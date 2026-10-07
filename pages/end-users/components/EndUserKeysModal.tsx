import { lazy, Suspense } from "react";
import { KeyRound } from "lucide-react";
import { useTranslation } from "react-i18next";
import { normalizePeriodSpendingLimits, type EndUser } from "@code-proxy/api-client";
import { Modal } from "@code-proxy/ui";

const ApiKeysPage = lazy(() =>
  import("../../api-keys/ApiKeysPage").then((m) => ({ default: m.ApiKeysPage })),
);

/**
 * 在弹窗里管理某个账号名下的全部 Key（嵌入整张 Key 管理页）。
 *
 * 没改成抽屉：里面是一张最少 1580px 宽的表，标准抽屉 / 弹窗档位都放不下，
 * 所以保留接近整屏的宽度和固定高度。里层还会再开新建、轮换、删除等弹窗，
 * 叠层栈会让 Esc 只关最上面那一层。
 */
export function EndUserKeysModal({ user, onClose }: { user: EndUser | null; onClose: () => void }) {
  const { t } = useTranslation();
  return (
    <Modal
      open={Boolean(user)}
      onClose={onClose}
      title={
        user
          ? t("end_users.manage_keys_title_for", {
              defaultValue: "管理密钥 · {{name}}",
              name: user.display_name || user.username,
            })
          : t("end_users.manage_keys_title", { defaultValue: "用户 API 密钥" })
      }
      description={t("end_users.manage_keys_desc")}
      icon={<KeyRound />}
      maxWidth="max-w-[96vw]"
      panelClassName="h-[min(90dvh,920px)]"
      bodyHeightClassName="flex-1"
      bodyOverflowClassName="overflow-hidden"
      bodyClassName="!p-0"
      // 这里只是列表，改动都在里层弹窗里各自保存；点遮罩直接关闭，不因为里层输入过内容就拦下。
      dirty={false}
    >
      {user ? (
        <Suspense
          fallback={
            <div className="flex h-full items-center justify-center text-sm text-ink-3">
              {t("common.loading_ellipsis")}
            </div>
          }
        >
          <ApiKeysPage
            endUserId={user.id}
            accountPeriodSpendingLimits={normalizePeriodSpendingLimits(
              user["period-spending-limits"],
              user["daily-spending-limit"],
            )}
            embed
          />
        </Suspense>
      ) : null}
    </Modal>
  );
}
