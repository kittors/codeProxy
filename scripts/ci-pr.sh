#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

bun install --frozen-lockfile
bun run lint
bun run test:ci
bun run build
bun run bundle:diff
