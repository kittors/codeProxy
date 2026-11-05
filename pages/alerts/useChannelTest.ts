import { useCallback, useRef, useState } from "react";
import { alertsApi } from "@code-proxy/api-client";
import { channelToWire, type ChannelDraft } from "./model";

export type TestOutcome =
  | { ok: true; durationMs: number }
  /** `message` 是后端的简短原因；空串表示后端没给出任何结果。 */
  | { ok: false; message: string };

/**
 * 「发送测试消息」：发的是页面上这份草稿（带 id 的通道，打码值由后端按 id 解析成已存的值），
 * 所以改了地址还没保存也能直接试。测试无视总开关，但会真的往外发一条消息。
 * 结果按通道的 key 记着，列表行和编辑弹窗读的是同一份；一次只允许一个在途，避免连点把
 * 后端的 3 秒限流打出 429。
 */
export function useChannelTest() {
  const [results, setResults] = useState<Record<string, TestOutcome>>({});
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const inFlight = useRef(false);

  const run = useCallback(async (channel: ChannelDraft) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setPendingKey(channel.key);
    let outcome: TestOutcome;
    try {
      const response = await alertsApi.sendTest({ channel: channelToWire(channel) });
      const result = response?.results?.[0];
      outcome = !result
        ? { ok: false, message: "" }
        : result.ok
          ? { ok: true, durationMs: result.duration_ms }
          : { ok: false, message: result.error };
    } catch (error: unknown) {
      outcome = { ok: false, message: error instanceof Error ? error.message : String(error) };
    }
    inFlight.current = false;
    setResults((current) => ({ ...current, [channel.key]: outcome }));
    setPendingKey(null);
  }, []);

  return { results, pendingKey, run };
}
