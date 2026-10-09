import { lazy, Suspense, useState } from "react";
import { useTranslation } from "react-i18next";
import { Palette, RotateCcw } from "lucide-react";
import { Button, DEFAULT_APPEARANCE, Drawer, Skeleton, useAppearance } from "@code-proxy/ui";

/*
 * 顶栏右侧的「外观」入口：点开是共享的侧边抽屉，里面是全部外观设置（AppearanceSettings）。
 * 外观只改当前浏览器里的显示偏好，不属于任何一个页面，所以不占侧边栏菜单。
 *
 * 设置正文第一次打开时才加载（悬停 / 聚焦按钮时先预取），不压进外壳的首屏包。
 * 改动即时生效、立即保存，没有「未保存」状态：点遮罩直接关闭（dirty={false}），不像表单抽屉
 * 那样在输入过之后改为轻晃。
 */
const loadSettings = () => import("./AppearanceSettings");
const AppearanceSettings = lazy(loadSettings);

function SettingsFallback() {
  return (
    <div aria-hidden="true" className="space-y-4">
      <Skeleton className="h-40 w-full" rounded="lg" />
      <Skeleton className="h-28 w-full" rounded="lg" />
      <Skeleton className="h-64 w-full" rounded="lg" />
    </div>
  );
}

export function AppearanceButton({ className }: { className?: string }) {
  const { t } = useTranslation();
  const { settings, reset } = useAppearance();
  const [open, setOpen] = useState(false);
  const label = t("appearance.title");
  const isDefault = JSON.stringify(settings) === JSON.stringify(DEFAULT_APPEARANCE);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        onPointerEnter={() => void loadSettings()}
        onFocus={() => void loadSettings()}
        className={className}
        aria-label={label}
        aria-haspopup="dialog"
        aria-expanded={open}
        data-tooltip={label}
        title={label}
      >
        <Palette size={16} />
      </button>
      <Drawer
        open={open}
        title={label}
        description={t("appearance.drawer_description")}
        icon={<Palette />}
        widthClassName="w-[min(30rem,100vw)]"
        dirty={false}
        onClose={() => setOpen(false)}
        footer={
          <>
            <Button size="sm" className="mr-auto" onClick={reset} disabled={isDefault}>
              <RotateCcw size={15} />
              {t("appearance.reset")}
            </Button>
            <Button size="sm" variant="primary" onClick={() => setOpen(false)}>
              {t("appearance.done")}
            </Button>
          </>
        }
      >
        <Suspense fallback={<SettingsFallback />}>
          <AppearanceSettings />
        </Suspense>
      </Drawer>
    </>
  );
}
