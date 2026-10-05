import { useEffect, useRef, useState, useSyncExternalStore, type ComponentType } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { CircleAlert, CircleCheck, Info, TriangleAlert, type LucideProps } from "lucide-react";
import { useTranslation } from "react-i18next";
import { EASE_IN, EASE_OUT, EASE_POP } from "../utils/motion";
import {
  dismissToast,
  getToasts,
  subscribeToasts,
  updateToast,
  type ToastRecord,
  type ToastType,
} from "./toastStore";

/** 撤销成功后的确认提示停留多久。 */
const SUCCESS_LABEL_DURATION_MS = 1800;

/**
 * 状态只体现在图标颜色上，胶囊本身始终是中性的实心底。
 * 胶囊在浅色界面里是深色（深色界面里反转成浅色），所以图标取对应底色上更亮/更深的一档。
 */
const STATUS_ICON: Record<Exclude<ToastType, "default">, {
  Icon: ComponentType<LucideProps>;
  className: string;
}> = {
  success: { Icon: CircleCheck, className: "text-emerald-400 dark:text-emerald-600" },
  error: { Icon: CircleAlert, className: "text-rose-400 dark:text-rose-600" },
  warning: { Icon: TriangleAlert, className: "text-amber-400 dark:text-amber-600" },
  info: { Icon: Info, className: "opacity-70" },
};

/**
 * 顶部居中的提示条：深色实心胶囊（深色模式反转），新的一条出现在最上面。
 *
 * 放在顶部而不是底部：视线落在页面上方的标题和表单上，底部的提示容易被忽略，
 * 手机上还会和输入法、浏览器工具栏抢位置。
 *
 * - 进入用轻回弹从上方落下，退出更快地向上收起淡出；其余提示用 layout 动画补位。
 * - 鼠标停在任意一条上时，所有提示暂停计时，方便读完或点「撤销」。
 * - 只有一行标题时是胶囊；带描述时变成 16px 圆角的块，描述可以换行。
 */
export function Toaster() {
  const { t } = useTranslation();
  const records = useSyncExternalStore(subscribeToasts, getToasts, getToasts);
  const [paused, setPaused] = useState(false);

  return (
    <section
      aria-label={t("common.notifications", { defaultValue: "Notifications" })}
      className="pointer-events-none fixed inset-x-0 top-5 z-[10000] flex justify-center px-4"
    >
      <ol className="flex w-full flex-col items-center gap-2">
        <AnimatePresence initial={false} mode="popLayout">
          {/* 队列按时间先后存放，展示时倒过来：最新的贴着顶部。 */}
          {[...records].reverse().map((record) => (
            <ToastItem
              key={record.id}
              record={record}
              paused={paused}
              onHoverChange={setPaused}
            />
          ))}
        </AnimatePresence>
      </ol>
    </section>
  );
}

function ToastItem({
  record,
  paused,
  onHoverChange,
}: {
  record: ToastRecord;
  paused: boolean;
  onHoverChange: (hovering: boolean) => void;
}) {
  const reduceMotion = useReducedMotion();
  const remainingRef = useRef(record.duration);
  const startedAtRef = useRef(0);

  // 内容被替换（同 id 再次触发、撤销后换成确认提示）时重新计时。
  // 这个 effect 必须排在计时 effect 前面：两者在同一次提交里按声明顺序执行。
  useEffect(() => {
    remainingRef.current = record.duration;
  }, [record.revision, record.duration]);

  useEffect(() => {
    if (paused) return;
    startedAtRef.current = Date.now();
    const timer = window.setTimeout(() => dismissToast(record.id), remainingRef.current);
    return () => {
      window.clearTimeout(timer);
      remainingRef.current = Math.max(
        0,
        remainingRef.current - (Date.now() - startedAtRef.current),
      );
    };
  }, [paused, record.id, record.revision]);

  const handleAction = () => {
    const action = record.action;
    if (!action) return;
    action.onClick();
    if (action.successLabel) {
      updateToast(record.id, {
        type: "success",
        title: action.successLabel,
        description: undefined,
        action: undefined,
        duration: SUCCESS_LABEL_DURATION_MS,
      });
    } else {
      dismissToast(record.id);
    }
  };

  const hasDescription =
    record.description !== undefined && record.description !== null && record.description !== "";
  const status = record.type === "default" ? null : STATUS_ICON[record.type];

  return (
    <motion.li
      layout={!reduceMotion}
      role={record.type === "error" ? "alert" : "status"}
      onPointerEnter={() => onHoverChange(true)}
      onPointerLeave={() => onHoverChange(false)}
      initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -16, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={
        reduceMotion
          ? { opacity: 0, transition: { duration: 0.15 } }
          : { opacity: 0, y: -8, scale: 0.98, transition: { duration: 0.16, ease: EASE_IN } }
      }
      // 与下拉、弹窗同一套节奏：透明度 200ms 先到位，位移 / 缩放（以及挤开其它提示的布局动画）
      // 用 EASE_POP 走 320ms 落稳，不回弹；退场 160ms ease-in。
      transition={{ duration: 0.32, ease: EASE_POP, opacity: { duration: 0.2, ease: EASE_OUT } }}
      className={[
        "pointer-events-auto flex min-w-0 max-w-[min(calc(100vw-2rem),42rem)] bg-ink text-canvas shadow-[0_12px_30px_-8px_rgb(0_0_0/0.35)]",
        hasDescription
          ? "items-start gap-3 rounded-2xl py-3 pr-3 pl-4"
          : [
              "min-h-11 items-center gap-2.5 rounded-full py-1.5 pl-4",
              record.action ? "pr-1.5" : "pr-5",
            ].join(" "),
      ].join(" ")}
    >
      {status ? (
        <status.Icon
          size={18}
          aria-hidden="true"
          className={["shrink-0", hasDescription ? "mt-px" : "", status.className].join(" ")}
        />
      ) : null}
      <div className="min-w-0 flex-1">
        <p className="max-w-[min(calc(100vw-9rem),32rem)] truncate text-base leading-5 font-medium">
          {record.title}
        </p>
        {hasDescription ? (
          <div className="mt-1 text-sm leading-5 break-words whitespace-pre-line opacity-75 [overflow-wrap:anywhere]">
            {record.description}
          </div>
        ) : null}
      </div>
      {record.action ? (
        <button
          type="button"
          onClick={handleAction}
          className="h-8 shrink-0 rounded-full bg-canvas/15 px-3.5 text-sm font-semibold transition-colors hover:bg-canvas/25"
        >
          {record.action.label}
        </button>
      ) : null}
    </motion.li>
  );
}
