import { render, screen, within } from "@testing-library/react";
import type { UserEvent } from "@testing-library/user-event";
import { ThemeProvider, ToastProvider } from "@code-proxy/ui";
import type { UsageLogItem, UsageLogsResponse } from "@code-proxy/api-client/endpoints/usage";
import { RequestLogsPage } from "../RequestLogsPage";

/**
 * 请求日志页测试共用的假数据与操作（计划 104 重做后的页面：筛选区的分面按钮与状态页签、
 * DataGrid 表格、表格内的空态与出错态）。
 * vi.mock 只在测试文件顶层才会被提升，所以接口替身写在各个测试文件里，这里只放数据和交互。
 */

export function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** 一条请求日志。按后端契约带 client_name / client_version / user_agent 三个字段。 */
export const logItem = (overrides: Partial<UsageLogItem> = {}): UsageLogItem => ({
  id: 1,
  timestamp: "2026-04-08T12:00:00Z",
  api_key: "sk-test-123456",
  api_key_name: "Primary",
  model: "gpt-5.4",
  source: "codex",
  channel_name: "Codex",
  provider: "codex",
  auth_type: "oauth",
  auth_index: "auth-1",
  failed: false,
  streaming: true,
  latency_ms: 1200,
  first_token_ms: 183,
  input_tokens: 10,
  output_tokens: 20,
  reasoning_tokens: 0,
  cached_tokens: 0,
  total_tokens: 30,
  cost: 0.0123,
  has_content: false,
  client_name: "codex-cli",
  client_version: "0.125.0",
  user_agent: "codex_cli_rs/0.125.0 (Mac OS 26.1.0; arm64) Apple_Terminal/464",
  ...overrides,
});

/** 不认识调用方字段的旧后端：三个键都没有（不是空串）。 */
export const legacyItem = (overrides: Partial<UsageLogItem> = {}): UsageLogItem => {
  const item = logItem(overrides);
  delete item.client_name;
  delete item.client_version;
  delete item.user_agent;
  return item;
};

/** API 客户端交给页面的一页结果（字段已经由客户端补齐，所以每个键都在）。 */
export function logsAnswer(
  items: UsageLogItem[],
  extra: {
    total?: number;
    capabilities?: Partial<UsageLogsResponse["capabilities"]>;
    filters?: Partial<UsageLogsResponse["filters"]>;
    stats?: Partial<UsageLogsResponse["stats"]>;
  } = {},
): UsageLogsResponse {
  return {
    items,
    total: extra.total ?? items.length,
    page: 1,
    size: 50,
    capabilities: {
      apiKeyIdFilters: false,
      loopGuard: false,
      requestLogClients: false,
      ...extra.capabilities,
    },
    filters: {
      api_key_ids: [],
      api_key_id_names: {},
      api_key_id_counts: {},
      api_keys: [],
      api_key_names: {},
      api_key_counts: {},
      models: [],
      channels: [],
      channel_options: [],
      statuses: ["success", "failed"],
      guard_kinds: [],
      client_names: [],
      client_name_counts: {},
      ...extra.filters,
    },
    // Partial 展开会把必填字段标成可选；默认值都在，按完整类型交出去。
    stats: {
      total: items.length,
      success_rate: 100,
      total_tokens: items.reduce((sum, item) => sum + item.total_tokens, 0),
      total_cost: 0,
      ...extra.stats,
    } as UsageLogsResponse["stats"],
  };
}

export function renderRequestLogsPage() {
  return render(
    <ThemeProvider>
      <ToastProvider>
        <RequestLogsPage />
      </ToastProvider>
    </ThemeProvider>,
  );
}

/** 表格行带展开详情，是 role="grid" 的交互表格。 */
export const findLogGrid = () => screen.findByRole("grid");

/** 筛选区里的分面按钮（「用户 / Key」「模型」「渠道」「Agent」）。 */
export const facetButton = (label: string) =>
  within(screen.getByRole("search")).getByRole("button", { name: new RegExp(`^${label}`) });

/** 打开分面，勾选（或取消）这些取值，点「应用」。返回弹窗，便于断言。 */
export async function chooseInFacet(
  user: UserEvent,
  label: string,
  options: readonly (string | RegExp)[],
  { apply = true }: { apply?: boolean } = {},
) {
  await user.click(facetButton(label));
  const dialog = await screen.findByRole("dialog", { name: new RegExp(`Filter .${label}.`) });
  for (const option of options) {
    await user.click(within(dialog).getByRole("checkbox", { name: option }));
  }
  if (apply) await user.click(within(dialog).getByRole("button", { name: "Apply" }));
  return dialog;
}

/** 汇总里某一项的数值（「请求」「成功率」…）。 */
export const summaryValue = (label: string) =>
  screen.getByText(label, { selector: "span.text-ink-3" }).nextElementSibling?.textContent ?? null;

/** 某次请求的查询参数（第 n 次，从 1 开始；不传是最后一次）。 */
export const queryOf = (calls: unknown[][], n?: number) =>
  (n === undefined ? calls.at(-1) : calls[n - 1])?.[0] as Record<string, unknown> | undefined;
