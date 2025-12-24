#!/bin/bash
# ==============================================================================
# ⚠️  DEPRECATED - DO NOT USE
# ==============================================================================
# This script has been replaced by the unified START script.
# 
# Please use instead:
#   ./START
#
# This file remains for historical reference only.
# ==============================================================================

echo "❌ This script is deprecated."
echo ""
echo "Please use the unified launcher instead:"
echo ""
echo "    ./START"
echo ""
exit 1

# OLD CODE BELOW - KEPT FOR REFERENCE
# ==============================================================================
#!/usr/bin/env bash
set -euo pipefail

# Dev startup helper — robustly start backend, frontend (vite) and electron.
# Kills stale listeners, uses the project's venv python, writes logs, and waits for services.

ROOT_DIR="/Users/leon.grant/projects/Proxx"
FRONTEND_DIR="$ROOT_DIR/frontend"
BACKEND_DIR="$ROOT_DIR/backend"
VENV_PY="$ROOT_DIR/.venv/bin/python"

echo "Cleaning stale ports and processes..."
for port in 5173 5174 5175 8085; do
  pids=$(lsof -ti tcp:$port -sTCP:LISTEN -n || true)
  if [ -n "$pids" ]; then
    echo "Killing listeners on port $port: $pids"
    echo "$pids" | xargs -r -n1 kill -9 || true
  fi
done
pkill -f "electron dist-electron/main.mjs" || true

echo "Building Electron main process (typescript)..."
cd "$FRONTEND_DIR"
pnpm run electron:build

echo "Starting backend (uvicorn)..."
cd "$BACKEND_DIR"
backend_log="$ROOT_DIR/backend/backend.log"
mkdir -p "$(dirname "$backend_log")"
env PYTHONPATH="$BACKEND_DIR" "$VENV_PY" -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8085 >"$backend_log" 2>&1 &
BACKEND_PID=$!
echo "backend pid=$BACKEND_PID (logs: $backend_log)"

echo "Waiting for backend /health..."
for i in {1..30}; do
  if curl -sS http://127.0.0.1:8085/health >/dev/null 2>&1; then
    echo "backend healthy"
    break
  fi
  sleep 1
  if [ $i -eq 30 ]; then
    echo "backend failed to start after 30s; see $backend_log"
    tail -n 200 "$backend_log" || true
    exit 1
  fi
done

echo "Starting Vite dev server..."
cd "$FRONTEND_DIR"
vite_log="$ROOT_DIR/frontend/vite.log"
pnpm dev -- --port 5173 >"$vite_log" 2>&1 &
VITE_PID=$!
echo "vite pid=$VITE_PID (logs: $vite_log)"

echo "Waiting for Vite to be ready..."
for i in {1..60}; do
  if grep -qE 'Local: +http://localhost:[0-9]+' "$vite_log"; then
    VITE_URL=$(grep -oE 'Local: +http://localhost:[0-9]+' "$vite_log" | head -1 | awk '{print $2}')
    echo "vite ready at $VITE_URL"
    break
  fi
  sleep 1
  if [ $i -eq 60 ]; then
    echo "vite failed to start; see $vite_log"
    tail -n 200 "$vite_log" || true
    exit 1
  fi
done

echo "Starting Electron (development attach)..."
VITE_DEV_SERVER_URL=${VITE_URL} npx electron@33 dist-electron/main.mjs &
ELECTRON_PID=$!
echo "electron pid=$ELECTRON_PID"

cleanup() {
  echo "Shutting down dev processes..."
  kill -TERM "$ELECTRON_PID" "$VITE_PID" "$BACKEND_PID" 2>/dev/null || true
}
trap cleanup EXIT

echo "Dev environment started. Backend:$BACKEND_PID Vite:$VITE_PID Electron:$ELECTRON_PID"
wait
