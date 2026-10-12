import { buildCcSwitchImportUrl } from "./ccswitchImport";
import { resolveCcSwitchImportPlan, type CcSwitchImportPlanInput } from "./ccswitchImportPlan";
import {
  buildCcSwitchImportPreview,
  type CcSwitchImportPreviewFile,
  type CcSwitchImportPreviewLabels,
} from "./ccswitchImportPreview";

/** The deep link that imports one preset with one API key. */
export function buildCcSwitchImportUrlForConfig(input: CcSwitchImportPlanInput): string {
  return buildCcSwitchImportUrl(resolveCcSwitchImportPlan(input));
}

/** What CC Switch writes for the same import, key masked. */
export function buildCcSwitchImportPreviewForConfig(
  input: CcSwitchImportPlanInput,
  labels?: CcSwitchImportPreviewLabels,
): CcSwitchImportPreviewFile[] {
  return buildCcSwitchImportPreview(resolveCcSwitchImportPlan(input), labels);
}
