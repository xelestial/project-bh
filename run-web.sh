#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HOST="${HOST:-127.0.0.1}"
PORT="${PORT:-5173}"
BACKEND_PORT="${BACKEND_PORT:-8787}"

cd "$ROOT_DIR"

exec pnpm dev:web -- --host "$HOST" --port "$PORT" --backend-port "$BACKEND_PORT"
