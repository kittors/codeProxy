import { lazy, Suspense, useState } from "react";
import { useTranslation } from "react-i18next";
import { Route } from "lucide-react";
import { Button } from "@code-proxy/ui";
import type { SimulatorPathRoute } from "./RoutingSimulatorDialog";

// 弹窗连同结果表格只在点开时加载，分组页本身不变重。
const RoutingSimulatorDialog = lazy(() =>
  import("./RoutingSimulatorDialog").then((module) => ({ default: module.RoutingSimulatorDialog })),
);

export function RoutingSimulatorButton({
  pathRoutes,
  disabled,
}: {
  pathRoutes: SimulatorPathRoute[];
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  // 第一次打开后保持挂载，关闭时弹窗才能播完退场动画。
  const [mounted, setMounted] = useState(false);
  return (
    <>
      <Button
        size="sm"
        onClick={() => {
          setMounted(true);
          setOpen(true);
        }}
        disabled={disabled}
      >
        <Route size={14} />
        {t("channel_groups_page.simulator.open")}
      </Button>
      {mounted ? (
        <Suspense fallback={null}>
          <RoutingSimulatorDialog
            open={open}
            pathRoutes={pathRoutes}
            onClose={() => setOpen(false)}
          />
        </Suspense>
      ) : null}
    </>
  );
}
