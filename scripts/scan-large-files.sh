#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORKSPACE_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

FRONTEND_SRC="$WORKSPACE_ROOT/codeProxy/src"
BACKEND_ROOT="$WORKSPACE_ROOT/CliRelay"

echo "== codeProxy large TS/TSX files (>= 800 lines) =="
if [[ -d "$FRONTEND_SRC" ]]; then
  find "$FRONTEND_SRC" -type f \( -name '*.ts' -o -name '*.tsx' \) -print0 \
    | xargs -0 wc -l \
    | awk '$1 >= 800 {print $1, $2}' \
    | sort -nr
else
  echo "codeProxy src directory not found: $FRONTEND_SRC" >&2
fi

echo
echo "== CliRelay large Go files (>= 1000 lines) =="
if [[ -d "$BACKEND_ROOT" ]]; then
  find "$BACKEND_ROOT" -type f -name '*.go' -not -path '*/vendor/*' -print0 \
    | xargs -0 wc -l \
    | awk '$1 >= 1000 {print $1, $2}' \
    | sort -nr
else
  echo "CliRelay directory not found: $BACKEND_ROOT" >&2
fi
