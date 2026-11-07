import { useState } from "react";
import { useInterval } from "@code-proxy/ui";

/**
 * 当前时间；每隔 `intervalMs` 只让调用它的那个小组件重渲染一次，不牵动整页。
 *
 * 页面级的 `nowMs`（useAuthFilesStatusState）只在开了额度自动刷新时才走表，而这个开关默认是关的：
 * 关着的时候它停在页面打开的那一刻。天、小时量级的文案不在乎，几十秒的冷却倒计时在乎——
 * 用它的话「剩余 1m 30s」会一直停在 1m 30s。倒计时因此各自带一个时钟。
 *
 * `active` 为 false 时不建定时器，返回的是挂载那一刻的时间；它应当在组件的整个生命周期里保持不变。
 */
export function useLiveNowMs(intervalMs = 1000, active = true): number {
  const [nowMs, setNowMs] = useState(() => Date.now());
  useInterval(() => setNowMs(Date.now()), active ? intervalMs : null);
  return nowMs;
}
