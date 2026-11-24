// satin-ui/react/tree
import type * as React from "react";
import type { SatinInstance } from "./components";
import type { TreeOptions, TreeApi, FileExplorerOptions, FileExplorerApi } from "./heavy";

export const Tree: React.ForwardRefExoticComponent<
  { className?: string; style?: React.CSSProperties; id?: string } & TreeOptions & React.RefAttributes<SatinInstance & TreeApi>
>;
export const FileExplorer: React.ForwardRefExoticComponent<
  { className?: string; style?: React.CSSProperties; id?: string } & FileExplorerOptions & React.RefAttributes<SatinInstance & FileExplorerApi>
>;
export type { TreeNode, TreeOptions, TreeApi, TreeActiveStyle, FileKind, FileView, FolderColorPreset, FileNode, FileExplorerOptions, FileExplorerApi } from "./heavy";
