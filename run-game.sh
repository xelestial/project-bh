#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HOST="${HOST:-127.0.0.1}"
SERVER_PORT="${SERVER_PORT:-8787}"
WEB_PORT="${WEB_PORT:-5173}"

cd "$ROOT_DIR"

cleanup() {
  if [[ -n "${SERVER_PID:-}" ]]; then
    kill "$SERVER_PID" >/dev/null 2>&1 || true
  fi
}

trap cleanup EXIT INT TERM

pnpm dev:server -- --host "$HOST" --port "$SERVER_PORT" &
SERVER_PID=$!

sleep 1

exec pnpm dev:web -- --host "$HOST" --port "$WEB_PORT" --backend-port "$SERVER_PORT"
