// satin-ui/vue/tree
import type { DefineComponent } from "vue";
import type { TreeOptions, FileExplorerOptions } from "./heavy";

type TreeVueProps = Omit<TreeOptions, "onSelect" | "onCheck" | "onExpand" | "onMove">;
type FileExplorerVueProps = Omit<FileExplorerOptions, "onChange" | "onOpen" | "onSelect" | "onViewChange" | "onNavigate" | "onMove" | "onCreate" | "onRename" | "onDelete" | "onColorChange">;

export const Tree: DefineComponent<TreeVueProps>;
export const FileExplorer: DefineComponent<FileExplorerVueProps>;
export type { TreeNode, TreeOptions, TreeApi, TreeActiveStyle, FileKind, FileView, FolderColorPreset, FileNode, FileExplorerOptions, FileExplorerApi } from "./heavy";
