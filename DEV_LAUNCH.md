# Proxx Development Launcher

**Foolproof script to start the complete Proxx development environment.**

## Usage

From the project root:

```bash
bash dev_launch.sh
```

Or make it executable once and run directly:

```bash
chmod +x dev_launch.sh
./dev_launch.sh
```

## What It Does

The script handles the complete startup sequence with health checks:

1. **Cleanup** — Kills any existing backend/Vite/Electron processes and frees ports
2. **Backend** — Starts uvicorn on `http://127.0.0.1:8085` and waits for health check
3. **Vite** — Starts Vite dev server on `http://127.0.0.1:5173` and waits for ready signal
4. **Electron Build Check** — Rebuilds `dist-electron/` if TypeScript sources changed
5. **Electron Launch** — Starts Electron with `VITE_DEV_SERVER_URL` pointing to Vite

## Features

- ✅ **Health checks** ensure each service is ready before starting the next
- ✅ **Auto-rebuild** detects stale Electron builds and recompiles TypeScript
- ✅ **Process cleanup** on exit (Ctrl+C kills backend + Vite gracefully)
- ✅ **Logs** written to `/tmp/proxx_backend.log` and `/tmp/proxx_vite.log`
- ✅ **Exponential backoff** for Electron loadURL retries (handles slow Vite startup)

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

## Manual Launch (Old Way)

If you prefer manual control:

```bash
# Terminal 1: Backend
cd backend
source ../.venv/bin/activate
PYTHONPATH=/Users/leon.grant/projects/Proxx/backend python3 -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8085

# Terminal 2: Vite
cd frontend
pnpm dev

# Terminal 3: Electron (after Vite is ready)
cd frontend
VITE_DEV_SERVER_URL=http://127.0.0.1:5173 npx electron dist-electron/main.mjs
```

## Architecture Notes

- **Backend** runs on 127.0.0.1:8085 (not localhost to avoid IPv6 issues)
- **Vite** dev server on 127.0.0.1:5173
- **Electron** loads renderer from Vite in dev mode via `VITE_DEV_SERVER_URL`
- **Retry logic** in `electron/main.ts` handles transient connection resets during Vite startup
