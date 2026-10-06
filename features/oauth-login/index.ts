// Only the lazy entry is a value export: a static re-export of the dialog would
// pull its code back into the importing page's chunk.
export { LazyAddAccountDialog } from "./lazy";
export type { AddAccountDialogProps } from "./components/AddAccountDialog";
export type { AddedAccount } from "./model/addedAccount";
