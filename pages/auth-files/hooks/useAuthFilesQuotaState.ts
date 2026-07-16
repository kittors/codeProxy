/**
 * Quota/status surface for AI Accounts.
 * Upstream probe fan-out was removed; latest status comes from backend read model.
 * @see useAuthFilesStatusState
 */
export {
  isFatalQuotaRefreshError,
  isStatusApiUnsupportedError,
  useAuthFilesStatusState as useAuthFilesQuotaState,
} from "./useAuthFilesStatusState";
