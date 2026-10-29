import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, test, vi } from "vitest";
import {
  DEFAULT_CACHE_TENANT_ID,
  setActiveCacheTenantId,
  setCacheTenantResolver,
} from "@code-proxy/domain";
import { ProvidersPage } from "@pages/providers/ProvidersPage";
import { ThemeProvider, ToastProvider } from "@code-proxy/ui";
import { PROVIDERS_PAGE_CACHE_KEY } from "../provider-cache";

/*
 * The panel saves a channel list by replacing it whole (PUT), and the backend keeps nothing the body
 * leaves out. These tests drive the real page and the real api-client against a fake backend that
 * behaves the same way, then look at what the backend holds afterwards: a field the panel has no
 * input for (priority, cloak, alpha-search, codex-tool-bridge...) has to survive every way of saving.
 */
const mocks = vi.hoisted(() => ({
  get: vi.fn<(path: string) => Promise<unknown>>(),
  put: vi.fn<(path: string, body?: unknown) => Promise<unknown>>(),
  patch: vi.fn<(path: string, body?: unknown) => Promise<unknown>>(),
  apiKeyEntriesList: vi.fn(async (): Promise<unknown[]> => []),
  channelGroupsList: vi.fn(async (): Promise<unknown[]> => []),
  proxiesList: vi.fn(async (): Promise<unknown[]> => []),
}));

