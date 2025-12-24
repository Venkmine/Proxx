# Proxx Development Launcher

**⚠️ This document is deprecated. See [QUICKSTART.md](QUICKSTART.md) instead.**

## Current Launcher

Use the unified `START` script:

```bash
./START
```

## What It Does

The script handles the complete startup sequence with health checks:

1. **Cleanup** — Kills any existing backend/Vite/Electron processes and frees ports
2. **Backend** — Starts uvicorn on `http://127.0.0.1:8085` and waits for health check
3. **Vite** — Starts Vite dev server on `http://127.0.0.1:5173` and waits for ready signal
4. **Electron Build** — Rebuilds `dist-electron/` if TypeScript sources changed
5. **Electron Launch** — Starts Electron with `VITE_DEV_SERVER_URL` pointing to Vite

## Features

- ✅ **Health checks** ensure each service is ready before starting the next
- ✅ **Auto-rebuild** detects stale Electron builds and recompiles TypeScript
- ✅ **Process cleanup** on exit (Ctrl+C kills backend + Vite gracefully)
- ✅ **Logs** written to `/tmp/proxx_backend.log` and `/tmp/proxx_vite.log`
- ✅ **Colored output** with timestamps for easy debugging

## Troubleshooting

If launch fails:

```bash
# Check backend logs
tail -f /tmp/proxx_backend.log

# Check Vite logs
tail -f /tmp/proxx_vite.log

# Manually verify ports are free
lsof -ti :8085 :5173
```

## Manual Launch

If you prefer manual control:

```bash
# Terminal 1: Backend
cd backend
source ../.venv/bin/activate
uvicorn app.main:app --reload --host 127.0.0.1 --port 8085

# Terminal 2: Frontend (Vite)
cd frontend
pnpm dev

# Terminal 3: Frontend (Electron)
cd frontend
pnpm run electron:dev
```
