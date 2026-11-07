import type {
  RoutingVirtualModel,
  RoutingVirtualModelMember,
} from "@code-proxy/api-client/endpoints/routing-config";

/**
 * 虚拟模型编辑器的草稿与校验。规则和上限照 CliRelay `internal/config/routing_virtual_models.go`
 * 抄一份，只为就地提示；保存时后端会按同样的规则再查一遍，拒绝时的原文照常显示。
 */

export const MAX_VIRTUAL_MODELS = 200;
export const MAX_VIRTUAL_MODEL_MEMBERS = 16;
export const MAX_MEMBER_WEIGHT = 1000;
const MAX_NAME_LENGTH = 128;

/** 模型名会原样写进响应头：只能是不含空格的可打印 ASCII。 */
const PRINTABLE_ID = /^[\x21-\x7e]+$/;

export interface VirtualModelMemberDraft {
  /** 只在编辑器里用来区分行，不保存。 */
  id: string;
  /** 空表示「按请求本来的路由」：请求路径、Key 的渠道分组，或默认分组。 */
  group: string;
  model: string;
  /** 文本框里的原样输入，空等于 0。 */
  weight: string;
}

export interface VirtualModelDraft {
  /** 正在编辑的虚拟模型原来的名字；新建时为 null。 */
  originalName: string | null;
  name: string;
  description: string;
  weighted: boolean;
  members: VirtualModelMemberDraft[];
}

let memberSeq = 0;
const nextMemberId = () => `vm-member-${++memberSeq}`;

export function emptyMemberDraft(group = ""): VirtualModelMemberDraft {
  return { id: nextMemberId(), group, model: "", weight: "" };
}

export function toDraft(vm?: RoutingVirtualModel): VirtualModelDraft {
  if (!vm) {
    return {
      originalName: null,
      name: "",
      description: "",
      weighted: false,
      members: [emptyMemberDraft()],
    };
  }
  return {
    originalName: vm.name,
    name: vm.name,
    description: vm.description ?? "",
    weighted: vm.strategy === "weighted",
    members: vm.members.map((member) => ({
      id: nextMemberId(),
      group: member.group ?? "",
      model: member.model,
      weight: member.weight ? String(member.weight) : "",
    })),
  };
}

const parseWeight = (text: string): number => {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return /^\d+$/.test(trimmed) ? Number(trimmed) : Number.NaN;
};

/** 草稿写回接口的形状：顺序就是成员的尝试顺序；按顺序尝试时不写权重。 */
export function fromDraft(draft: VirtualModelDraft): RoutingVirtualModel {
  const members = draft.members.map((member): RoutingVirtualModelMember => {
    const weight = draft.weighted ? parseWeight(member.weight) : 0;
    const group = member.group.trim().toLowerCase();
    return {
      ...(group ? { group } : {}),
      model: member.model.trim(),
      ...(weight > 0 ? { weight } : {}),
    };
  });
  const description = draft.description.trim();
  return {
    name: draft.name.trim(),
    ...(description ? { description } : {}),
    ...(draft.weighted ? { strategy: "weighted" as const } : {}),
    members,
  };
}

/** 把编辑后的虚拟模型放回列表：替换原来那条（保持位置），新建的追加在末尾。 */
export function applyDraft(
  list: RoutingVirtualModel[],
  draft: VirtualModelDraft,
): RoutingVirtualModel[] {
  const next = fromDraft(draft);
  const original = draft.originalName?.toLowerCase();
  const index = original ? list.findIndex((vm) => vm.name.toLowerCase() === original) : -1;
  if (index < 0) return [...list, next];
  return list.map((vm, i) => (i === index ? next : vm));
}

export function removeVirtualModel(
  list: RoutingVirtualModel[],
  name: string,
): RoutingVirtualModel[] {
  const target = name.toLowerCase();
  return list.filter((vm) => vm.name.toLowerCase() !== target);
}

/** 成员在界面和请求日志里的写法：`分组/模型`，没有分组时只写模型。 */
export function memberRoute(member: Pick<RoutingVirtualModelMember, "group" | "model">): string {
  const group = member.group?.trim();
  return group ? `${group}/${member.model}` : member.model;
}

export type NameIssue =
  | "required"
  | "too_long"
  | "slash"
  | "reserved"
  | "not_printable"
  | "duplicate";