vi.mock("@code-proxy/api-client/client/client", () => ({
  apiClient: {
    get: (path: string) => mocks.get(path),
    put: (path: string, body?: unknown) => mocks.put(path, body),
    patch: (path: string, body?: unknown) => mocks.patch(path, body),
    post: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock("@code-proxy/api-client/endpoints/api-keys", () => ({
  apiKeyEntriesApi: { list: mocks.apiKeyEntriesList },
}));

vi.mock("@code-proxy/api-client/endpoints/channel-groups", () => ({
  channelGroupsApi: { list: mocks.channelGroupsList },
}));

vi.mock("@code-proxy/api-client/endpoints/proxies", () => ({
  proxiesApi: { listSelectable: mocks.proxiesList },
}));

type Row = Record<string, unknown>;

const LIST_ENDPOINTS = [
  "gemini-api-key",
  "claude-api-key",
  "codex-api-key",
  "opencode-go-api-key",
  "cline-api-key",
  "ollama-cloud-api-key",
  "commandcode-api-key",
  "vertex-api-key",
  "bedrock-api-key",
  "openai-compatibility",
];

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const keyOf = (path: string) => path.replace(/^\//, "");

// What the backend holds, per list endpoint.
let stored: Record<string, Row[]> = {};

const seed = (lists: Record<string, Row[]>) => {
  stored = Object.fromEntries(LIST_ENDPOINTS.map((key) => [key, clone(lists[key] ?? [])]));
};

const serve = () => {
  mocks.get.mockImplementation(async (path) => {
    const key = keyOf(path);
    return key in stored ? { [key]: clone(stored[key]) } : {};
  });
  // Replace*: the list becomes exactly what was sent.
  mocks.put.mockImplementation(async (path, body) => {
    stored[keyOf(path)] = clone(body as Row[]);
    return {};
  });
  // Patch*: the sent keys are merged into one entry, a null removes the key, the rest stays.
  mocks.patch.mockImplementation(async (path, body) => {
    const { index, value } = body as { index: number; value: Row };
    const list = stored[keyOf(path)];
    const next: Row = { ...list[index] };
    for (const [key, field] of Object.entries(clone(value))) {
      if (field === null) delete next[key];
      else next[key] = field;
    }
    list[index] = next;
    return {};
  });
};

// A list that never answers: the page keeps working from what it already holds.
const holdBack = (path: string) => {
  const answer = mocks.get.getMockImplementation();
  mocks.get.mockImplementation((requested) =>
    requested === path
      ? new Promise<never>(() => {})
      : (answer?.(requested) ?? Promise.resolve({})),
  );
};

const renderPage = (path = "/access/ai-providers") =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <ThemeProvider>
        <ToastProvider>
          <Routes>
            <Route path="/access/ai-providers/*" element={<ProvidersPage />} />
          </Routes>
        </ToastProvider>
      </ThemeProvider>
    </MemoryRouter>,
  );

const CLOAK = {
  mode: "always",
  "strict-mode": true,
  "sensitive-words": ["secret"],
  "cache-user-id": false,
};

describe("ProvidersPage keeps the fields it has no input for", () => {
  const createObjectURL = vi.fn((_blob: Blob) => "blob:mock");

  beforeEach(() => {
    localStorage.clear();
    setCacheTenantResolver(null);
    setActiveCacheTenantId(DEFAULT_CACHE_TENANT_ID);
    for (const mock of Object.values(mocks)) mock.mockReset();
    mocks.apiKeyEntriesList.mockImplementation(async () => []);
    mocks.channelGroupsList.mockImplementation(async () => []);
    mocks.proxiesList.mockImplementation(async () => []);
    seed({});
    serve();

    Object.defineProperty(URL, "createObjectURL", { value: createObjectURL, writable: true });
    Object.defineProperty(URL, "revokeObjectURL", { value: vi.fn(), writable: true });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  });

  describe("saving from the edit dialog", () => {
    test("a Claude key keeps priority and cloak, and a cleared prefix stays cleared", async () => {
      seed({
        "claude-api-key": [
          {
            "api-key": "sk-ant-1234567890",
            name: "Claude Main",
            prefix: "team-a",
            priority: 7,
            cloak: CLOAK,
          },
        ],
      });
      const user = userEvent.setup();
      renderPage("/access/ai-providers/claude/0");

      const dialog = await screen.findByRole("dialog", { name: /Edit Claude configuration/i });
      const name = within(dialog).getByPlaceholderText("e.g. Gemini Primary");
      await user.clear(name);
      await user.type(name, "Claude Renamed");
      await user.clear(within(dialog).getByPlaceholderText("e.g. team-a"));
      await user.click(within(dialog).getByRole("button", { name: /Save/ }));

      await waitFor(() => expect(mocks.put).toHaveBeenCalledTimes(1));
      expect(mocks.put.mock.calls[0]?.[0]).toBe("/claude-api-key");
      expect(stored["claude-api-key"]).toEqual([
        { "api-key": "sk-ant-1234567890", name: "Claude Renamed", priority: 7, cloak: CLOAK },
      ]);
    });

    test("an OpenAI-compatible provider keeps codex-tool-bridge", async () => {
      seed({
        "openai-compatibility": [
          {
            name: "Relay",
            "base-url": "https://relay.example/v1",
            priority: 3,
            "codex-tool-bridge": true,
            "api-key-entries": [{ "api-key": "sk-relay-1234567890" }],
            models: [{ name: "glm-5" }],
          },
        ],
      });
      const user = userEvent.setup();
      renderPage("/access/ai-providers/openai/0");

      const dialog = await screen.findByRole("dialog");
      await user.click(within(dialog).getByRole("button", { name: /Save/ }));

      await waitFor(() => expect(mocks.put).toHaveBeenCalledTimes(1));
      expect(stored["openai-compatibility"]).toEqual([
        {
          name: "Relay",
          "base-url": "https://relay.example/v1",
          priority: 3,
          "codex-tool-bridge": true,
          "api-key-entries": [{ "api-key": "sk-relay-1234567890" }],
          models: [{ name: "glm-5" }],
        },
      ]);
    });
  });

  describe("saving from a toggle on the card", () => {
    test("switching a Gemini key off keeps its priority and proxy-url", async () => {
      seed({
        "gemini-api-key": [
          {
            "api-key": "gm-key-1234567890",
            name: "Gemini Main",
            priority: 4,
            "proxy-url": "http://proxy.example:7890",
          },
        ],
      });
      localStorage.setItem("providers-page:tab", "gemini");
      const user = userEvent.setup();
      renderPage();

      await user.click(await screen.findByRole("button", { name: "Disable" }));

      await waitFor(() => expect(mocks.put).toHaveBeenCalledTimes(1));
      expect(stored["gemini-api-key"]).toEqual([
        {
          "api-key": "gm-key-1234567890",
          name: "Gemini Main",
          priority: 4,
          "proxy-url": "http://proxy.example:7890",
          "excluded-models": ["*"],
        },
      ]);
    });

    test("switching one key entry of an OpenAI-compatible provider off keeps codex-tool-bridge", async () => {
      seed({
        "openai-compatibility": [
          {
            name: "Relay",
            "base-url": "https://relay.example/v1",
            "codex-tool-bridge": true,
            "api-key-entries": [
              { "api-key": "sk-relay-aaaaaaaaaa" },
              { "api-key": "sk-relay-bbbbbbbbbb" },
            ],
          },
        ],
      });
      localStorage.setItem("providers-page:tab", "openai");
      const user = userEvent.setup();
      renderPage();

      await user.click((await screen.findAllByRole("switch", { name: /Enable key entry 1/i }))[0]);

      await waitFor(() => expect(mocks.put).toHaveBeenCalledTimes(1));
      expect(stored["openai-compatibility"]).toEqual([
        {
          name: "Relay",
          "base-url": "https://relay.example/v1",
          "codex-tool-bridge": true,
          "api-key-entries": [
            { "api-key": "sk-relay-aaaaaaaaaa", disabled: true },
            { "api-key": "sk-relay-bbbbbbbbbb" },
          ],
        },
      ]);
    });
  });

  describe("channels that are edited with a PATCH", () => {
    test("adding a key afterwards still writes the existing ones back whole", async () => {
      seed({
        "opencode-go-api-key": [
          {
            "api-key": "go-key-1234567890",
            name: "Go Main",
            priority: 3,
            "codex-tool-bridge": true,
          },
        ],
      });
      localStorage.setItem("providers-page:tab", "opencode-go");
      const user = userEvent.setup();
      renderPage();

      const power = await screen.findByRole("button", { name: "Disable" });
      // From here on the page only has what the toggle left in its own list, not a fresh fetch.
      holdBack("/opencode-go-api-key");
      await user.click(power);

      await waitFor(() => expect(mocks.patch).toHaveBeenCalledTimes(1));
      // The PATCH carries only what the panel models; the backend keeps the rest of the entry.
      const body = mocks.patch.mock.calls[0]?.[1] as { value: Row } | undefined;
      expect(body?.value).toBeDefined();
      expect(body?.value).not.toHaveProperty("priority");
      expect(body?.value).not.toHaveProperty("codex-tool-bridge");

      await user.click(screen.getByRole("button", { name: /Add new/ }));
      const dialog = await screen.findByRole("dialog", { name: /Add OpenCode Go configuration/i });
      await user.type(within(dialog).getByPlaceholderText("e.g. Gemini Primary"), "Go Second");
      await user.type(within(dialog).getByPlaceholderText(/Paste API Key/i), "go-key-second-0987");
      await user.click(within(dialog).getByRole("button", { name: /Save/ }));

      await waitFor(() => expect(mocks.put).toHaveBeenCalledTimes(1));
      expect(stored["opencode-go-api-key"]).toHaveLength(2);
      expect(stored["opencode-go-api-key"][0]).toMatchObject({
        "api-key": "go-key-1234567890",
        name: "Go Main",
        disabled: true,
        priority: 3,
        "codex-tool-bridge": true,
      });
      // A channel that was just created has no record behind it: it is not given the first one's fields.
      expect(stored["opencode-go-api-key"][1]).toMatchObject({
        "api-key": "go-key-second-0987",
        name: "Go Second",
      });
      expect(stored["opencode-go-api-key"][1]).not.toHaveProperty("priority");
      expect(stored["opencode-go-api-key"][1]).not.toHaveProperty("codex-tool-bridge");
    });
  });

  describe("starting from the cached list", () => {
    test("a save before the first fetch returns still keeps them", async () => {
      seed({
        "codex-api-key": [
          {
            "api-key": "sk-codex-1234567890",
            name: "Codex Main",
            priority: 5,
            websockets: true,
            "alpha-search": true,
          },
        ],
      });
      localStorage.setItem("providers-page:tab", "codex");
      const user = userEvent.setup();

      // A first visit fills the cache...
      const first = renderPage();
      expect(await screen.findByText("Codex Main")).toBeInTheDocument();
      await waitFor(() =>
        expect(localStorage.getItem(PROVIDERS_PAGE_CACHE_KEY)).toContain("alpha-search"),
      );
      first.unmount();

      // ...and a later one paints from it while the list is still being fetched.
      holdBack("/codex-api-key");
      renderPage();
      expect(await screen.findByText("Codex Main")).toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: /More actions/i }));
      await user.click(await screen.findByRole("menuitem", { name: /Edit/i }));
      const dialog = await screen.findByRole("dialog", { name: /Edit Codex configuration/i });
      await user.click(within(dialog).getByRole("button", { name: /Save/ }));

      await waitFor(() => expect(mocks.put).toHaveBeenCalledTimes(1));
      expect(stored["codex-api-key"]).toEqual([
        {
          "api-key": "sk-codex-1234567890",
          name: "Codex Main",
          priority: 5,
          websockets: true,
          "alpha-search": true,
        },
      ]);
    });
  });

  describe("export and import", () => {
    const CODEX = {
      "api-key": "sk-codex-1234567890",
      name: "Codex Main",
      priority: 5,
      "alpha-search": true,
    };

    const openCodex = async (user: ReturnType<typeof userEvent.setup>) => {
      seed({ "codex-api-key": [CODEX] });
      renderPage();
      await user.click(await screen.findByRole("tab", { name: /Codex/ }));
      expect(await screen.findByText("Codex Main")).toBeInTheDocument();
    };

    const exportedText = async (user: ReturnType<typeof userEvent.setup>) => {
      await user.click(screen.getByRole("button", { name: /^Export JSON$/i }));
      await user.click(await screen.findByRole("menuitem", { name: /^Export JSON$/i }));
      const blob = createObjectURL.mock.calls[0]?.[0];
      if (!blob) throw new Error("nothing was exported");
      return blob.text();
    };

    const importFile = (text: string) =>
      new File([text], "codex.json", { type: "application/json" });

    test("an export includes them", async () => {
      const user = userEvent.setup();
      await openCodex(user);

      expect(JSON.parse(await exportedText(user)).items).toEqual([CODEX]);
    });

    test("importing that export again is not a change", async () => {
      const user = userEvent.setup();
      await openCodex(user);
      const text = await exportedText(user);

      await user.upload(screen.getByLabelText(/Import JSON/i), importFile(text));

      const dialog = await screen.findByRole("dialog", { name: /Import preview/i });
      expect(within(dialog).getByText(/No changes detected/i)).toBeInTheDocument();
      expect(within(dialog).getByRole("button", { name: /Confirm import/i })).toBeDisabled();
      expect(mocks.put).not.toHaveBeenCalled();
    });

    test("an imported file's fields are saved with it", async () => {
      const user = userEvent.setup();
      await openCodex(user);
      const text = JSON.stringify({
        provider: "codex",
        items: [{ ...CODEX, priority: 9, websockets: true }],
      });

      await user.upload(screen.getByLabelText(/Import JSON/i), importFile(text));
      const dialog = await screen.findByRole("dialog", { name: /Import preview/i });
      expect(within(dialog).getByRole("group", { name: /Updated: 1/i })).toBeInTheDocument();
      await user.click(within(dialog).getByRole("button", { name: /Confirm import/i }));

      await waitFor(() => expect(mocks.put).toHaveBeenCalledTimes(1));
      expect(stored["codex-api-key"]).toEqual([{ ...CODEX, priority: 9, websockets: true }]);
    });
  });
});
