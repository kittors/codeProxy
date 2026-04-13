import type { Msg, RenderedView } from "./types";
import type { ParsedOutput } from "./types-internal";

// Internal-only helper type exported from a colocated file to keep the main modal lighter.

function extractText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((p: Record<string, unknown>) => {
        if (typeof p.text === "string") return p.text;
        if (typeof p.content === "string") return p.content;
        return "";
      })
      .filter(Boolean)
      .join("\n");
  }
  if (content && typeof content === "object") return JSON.stringify(content, null, 2);
  return String(content ?? "");
}

function parseOpenAIMessages(data: Record<string, unknown>): Msg[] | null {
  const msgs = data.messages;
  if (!Array.isArray(msgs)) return null;
  const result = msgs
    .filter((m: Record<string, unknown>) => m.role && m.content !== undefined)
    .map((m: Record<string, unknown>) => ({
      role: String(m.role),
      content: extractText(m.content),
    }));
  return result.length > 0 ? result : null;
}

function parseCodexInput(data: Record<string, unknown>): Msg[] | null {
  const input = data.input;
  if (!Array.isArray(input)) return null;

  const result: Msg[] = [];
  if (typeof data.instructions === "string" && data.instructions.trim()) {
    result.push({ role: "instructions", content: data.instructions.trim() });
  }

  for (const item of input as Record<string, unknown>[]) {
    const itemType = String(item.type || "");
    if (itemType === "message" || (!itemType && item.role && item.content !== undefined)) {
      const role = String(item.role || "user");
      const text = extractText(item.content);
      if (text) result.push({ role, content: text });
    } else if (itemType === "function_call") {
      const name = String(item.name || "");
      const args =
        typeof item.arguments === "string" ? item.arguments : JSON.stringify(item.arguments ?? "");
      result.push({ role: "function_call", content: `${name}(${args})` });
    } else if (itemType === "function_call_output") {
      const output =
        typeof item.output === "string" ? item.output : JSON.stringify(item.output ?? "");
      result.push({ role: "function_call_output", content: output });
    } else {
      const text = extractText(item.content ?? item.text ?? "");
      if (text) result.push({ role: String(item.role || itemType || "unknown"), content: text });
    }
  }

  return result.length > 0 ? result : null;
}

function decodeEscaped(s: string): string {
  return s
    .replace(/\\r\\n/g, "\n")
    .replace(/\\r/g, "")
    .replace(/\\n/g, "\n")
    .replace(/\\t/g, "\t")
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, "\\");
}

function parseInputMessages(raw: string): Msg[] | null {
  try {
    const data = JSON.parse(raw);
    const codex = parseCodexInput(data);
    if (codex) return codex;
    const openai = parseOpenAIMessages(data);
    if (openai) return openai;
    return null;
  } catch {
    // JSON truncated — recovery below
  }

  const result: Msg[] = [];

  const instrMatch = raw.match(/"instructions"\s*:\s*"((?:[^"\\]|\\.)*)"/s);
  if (instrMatch) {
    result.push({ role: "instructions", content: decodeEscaped(instrMatch[1]) });
  }

  const inputMatch = raw.match(/"input"\s*:\s*\[(.+)/s);
  if (inputMatch) {
    const textRegex = /"type"\s*:\s*"input_text"\s*,\s*"text"\s*:\s*"((?:[^"\\]|\\.)*)"/gs;
    let match: RegExpExecArray | null;
    const texts: string[] = [];
    while ((match = textRegex.exec(inputMatch[1])) !== null) {
      texts.push(decodeEscaped(match[1]));
    }
    if (texts.length > 0) result.push({ role: "user", content: texts.join("\n\n") });
  }

  if (result.length === 0) {
    const messagesMatch = raw.match(/"messages"\s*:\s*\[(.+)/s);
    if (messagesMatch) {
      const body = messagesMatch[1];
      const rcStringRegex = /"role"\s*:\s*"(\w+)"\s*,\s*"content"\s*:\s*"((?:[^"\\]|\\.)*)"/gs;
      let match: RegExpExecArray | null;
      while ((match = rcStringRegex.exec(body)) !== null) {
        result.push({ role: match[1], content: decodeEscaped(match[2]) });
      }
      if (result.length === 0) {
        const rcArrayRegex = /"role"\s*:\s*"(\w+)"\s*,\s*"content"\s*:\s*\[/gs;
        let roleMatch: RegExpExecArray | null;
        while ((roleMatch = rcArrayRegex.exec(body)) !== null) {
          const role = roleMatch[1];
          const afterRole = body.slice(rcArrayRegex.lastIndex);
          const textRegex = /"text"\s*:\s*"((?:[^"\\]|\\.)*)"/gs;
          let textMatch: RegExpExecArray | null;
          const texts: string[] = [];
          while ((textMatch = textRegex.exec(afterRole)) !== null) {
            if (afterRole.lastIndexOf('"role"', textMatch.index) > 0) break;
            texts.push(decodeEscaped(textMatch[1]));
          }
          if (texts.length > 0) {
            result.push({ role, content: texts.join("\n") });
          }
        }
      }
    }
  }

  if (result.length > 0) {
    result.push({
      role: "system",
      content:
        "⚠️ ⚠️ Note: Raw content was truncated due to size limits; some messages may be incomplete.",
    });
    return result;
  }

  return null;
}

