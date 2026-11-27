// satin-ui/react/markdown
import type * as React from "react";
import type { SatinInstance } from "./components";
import type { MarkdownOptions } from "./heavy";
/** source 或 children（字符串）给 Markdown 文本 */
export const Markdown: React.ForwardRefExoticComponent<{ className?: string; style?: React.CSSProperties; id?: string; children?: string } & MarkdownOptions & React.RefAttributes<SatinInstance & { readonly source: string }>>;
