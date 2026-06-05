export type LogContentBodyPart = "input" | "output";
export type LogContentPart = LogContentBodyPart | "details";

export interface LogContentModalProps {
  open: boolean;
  logId: number | null;
  initialTab?: LogContentBodyPart;
  onClose: () => void;
  showRequestDetails?: boolean;
  fetchFn?: (
    id: number,
  ) => Promise<{ input_content: string; output_content: string; model: string }>;
  fetchPartFn?: (
    id: number,
    part: LogContentBodyPart,
    options?: { signal?: AbortSignal },
  ) => Promise<
    | { id: number; model: string; part: LogContentBodyPart; content: string }
    | { input_content: string; output_content: string; model: string }
  >;
  fetchDetailsFn?: (
    id: number,
    options?: { signal?: AbortSignal },
  ) => Promise<{ id: number; model: string; part: "details"; content: string }>;
}

export type Msg = { role: string; content: string };

export type RenderedView =
  | { kind: "messages"; messages: Msg[] }
  | { kind: "text"; text: string }
  | { kind: "pretty_json"; pretty: string }
  | { kind: "raw"; raw: string };

export type AsyncParsedState = { status: "idle" | "parsing" | "ready"; view: RenderedView | null };
export type AsyncPrettyState = { status: "idle" | "formatting" | "ready"; pretty: string | null };
