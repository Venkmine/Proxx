# 🤖 AI Assistant Instructions for Proxx Development

## Critical Information for AI Coding Assistants

### Single Launch Command

**There is ONE and ONLY ONE script to launch Proxx in development:**

```bash
./START
```

Run this from the project root (`/Users/leon.grant/projects/Proxx/`).

### DO NOT use these deprecated scripts:
- ❌ `dev_all.sh` (deprecated)
- ❌ `dev_launch.sh` (deprecated)
- ❌ Any other `dev_*.sh` scripts

### What START Does

The `START` script in the project root:

1. **Validates environment** - Checks for Python venv, pnpm, dependencies
2. **Cleans processes** - Kills stale backend/Vite/Electron on ports 8085/5173
3. **Starts backend** - Python FastAPI on `http://127.0.0.1:8085` with health check
4. **Starts Vite** - Dev server on `http://127.0.0.1:5173` with health check
5. **Builds Electron** - Compiles TypeScript main/preload if needed
6. **Launches app** - Electron desktop application
7. **Handles cleanup** - Ctrl+C stops all services gracefully

### Log Files

If something fails, check:
- Backend: `/tmp/proxx_backend.log`
- Frontend: `/tmp/proxx_vite.log`

### Project Structure

```
/Users/leon.grant/projects/Proxx/
├── START              ← THE ONLY LAUNCHER TO USE
├── backend/           ← Python FastAPI (port 8085)
│   ├── app/          
│   └── .venv/        ← Python virtual environment
├── frontend/          ← React + Electron (Vite on 5173)
│   ├── src/          ← React app
│   ├── electron/     ← Electron main/preload
│   └── dist-electron/ ← Built Electron files
└── qa/               ← Test suites

```

### Common Issues

**"Exit Code 127"** - Usually means a command wasn't found:
- Check pnpm is installed: `pnpm --version`
- Check venv exists: `ls .venv/bin/python3`
- Check dependencies: `cd frontend && pnpm install`

**"Port already in use"** - START script handles this automatically via cleanup

**"Backend failed to start"** - Check `/tmp/proxx_backend.log`

**"Vite failed to start"** - Check `/tmp/proxx_vite.log`

### Quick Commands

```bash
# Start development (THE ONLY WAY)
./START

# Or via Make
make dev

# Run QA tests
make verify-fast    # Lint, unit tests, schema
make verify         # + integration tests  
make verify-full    # + E2E tests

# Manual backend only (for debugging)
cd backend && source ../.venv/bin/activate && uvicorn app.main:app --reload --port 8085

# Manual frontend only (for debugging)
cd frontend && pnpm dev
```

### When User Reports "Frontend failing to launch"

1. Check if `pnpm` is installed: `pnpm --version`
2. Check if dependencies installed: `ls frontend/node_modules`
3. Run: `cd frontend && pnpm install`
4. Then: `./START`

### Architecture

- **Backend**: Python 3.11+, FastAPI, SQLite, FFmpeg integration
- **Frontend**: React 18, TypeScript, Electron 33, Vite 6, Zustand state
- **Communication**: Backend REST API on 8085, Frontend loads via Vite on 5173
- **Desktop**: Electron wraps Vite dev server in development

### Files to Read for Context

- [README.md](README.md) - Project overview
- [QUICKSTART.md](QUICKSTART.md) - Quick start guide
- [backend/app/main.py](backend/app/main.py) - Backend entry
- [frontend/src/App.tsx](frontend/src/App.tsx) - Frontend entry
- [frontend/electron/main.ts](frontend/electron/main.ts) - Electron main process

---

**Remember**: Always use `./START` - it's the single source of truth for launching Proxx in development mode.
