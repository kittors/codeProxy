# Auth File Quota Trends Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a first-tab auth-file trend view for Kimi and Codex credentials, backed by persisted quota snapshots and existing request logs.

**Architecture:** CliRelay persists normalized quota snapshot points keyed by `auth_index`, provider, quota key, window, and timestamp. codeProxy fetches per-file trend data and renders request totals, daily usage, and quota curves in the auth-file detail modal before the raw JSON tab.

**Tech Stack:** Go + SQLite + Gin management API; React 19 + Vite + Vitest + ECharts.

---

### Task 1: Codex Quota Dimensions

**Files:**

- Modify: `codeProxy/src/modules/quota/quota-codex.ts`
- Test: `codeProxy/src/modules/quota/__tests__/quota-helpers.test.ts`

- [x] Write a failing test for `additional_rate_limits` producing dynamic 5h/week quota items.
- [x] Run the targeted Vitest test and confirm it fails because the dynamic dimensions are missing.
- [x] Implement normalized dynamic Codex quota items with stable keys.
- [x] Re-run the targeted test and confirm it passes.

### Task 2: Backend Persistence And API

**Files:**

- Modify: `CliRelay/internal/usage/usage_db.go`
- Modify: `CliRelay/internal/api/handlers/management/quota.go`
- Modify: `CliRelay/internal/api/handlers/management/usage_logs_handler.go`
- Modify: `CliRelay/internal/api/server.go`
- Test: `CliRelay/internal/usage/usage_db_test.go`
- Test: `CliRelay/internal/api/handlers/management/usage_logs_handler_test.go`

- [x] Write failing Go tests for recording multiple quota points and querying a single auth file trend.
- [x] Run targeted Go tests and confirm they fail on missing APIs.
- [x] Add fine-grained quota snapshot storage, pruning, and single-file trend query helpers.
- [x] Add management endpoint for auth-file trends.
- [x] Re-run targeted Go tests and confirm they pass.

### Task 3: Frontend API And Detail Tab

**Files:**

- Modify: `codeProxy/src/lib/http/apis/usage.ts`
- Modify: `codeProxy/src/lib/http/types.ts`
- Modify: `codeProxy/src/modules/auth-files/components/AuthFileDetailModal.tsx`
- Modify: `codeProxy/src/modules/auth-files/hooks/useAuthFilesDetailEditors.ts`
- Modify: `codeProxy/src/modules/auth-files/AuthFilesPage.tsx`
- Test: `codeProxy/src/modules/auth-files/__tests__/AuthFileDetailModal.test.tsx`

- [x] Write failing component/API tests for the trend tab being first for Kimi/Codex.
- [x] Run targeted Vitest tests and confirm they fail.
- [x] Implement the trend API client, hook state, and ECharts-based detail tab.
- [x] Re-run targeted Vitest tests and confirm they pass.

### Task 4: Verification And Integration

- [x] Run codeProxy targeted tests, lint, format, format check, and build.
- [x] Run CliRelay targeted tests and `go test ./...`.
- [ ] Push feature branches and merge to `dev` per repository policy after verification.
