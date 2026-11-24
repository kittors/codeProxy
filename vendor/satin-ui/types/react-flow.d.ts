// satin-ui/react/flow
import type * as React from "react";
import type { SatinInstance } from "./components";
import type { FlowOptions } from "./heavy";
export const Flow: React.ForwardRefExoticComponent<{ className?: string; style?: React.CSSProperties; id?: string } & FlowOptions & React.RefAttributes<SatinInstance & { readonly nodes: Map<string, unknown>; readonly edges: unknown[] }>>;
export type { FlowOptions, FlowNode, FlowEdge, FlowGroup, FlowPort } from "./heavy";
