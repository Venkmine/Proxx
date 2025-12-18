#!/bin/bash
# Kill any process using Vite dev server port 5173
lsof -ti :5173 | xargs -r kill -9
# Kill any process using Vite dev server port 5174
lsof -ti :5174 | xargs -r kill -9
# Kill any process using Vite dev server port 5175
lsof -ti :5175 | xargs -r kill -9
# Kill any Electron process running dist-electron/main.mjs
pkill -f "electron dist-electron/main.mjs" || true
# Start Vite dev server
(cd /Users/leon.grant/projects/Proxx/frontend && pnpm dev) &
sleep 3
# Start Electron with correct VITE_DEV_SERVER_URL
(cd /Users/leon.grant/projects/Proxx/frontend && VITE_DEV_SERVER_URL=http://localhost:5173 npx electron@33 dist-electron/main.mjs)
