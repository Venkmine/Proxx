#!/usr/bin/env bash
set -e

# ==============================================================================
# Proxx Development Launcher
# ==============================================================================
# Foolproof dev environment startup with health checks and proper sequencing.
# 
# Usage:
#   bash dev_launch.sh
#
# What it does:
# 1. Kills any existing dev processes (backend/vite/electron)
# 2. Starts backend (uvicorn) on 127.0.0.1:8085
# 3. Waits for backend health check
# 4. Starts Vite dev server on port 5173
# 5. Waits for Vite to be ready
# 6. Rebuilds Electron main/preload (if needed)
# 7. Launches Electron in dev mode
# ==============================================================================

PROJECT_ROOT="/Users/leon.grant/projects/Proxx"
BACKEND_PORT=8085
VITE_PORT=5173
BACKEND_URL="http://127.0.0.1:${BACKEND_PORT}"
VITE_URL="http://127.0.0.1:${VITE_PORT}"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🚀 Proxx Development Launcher"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# ==============================================================================
# Step 1: Kill existing processes
# ==============================================================================
echo ""
echo "🔹 Step 1: Cleaning up existing processes..."

pkill -9 -f "vite|uvicorn|electron" 2>/dev/null || true
lsof -ti :${BACKEND_PORT} | xargs kill -9 2>/dev/null || true
lsof -ti :${VITE_PORT} | xargs kill -9 2>/dev/null || true

sleep 2
echo "✓ Cleanup complete"

# ==============================================================================
# Step 2: Start Backend (uvicorn)
# ==============================================================================
echo ""
echo "🔹 Step 2: Starting backend (uvicorn on ${BACKEND_URL})..."

cd "${PROJECT_ROOT}/backend"
source "${PROJECT_ROOT}/.venv/bin/activate"

# Start backend in background
PYTHONPATH="${PROJECT_ROOT}/backend" python3 -m uvicorn app.main:app \
  --reload \
  --host 127.0.0.1 \
  --port ${BACKEND_PORT} \
  > /tmp/proxx_backend.log 2>&1 &

BACKEND_PID=$!
echo "✓ Backend started (PID: ${BACKEND_PID})"

# Wait for backend health check (max 20 seconds)
echo "⏳ Waiting for backend health check..."
for i in {1..20}; do
  if curl -s -f "${BACKEND_URL}/health" > /dev/null 2>&1; then
    echo "✓ Backend is healthy"
    break
  fi
  if [ $i -eq 20 ]; then
    echo "❌ Backend failed to start within 20 seconds"
    echo "   Check logs: tail -f /tmp/proxx_backend.log"
    exit 1
  fi
  sleep 1
done

# ==============================================================================
# Step 3: Start Vite Dev Server
# ==============================================================================
echo ""
echo "🔹 Step 3: Starting Vite dev server (${VITE_URL})..."

cd "${PROJECT_ROOT}/frontend"

# Start Vite in background
pnpm dev > /tmp/proxx_vite.log 2>&1 &
VITE_PID=$!
echo "✓ Vite started (PID: ${VITE_PID})"

# Wait for Vite to be ready (max 15 seconds)
echo "⏳ Waiting for Vite dev server..."
for i in {1..15}; do
  if curl -s -f "${VITE_URL}" > /dev/null 2>&1; then
    echo "✓ Vite is ready"
    break
  fi
  if [ $i -eq 15 ]; then
    echo "❌ Vite failed to start within 15 seconds"
    echo "   Check logs: tail -f /tmp/proxx_vite.log"
    exit 1
  fi
  sleep 1
done

# ==============================================================================
# Step 4: Rebuild Electron (main/preload) if needed
# ==============================================================================
echo ""
echo "🔹 Step 4: Checking Electron build..."

cd "${PROJECT_ROOT}/frontend"

# Check if dist-electron exists and has recent builds
if [ ! -f "dist-electron/main.mjs" ] || [ ! -f "dist-electron/preload.mjs" ]; then
  echo "⚠️  Electron builds not found, rebuilding..."
  pnpm run electron:build
  echo "✓ Electron build complete"
else
  # Check if TypeScript sources are newer than builds
  MAIN_TS_MODIFIED=$(stat -f %m electron/main.ts 2>/dev/null || echo 0)
  MAIN_MJS_MODIFIED=$(stat -f %m dist-electron/main.mjs 2>/dev/null || echo 0)
  
  if [ "$MAIN_TS_MODIFIED" -gt "$MAIN_MJS_MODIFIED" ]; then
    echo "⚠️  Electron sources changed, rebuilding..."
    pnpm run electron:build
    echo "✓ Electron build complete"
  else
    echo "✓ Electron builds are up to date"
  fi
fi

# ==============================================================================
# Step 5: Launch Electron
# ==============================================================================
echo ""
echo "🔹 Step 5: Launching Electron..."
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ All services ready!"
echo ""
echo "   Backend:  ${BACKEND_URL}"
echo "   Vite:     ${VITE_URL}"
echo "   Electron: Launching..."
echo ""
echo "   Logs:"
echo "   - Backend: tail -f /tmp/proxx_backend.log"
echo "   - Vite:    tail -f /tmp/proxx_vite.log"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Give Vite one more second to settle
sleep 1

# Launch Electron in foreground (so we can Ctrl+C to exit)
cd "${PROJECT_ROOT}/frontend"
VITE_DEV_SERVER_URL="${VITE_URL}" npx electron dist-electron/main.mjs

# ==============================================================================
# Cleanup on exit
# ==============================================================================
echo ""
echo "🔹 Shutting down..."
kill $BACKEND_PID 2>/dev/null || true
kill $VITE_PID 2>/dev/null || true
echo "✓ Cleanup complete"
