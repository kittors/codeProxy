#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

bun install --frozen-lockfile
bun run lint
bun run design:check
bun run test:ci
bun run build
bun run bundle:diff

# Critical multi-tenant / auth browser smoke (mock APIs; no real backend).
# Full E2E stays optional — only @critical tags run on every PR.
if [[ "${SKIP_E2E_CRITICAL:-}" == "1" ]]; then
  echo "SKIP_E2E_CRITICAL=1 — skipping Playwright critical smoke"
  exit 0
fi

if ! command -v bunx >/dev/null 2>&1; then
  echo "bunx is required for Playwright critical smoke" >&2
  exit 1
fi

# Install browser only when missing; CI runners are clean so this is needed once.
bunx playwright install chromium
bunx playwright test e2e/multi-tenant-auth.spec.ts e2e/login-lifecycle.spec.ts --grep '@critical'
