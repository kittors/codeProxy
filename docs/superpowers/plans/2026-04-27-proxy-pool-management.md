# Proxy Pool Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a reusable proxy pool that can be managed from the UI, checked for connectivity, and referenced by providers/auth files.

**Architecture:** Store proxy pool entries in the backend YAML config, expose focused management APIs, and resolve `proxy-id` at runtime before falling back to legacy `proxy-url`. The frontend owns a dedicated `proxies` module and only talks to the backend through `src/lib/http/apis/proxies.ts`.

**Tech Stack:** Go 1.26, Gin, YAML config, React 19, TypeScript, Vite, Vitest, Tailwind utility classes.

---

## File Structure

- Backend create: `internal/config/proxy_pool.go` for model normalization and lookup helpers.
- Backend modify: `internal/config/config.go`, provider config structs, auth type, management handlers, server routes, runtime proxy helpers.
- Frontend create: `src/lib/http/apis/proxies.ts`, `src/modules/proxies/ProxiesPage.tsx`, `src/modules/proxies/proxy-utils.ts`, tests under matching `__tests__`.
- Frontend modify: router, app shell navigation, provider/auth-file forms, i18n JSON, `AGENTS.md`.
- Tracking docs: `.helloagents/plan/2026-04-27--proxy-pool/tasks.md`, this plan, and design spec.

### Task 1: Backend Proxy Pool Model

**Files:**
- Create: `internal/config/proxy_pool.go`
- Modify: `internal/config/config.go`
- Test: `internal/config/proxy_pool_test.go`

- [ ] Write failing tests for URL validation, duplicate ID normalization, disabled entries, and `ResolveProxyURL(proxyID, fallbackURL)`.
- [ ] Run `go test ./internal/config -run 'TestProxyPool|TestResolveProxyURL'` and verify the tests fail because the model does not exist.
- [ ] Implement `ProxyPoolEntry`, `NormalizeProxyPool`, `ValidateProxyURL`, and `ResolveProxyURL`.
- [ ] Add `ProxyPool []ProxyPoolEntry yaml:"proxy-pool,omitempty" json:"proxy-pool,omitempty"` to `Config`.
- [ ] Run the targeted Go tests and then `go test ./internal/config`.

### Task 2: Backend Management API

**Files:**
- Create: `internal/api/handlers/management/proxy_pool.go`
- Modify: `internal/api/server.go`, `internal/api/handlers/management/config_basic.go`
- Test: `internal/api/handlers/management/proxy_pool_test.go`

- [ ] Write failing tests for list, replace, invalid URL rejection, masked list output, and connectivity check with a local `httptest.Server`.
- [ ] Run `go test ./internal/api/handlers/management -run ProxyPool` and verify failures.
- [ ] Implement `GetProxyPool`, `PutProxyPool`, and `PostProxyPoolCheck`.
- [ ] Register routes under `/management/proxy-pool`.
- [ ] Include proxy pool masking in sanitized config output.
- [ ] Run targeted management tests.

### Task 3: Backend Proxy-ID Runtime Resolution

**Files:**
- Modify: provider config structs in `internal/config/config.go` and `internal/config/vertex_compat.go`
- Modify: `sdk/cliproxy/auth/types.go`, watcher synthesizer, runtime executor proxy helpers, API tool transport helper
- Test: `internal/runtime/executor/proxy_helpers_test.go`, `internal/watcher/synthesizer/*_test.go`, `sdk/cliproxy/auth/*_test.go`

- [ ] Write failing tests proving `proxy-id` takes precedence over `proxy-url`, disabled/missing IDs fall back, and auth files persist/read `proxy_id`.
- [ ] Run targeted tests and verify failures.
- [ ] Add `ProxyID` fields and normalize them.
- [ ] Resolve `ProxyID` through config before building HTTP/WebSocket transports.
- [ ] Extend auth-file patch API to accept `proxy_id`.
- [ ] Run targeted runtime, watcher, and auth tests.

### Task 4: Frontend API and Proxy Management Page

**Files:**
- Create: `src/lib/http/apis/proxies.ts`
- Create: `src/modules/proxies/ProxiesPage.tsx`
- Create: `src/modules/proxies/proxy-utils.ts`
- Modify: `src/lib/http/apis.ts`, `src/app/AppRouter.tsx`, `src/modules/ui/AppShell.tsx`, i18n files
- Test: `src/modules/proxies/__tests__/ProxiesPage.test.tsx`, `src/lib/http/apis/__tests__/proxies.test.ts`, `src/modules/ui/__tests__/AppShell.test.ts`

- [ ] Write failing Vitest tests for route/nav rendering, CRUD payloads, masked URL display, and check button state.
- [ ] Run targeted Vitest tests and verify failures.
- [ ] Implement the API wrapper and page with existing UI primitives and Tailwind style patterns.
- [ ] Add menu item “代理管理” / “Proxy Management” / Russian fallback keys.
- [ ] Run targeted frontend tests.

### Task 5: Frontend Binding Controls

**Files:**
- Modify: provider modal/helper files under `src/modules/providers/`
- Modify: auth-files field editor files under `src/modules/auth-files/`
- Modify: shared HTTP types and i18n files
- Test: existing provider/auth-files tests plus new focused assertions

- [ ] Write failing tests proving provider and auth-file editors load proxy pool options and save `proxyId`/`proxy_id`.
- [ ] Run targeted tests and verify failures.
- [ ] Add a compact proxy pool selector beside existing manual proxy URL input.
- [ ] Keep manual URL fallback visible and preserve existing behavior when no proxy pool exists.
- [ ] Run targeted tests.

### Task 6: Documentation, Validation, and Merge Prep

**Files:**
- Modify: `AGENTS.md`, `.helloagents/plan/2026-04-27--proxy-pool/tasks.md`

- [ ] Update `AGENTS.md` key path index with the new proxy management module.
- [ ] Update task checklist and change/test report.
- [ ] Run frontend `bun run lint`, `bun run test`, `bun run build`.
- [ ] Run backend `go test ./...`.
- [ ] Review git diffs for unrelated changes before commit.

