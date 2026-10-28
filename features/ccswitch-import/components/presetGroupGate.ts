import { channelGroupServesModel } from "@code-proxy/domain/models/channelGroupModelGate";
import { getPrimaryModel, type ConfigDraft } from "./ccswitchConfigDraft";
import {
  channelGroupGateOf,
  dedupeModels,
  type CcSwitchChannelGroupOption,
} from "./useChannelGroupModels";

/**
 * The models a preset routes to that its channel group refuses.
 *
 * A preset does not narrow what its route serves: its mappings only rename, and
 * the channel group decides (CliRelay's model gate). So a preset can still carry
 * a model its group does not allow, picked before the group's list changed or
 * kept by an older editor, and every request for it fails with a 403 naming the
 * group. Without the group's settings there is nothing to check, so nothing is
 * reported.
 */
export function presetModelsRefusedByGroup(
  draft: ConfigDraft,
  option: CcSwitchChannelGroupOption | undefined,
): string[] {
  if (!option) return [];
  const gate = channelGroupGateOf(option);
  const targets = [
    getPrimaryModel(draft),
    ...draft.modelMappings.map((mapping) => mapping.targetModel),
  ];
  return dedupeModels(targets).filter((model) => !channelGroupServesModel(gate, model));
}
