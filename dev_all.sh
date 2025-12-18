#!/bin/bash
# Kill any process using Vite dev server ports 5173-5175
for port in 5173 5174 5175; do
  lsof -ti :$port | xargs -r kill -9 2>/dev/null || lsof -ti :$port | xargs kill -9 2>/dev/null
done
# Kill any Electron process running dist-electron/main.mjs
pkill -f "electron dist-electron/main.mjs" || true

# Build Electron main process
echo "Building Electron main process..."
cd /Users/leon.grant/projects/Proxx/frontend
pnpm run electron:build

# Start backend
(cd /Users/leon.grant/projects/Proxx/backend && PYTHONPATH=/Users/leon.grant/projects/Proxx/backend python3 -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8085) &
BACKEND_PID=$!

# Start Vite dev server, capture port
cd /Users/leon.grant/projects/Proxx/frontend
PORT=5173
pnpm dev -- --port $PORT > vite.log 2>&1 &
VITE_PID=$!

# Wait for Vite to be ready and get the port
while ! grep -qE 'Local: +http://localhost:[0-9]+' vite.log; do
  sleep 1
done
VITE_URL=$(grep -oE 'Local: +http://localhost:[0-9]+' vite.log | head -1 | awk '{print $2}')

# Start Electron with correct VITE_DEV_SERVER_URL
sleep 2
VITE_DEV_SERVER_URL=$VITE_URL npx electron@33 dist-electron/main.mjs

# Cleanup on exit
kill $BACKEND_PID $VITE_PID 2>/dev/null || true