export type MemberIssue =
  | "model_required"
  | "model_not_printable"
  | "other_group_prefix"
  | "nested"
  | "unknown_group"
  | "duplicate"
  | "weight_range";

export interface VirtualModelDraftIssues {
  name: NameIssue | null;
  /** 列表层面的问题：没有成员、成员太多、按权重却没有一个权重大于 0。 */
  members: "none" | "too_many" | "no_weight" | null;
  /** 按成员 id。 */
  member: Record<string, MemberIssue>;
}

export function hasDraftIssues(issues: VirtualModelDraftIssues): boolean {
  return Boolean(issues.name || issues.members || Object.keys(issues.member).length > 0);
}

/**
 * 按后端的规则检查一条草稿。others 是列表里的其它虚拟模型（不含正在编辑的这条），
 * knownGroups 是租户的渠道分组名（小写）。
 */
export function checkDraft(
  draft: VirtualModelDraft,
  others: RoutingVirtualModel[],
  knownGroups: ReadonlySet<string>,
): VirtualModelDraftIssues {
  const name = draft.name.trim();
  const otherNames = new Set(others.map((vm) => vm.name.toLowerCase()));
  let nameIssue: NameIssue | null = null;
  if (!name) nameIssue = "required";
  else if (name.length > MAX_NAME_LENGTH) nameIssue = "too_long";
  // 「分组/模型」已经表示「那个分组里的这个模型」。
  else if (name.includes("/")) nameIssue = "slash";
  else if (name.toLowerCase() === "auto") nameIssue = "reserved";
  else if (!PRINTABLE_ID.test(name)) nameIssue = "not_printable";
  else if (otherNames.has(name.toLowerCase())) nameIssue = "duplicate";

  const member: Record<string, MemberIssue> = {};
  const seen = new Set<string>();
  let anyWeight = false;
  for (const entry of draft.members) {
    const model = entry.model.trim();
    const group = entry.group.trim().toLowerCase();
    const weight = parseWeight(entry.weight);
    const key = `${group}\u0000${model.toLowerCase()}`;
    const prefix = model.includes("/")
      ? model.slice(0, model.indexOf("/")).trim().toLowerCase()
      : "";
    let issue: MemberIssue | null = null;
    if (!model) issue = "model_required";
    else if (!PRINTABLE_ID.test(model)) issue = "model_not_printable";
    else if (prefix && group && prefix !== group) issue = "other_group_prefix";
    // 成员写自己的名字，是给同名的真实模型加回退；写别的虚拟模型就成了嵌套。
    else if (otherNames.has(model.toLowerCase()) && model.toLowerCase() !== name.toLowerCase())
      issue = "nested";
    else if (group && !knownGroups.has(group)) issue = "unknown_group";
    else if (seen.has(key)) issue = "duplicate";
    else if (
      draft.weighted &&
      (!Number.isInteger(weight) || weight < 0 || weight > MAX_MEMBER_WEIGHT)
    )
      issue = "weight_range";
    if (model) seen.add(key);
    if (draft.weighted && Number.isInteger(weight) && weight > 0) anyWeight = true;
    if (issue) member[entry.id] = issue;
  }

  let membersIssue: VirtualModelDraftIssues["members"] = null;
  if (draft.members.length === 0) membersIssue = "none";
  else if (draft.members.length > MAX_VIRTUAL_MODEL_MEMBERS) membersIssue = "too_many";
  else if (draft.weighted && !anyWeight && Object.keys(member).length === 0)
    membersIssue = "no_weight";

  return { name: nameIssue, members: membersIssue, member };
}

/**
 * 按权重挑第一个成员的概率，按 0–100 取整；按顺序尝试、或权重都不可用时为空。
 * 只给编辑器显示「大约多少请求先试它」，不参与保存。
 */
export function firstPickShares(draft: VirtualModelDraft): Record<string, number> {
  if (!draft.weighted) return {};
  const weights = draft.members.map((member) => {
    const weight = parseWeight(member.weight);
    return Number.isInteger(weight) && weight > 0 ? weight : 0;
  });
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  if (total <= 0) return {};
  return Object.fromEntries(
    draft.members.map((member, index) => [member.id, Math.round((weights[index] / total) * 100)]),
  );
}
