# Proxx Quick Start

## For AI Assistants & New Developers

**There is ONE and ONLY ONE way to start Proxx in development mode:**

```bash
./START
```

That's it. Run this from the project root.

## What It Does

The `START` script is the **single source of truth** for launching Proxx:

1. ✅ **Cleans up** - Kills any stale backend/Vite/Electron processes
2. ✅ **Backend** - Starts Python FastAPI server on port 8085 with health check
3. ✅ **Frontend** - Starts Vite dev server on port 5173 with health check
4. ✅ **Electron** - Rebuilds if needed, then launches the desktop app
5. ✅ **Graceful shutdown** - Press Ctrl+C to stop all services cleanly

## Prerequisites

- Python 3.11+ with venv at `.venv/`
- Node.js 18+ with pnpm installed
- FFmpeg on PATH
- Frontend dependencies installed (`cd frontend && pnpm install`)

## Troubleshooting

If the script fails, check the logs:

```bash
# Backend logs
tail -f /tmp/proxx_backend.log

# Vite logs  
tail -f /tmp/proxx_vite.log
```

## Other Scripts (DO NOT USE)

- ❌ `dev_all.sh` - DEPRECATED
- ❌ `dev_launch.sh` - DEPRECATED  

These old scripts are kept for historical reference but will exit with an error. Always use `./START`.

## Manual Launch (Advanced)

If you need manual control for debugging:

```bash
# Terminal 1: Backend
cd backend
source ../.venv/bin/activate
PYTHONPATH=backend python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8085

# Terminal 2: Vite
cd frontend
pnpm dev

# Terminal 3: Electron
cd frontend
pnpm run electron:dev
```
