import { formatLockCountdown } from "./useLoginLockCountdown";

/**
 * 锁定提示的正文：每秒刷新的「请在 m:ss 后重试」。
 *
 * 提示条若本身是 role="alert" 的播报区（门户登录弹窗没有 toast，只能靠它播报），
 * 就传 announcement：倒计时那段对读屏隐藏，改由这句固定的话只播一次——否则倒计时
 * 每变一次，读屏就被打断一次。
 *
 * 管理端登录页的 toast 本身就是 role="alert"，已经播报过，提示条不再做播报区，
 * 也就不传 announcement：读屏用户移到这里时，读到的是当前的剩余时间。
 */
export function LoginLockMessage({
  t,
  seconds,
  announcement,
}: {
  t: (key: string, options?: Record<string, unknown>) => string;
  seconds: number;
  announcement?: string;
}) {
  const countdown = t("login.locked_notice", { time: formatLockCountdown(seconds) });
  if (announcement === undefined) {
    return <>{countdown}</>;
  }
  return (
    <>
      <span aria-hidden="true">{countdown}</span>
      <span className="sr-only">{announcement}</span>
    </>
  );
}
