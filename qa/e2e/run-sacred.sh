#!/bin/bash
# Run the sacred test with backend

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
BACKEND_DIR="$PROJECT_ROOT/backend"
BACKEND_LOG="/tmp/proxx_backend.log"
BACKEND_PID=""

cleanup() {
  if [[ -n "$BACKEND_PID" ]]; then
    echo "[run-sacred] Stopping backend (PID: $BACKEND_PID)..."
    kill "$BACKEND_PID" 2>/dev/null || true
    wait "$BACKEND_PID" 2>/dev/null || true
  fi
}

trap cleanup EXIT

# Kill any existing backend
echo "[run-sacred] Cleaning up existing backend processes..."
lsof -ti :8085 | xargs kill -9 2>/dev/null || true
sleep 1

# Start backend in background
echo "[run-sacred] Starting backend..."
cd "$BACKEND_DIR"
PYTHONPATH="$BACKEND_DIR" .venv/bin/python -m uvicorn app.main:app --host 127.0.0.1 --port 8085 > "$BACKEND_LOG" 2>&1 &
BACKEND_PID=$!

# Wait for backend to be ready
echo "[run-sacred] Waiting for backend to be ready..."
for i in {1..30}; do
  if curl -s --max-time 2 http://127.0.0.1:8085/health > /dev/null 2>&1; then
    echo "[run-sacred] Backend is ready!"
    break
  fi
  if [[ $i -eq 30 ]]; then
    echo "[run-sacred] Backend failed to start. Log:"
    cat "$BACKEND_LOG"
    exit 1
  fi
  sleep 1
done

# Run the sacred test
echo "[run-sacred] Running sacred test..."
cd "$SCRIPT_DIR"
E2E_TEST=true npx playwright test sacred_meta_test.spec.ts --timeout=120000
TEST_EXIT=$?

echo "[run-sacred] Test completed with exit code: $TEST_EXIT"
exit $TEST_EXIT
