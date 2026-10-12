import { buildCcSwitchImportUrl } from "./ccswitchImport";
import { resolveCcSwitchImportPlan, type CcSwitchImportPlanInput } from "./ccswitchImportPlan";
import {
  buildCcSwitchImportPreview,
  type CcSwitchImportPreviewFile,
} from "./ccswitchImportPreview";

/** The deep link that imports one preset with one API key. */
export function buildCcSwitchImportUrlForConfig(input: CcSwitchImportPlanInput): string {
  return buildCcSwitchImportUrl(resolveCcSwitchImportPlan(input));
}

/** What CC Switch writes for the same import, key masked. */
export function buildCcSwitchImportPreviewForConfig(
  input: CcSwitchImportPlanInput,
): CcSwitchImportPreviewFile[] {
  return buildCcSwitchImportPreview(resolveCcSwitchImportPlan(input));
}
