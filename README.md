# Proxx

Resolve-orchestrated, unattended, studio-grade proxy and transcode engine.

## Current Phase

**Phase 1: Project Scaffolding** — Complete  
**Phase 2: Preset System Foundations** — Active

See `docs/TODO.md` for current status.

---

## Development Setup

### Prerequisites

- **Python 3.11+**
- **Node.js 18+**
- **npm or yarn**

### Backend Setup

```bash
cd backend
pip install -r requirements.txt
./run_dev.sh
```

Backend runs on `http://127.0.0.1:8000`

**Health check:**
```bash
curl http://127.0.0.1:8000/health
```

### Frontend Setup

```bash
cd frontend
npm install
npm run dev
```

Electron window will launch automatically.

### Combined Launcher

Start both backend and frontend with one command:

```bash
./scripts/dev.sh
```

---

## Project Structure

```
proxx/
├─ docs/              # Project documentation
├─ frontend/          # Electron + React UI
├─ backend/           # Python FastAPI service
└─ scripts/           # Development utilities
```

---

## Documentation

- `docs/PRODUCT.md` — Product vision and requirements
- `docs/CONSTRAINTS.md` — Hard architectural and operational constraints
- `docs/ARCHITECTURE.md` — System design and component relationships
- `docs/TODO.md` — Current phase and progress tracking
- `docs/DECISIONS.md` — Key technical decisions and rationale

---

## Repository

https://github.com/Venkmine/Proxx
