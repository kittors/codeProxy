// satin-ui/react/table
import type * as React from "react";
import type { SatinInstance, TableApi } from "./components";
import type { TableColumnReact, TableProps } from "./react";

export type { TableColumnReact, TableProps };
export const Table: React.ForwardRefExoticComponent<
  TableProps & React.RefAttributes<SatinInstance & TableApi>
>;
