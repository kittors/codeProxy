import { useCallback, useEffect, useState } from "react";
import { configApi, readConfigCapabilities, type ConfigCapabilities } from "@code-proxy/api-client";

export type ConfigCapabilitiesState =
  | { status: "loading" }
  | { status: "ready"; capabilities: ConfigCapabilities }
  | { status: "error"; message: string };

/**
 * 后端在 GET /config 里声明的能力。面板会自动更新到最新 release，旧后端也会拿到新面板，所以依赖新接口
 * 的页面和卡片要先在这里确认「后端声明了」，再发自己的请求，没声明就什么都不请求、也不渲染。
 *
 * 「没声明」和「读不到」不是一回事：前者是旧后端，永远不会好；后者是网络或权限问题，可以重试，
 * 所以单独给出 error 状态和 reload，页面不要把它当成「当前后端不支持」。
 */
export function useConfigCapabilities(): ConfigCapabilitiesState & { reload: () => void } {
  const [state, setState] = useState<ConfigCapabilitiesState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading" });
    configApi
      .getConfig()
      .then((config) => {
        if (cancelled) return;
        setState({ status: "ready", capabilities: readConfigCapabilities(config) });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setState({
          status: "error",
          message: error instanceof Error ? error.message : String(error),
        });
      });
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const reload = useCallback(() => setAttempt((value) => value + 1), []);
  return { ...state, reload };
}
