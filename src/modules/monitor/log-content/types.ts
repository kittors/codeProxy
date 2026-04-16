export interface LogContentModalProps {
  open: boolean;
  logId: number | null;
  initialTab?: "input" | "output";
  onClose: () => void;
  fetchFn?: (
    id: number,
  ) => Promise<{ input_content: string; output_content: string; model: string }>;
  fetchPartFn?: (
    id: number,
    part: "input" | "output",
    options?: { signal?: AbortSignal },
  ) => Promise<
    | { id: number; model: string; part: "input" | "output"; content: string }
    | { input_content: string; output_content: string; model: string }
  >;
}

export type Msg = { role: string; content: string };

export type RenderedView =
  | { kind: "messages"; messages: Msg[] }
  | { kind: "text"; text: string }
  | { kind: "pretty_json"; pretty: string }
  | { kind: "raw"; raw: string };

export type AsyncParsedState = { status: "idle" | "parsing" | "ready"; view: RenderedView | null };
export type AsyncPrettyState = { status: "idle" | "formatting" | "ready"; pretty: string | null };