function parseSSEToMessages(raw: string): Msg[] | null {
  const lines = raw.split("\n");
  const messages: Msg[] = [];
  const blocks: Map<number, { type: string; name?: string; id?: string; parts: string[] }> =
    new Map();

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("data:")) continue;
    const jsonStr = trimmed.slice(5).trim();
    if (jsonStr === "[DONE]") continue;

    try {
      const data = JSON.parse(jsonStr);
      if (data.type === "content_block_start" && data.content_block) {
        const idx = data.index ?? 0;
        const cb = data.content_block;
        blocks.set(idx, {
          type: cb.type || "text",
          name: cb.name,
          id: cb.id,
          parts: [],
        });
        continue;
      }

      if (data.type === "content_block_delta") {
        const idx = data.index ?? 0;
        const block = blocks.get(idx);
        if (block) {
          if (data.delta?.text) block.parts.push(data.delta.text);
          else if (data.delta?.thinking) block.parts.push(data.delta.thinking);
          else if (data.delta?.partial_json) block.parts.push(data.delta.partial_json);
        }
        continue;
      }

      if (data.type === "content_block_stop") {
        const idx = data.index ?? 0;
        const block = blocks.get(idx);
        if (block) {
          const joined = block.parts.join("");
          if (joined.trim()) {
            if (block.type === "thinking") {
              messages.push({ role: "thinking", content: joined });
            } else if (block.type === "tool_use") {
              let formatted = `**${block.name || "tool"}**`;
              if (block.id) formatted += `  \`${block.id}\``;
              try {
                const parsed = JSON.parse(joined);
                formatted += "\n```json\n" + JSON.stringify(parsed, null, 2) + "\n```";
              } catch {
                formatted += "\n```\n" + joined + "\n```";
              }
              messages.push({ role: "tool_use", content: formatted });
            } else {
              messages.push({ role: "assistant", content: joined });
            }
          }
          blocks.delete(idx);
        }
        continue;
      }
    } catch {
      // skip
    }
  }

  for (const [, block] of blocks) {
    const joined = block.parts.join("");
    if (!joined.trim()) continue;
    if (block.type === "thinking") {
      messages.push({ role: "thinking", content: joined });
    } else if (block.type === "tool_use") {
      let formatted = `**${block.name || "tool"}**`;
      if (block.id) formatted += `  \`${block.id}\``;
      try {
        const parsed = JSON.parse(joined);
        formatted += "\n```json\n" + JSON.stringify(parsed, null, 2) + "\n```";
      } catch {
        formatted += "\n```\n" + joined + "\n```";
      }
      messages.push({ role: "tool_use", content: formatted });
    } else {
      messages.push({ role: "assistant", content: joined });
    }
  }

  return messages.length > 0 ? messages : null;
}

function parseSSETextOnly(raw: string): string | null {
  const lines = raw.split("\n");
  const textParts: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("data:")) continue;
    const jsonStr = trimmed.slice(5).trim();
    if (jsonStr === "[DONE]") continue;

    try {
      const data = JSON.parse(jsonStr);
      if (data.choices?.[0]?.delta?.content) {
        textParts.push(data.choices[0].delta.content);
        continue;
      }
      if (data.type === "response.output_text.delta" && typeof data.delta === "string") {
        textParts.push(data.delta);
        continue;
      }
      if (data.type === "content_block_delta" && data.delta?.text) {
        textParts.push(data.delta.text);
        continue;
      }
      if (data.type === "response.completed" && data.response?.output) {
        const outs = data.response.output;
        if (Array.isArray(outs) && textParts.length === 0) {
          for (const o of outs) {
            if (o.type === "message" && Array.isArray(o.content)) {
              for (const p of o.content) {
                if (typeof p.text === "string") textParts.push(p.text);
              }
            }
          }
        }
      }
    } catch {
      // skip
    }
  }

  return textParts.length > 0 ? textParts.join("") : null;
}

function parseNonStreamOutput(raw: string): ParsedOutput | null {
  try {
    const data = JSON.parse(raw);
    if (data.choices?.[0]?.message?.content) {
      return { text: extractText(data.choices[0].message.content) };
    }
    if (Array.isArray(data.content)) {
      return { text: extractText(data.content) };
    }
    const output = data.response?.output || data.output;
    if (Array.isArray(output)) {
      const texts: string[] = [];
      for (const item of output) {
        if (item.type === "message" && Array.isArray(item.content)) {
          for (const p of item.content) {
            if (typeof p.text === "string") texts.push(p.text);
          }
        }
      }
      if (texts.length > 0) return { text: texts.join("\n") };
    }
    return null;
  } catch {
    return null;
  }
}

function parseOutputMessages(raw: string): ParsedOutput | null {
  if (raw.includes("data:")) {
    const structured = parseSSEToMessages(raw);
    if (structured) return { messages: structured };
    const text = parseSSETextOnly(raw);
    if (text) return { text };
  }
  return parseNonStreamOutput(raw);
}

export function tryPrettyPrintJson(raw: string): string | null {
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return null;
  }
}

export function buildInputRenderedView(raw: string): RenderedView {
  const messages = parseInputMessages(raw);
  if (messages && messages.length > 0) return { kind: "messages", messages };
  const pretty = tryPrettyPrintJson(raw);
  if (pretty) return { kind: "pretty_json", pretty };
  return { kind: "raw", raw };
}

export function buildOutputRenderedView(raw: string): RenderedView {
  const parsed = parseOutputMessages(raw);
  if (parsed) {
    if ("messages" in parsed) return { kind: "messages", messages: parsed.messages };
    return { kind: "text", text: parsed.text };
  }
  const pretty = tryPrettyPrintJson(raw);
  if (pretty) return { kind: "pretty_json", pretty };
  return { kind: "raw", raw };
}
