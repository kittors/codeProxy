import { useCallback, useEffect, useRef, useState } from "react";
import {
  EGRESS_UNSUPPORTED,
  proxiesApi,
  type ProxyEgressListing,
} from "@code-proxy/api-client/endpoints/proxies";

/**
 * 出口熔断状态的刷新间隔。熔断器开着时每 15 秒到 2 分钟放一个请求过去试探，30 秒一刷能跟上
 * 「熔断 → 恢复」，又不至于让一直开着的页面频繁打后端。
 */
export const EGRESS_REFRESH_MS = 30_000;

/**
 * 代理池页的出口熔断状态。进页面取一次，之后页面可见时定时刷新这个轻量接口：不重新拉整表，
 * 也不重测连通性（那两件事只在打开页面和点刷新时做）。
 *
 * 旧后端没有这个接口（404）时停在 supported=false、不再轮询，页面和以前一样；网络抖动之类的
 * 临时错误保留上一次的结果，下一轮再取。
 */
export function useEgressStatus() {
  const [listing, setListing] = useState<ProxyEgressListing>(EGRESS_UNSUPPORTED);
  // 第一次回答到达之前是「还不知道」，不是「不支持」：表格在第一次渲染时定下列的顺序，之后才
  // 出现的列会被排到最后，所以这一列先占住位置，等后端说不支持再撤掉。
  const [known, setKnown] = useState(false);
  const supported = useRef(true);
  const inFlight = useRef<AbortController | null>(null);

  const refresh = useCallback(async () => {
    if (!supported.current) return;
    inFlight.current?.abort();
    const controller = new AbortController();
    inFlight.current = controller;
    try {
      const next = await proxiesApi.egressStatus({ signal: controller.signal });
      if (controller.signal.aborted) return;
      supported.current = next.supported;
      setListing(next);
      setKnown(true);
    } catch {
      // 保留上一次的结果。
    } finally {
      if (inFlight.current === controller) inFlight.current = null;
    }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, EGRESS_REFRESH_MS);
    return () => {
      window.clearInterval(timer);
      inFlight.current?.abort();
    };
  }, [refresh]);

  return { listing, known, refresh };
}
