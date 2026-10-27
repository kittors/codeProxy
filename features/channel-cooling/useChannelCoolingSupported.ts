import { useSyncExternalStore } from "react";
import { isChannelCoolingSupported, subscribeChannelCoolingSupport } from "@code-proxy/api-client";

/**
 * 后端是否声明了能保存渠道的冷却开关。声明随渠道列表的 GET 返回；旧后端没有声明，开关就不显示，
 * 免得保存后被后端静默丢掉。
 */
export const useChannelCoolingSupported = (): boolean =>
  useSyncExternalStore(subscribeChannelCoolingSupport, isChannelCoolingSupported, () => false);
