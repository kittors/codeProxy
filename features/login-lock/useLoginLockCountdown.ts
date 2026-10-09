import { useEffect, useState } from "react";

/**
 * 登录锁定还剩多少秒，每秒刷新一次，到点归零后停表。
 *
 * 只说「请稍后再试」时，用户分不清是锁一分钟还是锁一小时，于是隔几秒又点一次——
 * 每一次都像是又输错了一遍密码。把服务端给的剩余时间就地倒数出来、倒数期间按钮不可点，
 * 才能让人真的等它过去。
 *
 * 剩余秒数在渲染时用 Date.now() 现算，计时器只负责每秒触发一次重渲染：
 * 这样新的锁一到，第一帧显示的就是准确的剩余时间，不会先闪一下过期的数字。
 */
export function useLoginLockCountdown(lockedUntil: number | undefined): number {
  const [, setTick] = useState(0);
  const secondsLeft = lockedUntil ? Math.max(0, Math.ceil((lockedUntil - Date.now()) / 1000)) : 0;

  useEffect(() => {
    if (!lockedUntil || lockedUntil <= Date.now()) return undefined;
    const timer = window.setInterval(() => {
      setTick((tick) => tick + 1);
      if (Date.now() >= lockedUntil) window.clearInterval(timer);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [lockedUntil]);

  return secondsLeft;
}

/**
 * 「分:秒」格式，例如 4:05、0:59。锁定最长一小时，超过 60 分钟也只是分钟数继续往上走，
 * 不再加小时位。
 */
export function formatLockCountdown(totalSeconds: number): string {
  const seconds = Math.max(0, Math.ceil(totalSeconds));
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
}
