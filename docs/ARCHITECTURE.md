INACTIVE — DOES NOT DESCRIBE CURRENT PRODUCT STATE (ALPHA)

PRODUCT_PROXY_V1.md

QA.md (Verify principles stay, “Definition of Done” does not)

NEXT_AFTER_V1.md

# Awaire Proxy — Architecture Overview

**Last Updated:** December 23, 2025  
**Status:** Active (describes current product state)

This document describes the current technical structure of Awaire Proxy,
focusing on the **preview-centric UX architecture** introduced in the December 2025 overhaul.

## High-Level Overview

Awaire Proxy is a desktop application composed of:

- An Electron-based desktop shell
- A React frontend with **preview-centric multimodal workspace**
- A local Python backend service
- Local IPC over HTTP (localhost)
- FFmpeg for media transcoding

---

## UX Architecture Principles

### 1. Preview as Primary Workspace

The **VisualPreviewWorkspace** is THE primary interaction surface, not a passive display.

**Design principle:** If it's spatial, it renders and edits in the preview workspace.

**Modes:**
- **View** — Playback and viewing
- **Overlays** — Direct manipulation of overlays (drag, scale, position with bounding boxes)
- **Burn-In** — Data burn-in preview with full Resolve-style metadata tokens

Side panels are **inspectors only**. They provide settings controls but never render their own previews.

### 2. Global Drag & Drop (Canonical Ingestion)

All file/folder drops route through a **single global drop zone** at the App.tsx root.

**Implementation:**
- `useGlobalFileDrop` hook attaches document-level listeners
- `GlobalDropZone` provides visual overlay during drag
- All drops call `useIngestion.addPendingPaths()` (canonical ingestion entry point)
- Supports:
  - Files
  - Folders (recursive with webkitGetAsEntry)
  - Deduplication

**No panel-local drop zones.** Everything goes through the authoritative ingestion pipeline.

### 3. Left Sidebar: Browse/Loaded Media Tabs

The left sidebar is a **tabbed media workspace**, not a stacked panel trap.

**Structure:**
```
MediaWorkspace
├── Tab: Loaded Media
│   └── CreateJobPanel (sources, settings, output)
└── Tab: Browse
    └── DirectoryNavigator (filesystem tree browser)
```

**Scrolling rules:**
- Container: `display: flex; flex-direction: column; min-height: 0`
- Active tab: `flex: 1; overflow-y: auto`
- NO fixed heights anywhere
- NO nested scroll traps

### 4. Preset Centralization

**Single source of truth:** All presets managed via `usePresets` hook + `PresetManager` component.

Side panels show **"Active Preset: X"** reference only. No duplicate preset selectors.

**Preset types:**
- Settings presets (codec, resolution, overlays, metadata)
- Source presets (folder rules)
- Output presets (paths, naming)
- Combined presets

**Storage:**
- Alpha: LocalStorage (`awaire_proxy_presets`)
- V1: Backend (`/control/presets` API)

### 5. Workspace Mode Authority

`workspaceStore.mode` is the **authoritative layout driver**.

**Modes:**
- `configure` — Job creation and settings
- `design` — Overlay editing (spatial)
- `execute` — Queue monitoring

**Rule:** ALL layout decisions branch on workspace mode. No component may "adapt itself" without checking mode.

---

## Components

### Frontend

- Electron provides the desktop runtime
- React renders the UI
- Frontend communicates with backend via HTTP
- State derives from backend, never the reverse

Location: `frontend/`

**Key Components:**

#### VisualPreviewWorkspace
**Single source of truth for preview.**

Features:
- Multimodal (View/Overlays/Burn-In)
- Video playback with Resolve-grade controls
- Timecode HUD (REC TC / SRC TC)
- Drag-to-position overlays
- Title-safe and action-safe guides
- Fullscreen support (ESC to exit, overlays + TC persist)

File: `frontend/src/components/VisualPreviewWorkspace.tsx`

#### MediaWorkspace
**Tabbed left sidebar for Browse/Loaded Media.**

Combines:
- `CreateJobPanel` (Loaded Media tab)
- `DirectoryNavigator` (Browse tab)
- `SourceMetadataPanel` (always visible footer)

File: `frontend/src/components/MediaWorkspace.tsx`

#### GlobalDropZone
**Full-viewport drag overlay for file/folder drops.**

Two drop zones:
- Source files (left) — adds to job sources
- Output directory (right) — sets destination

File: `frontend/src/components/GlobalDropZone.tsx`

#### useIngestion Hook
**Canonical entry point for job creation.**

Methods:
- `addPendingPaths(paths[])` — stage files for ingestion
- `ingest()` — create job from pending paths
- `clearPendingPaths()` — reset

Calls backend: `POST /control/jobs/create`

File: `frontend/src/hooks/useIngestion.ts`

#### usePresets Hook
**Client-side preset management (Alpha).**

CRUD operations:
- `create`, `update`, `rename`, `duplicate`, `delete`
- `selectPreset(id)` — apply settings
- `markDirty()` / `clearDirty()` — unsaved changes tracking
- `exportPresets()` / `importPresets()` — JSON I/O

File: `frontend/src/hooks/usePresets.ts`

Structure:
```
frontend/
├── electron/
│   ├── main.ts           # Electron main process
│   └── preload.ts        # Context bridge
├── src/
│   ├── App.tsx           # Root component (global drop zone attached here)
│   ├── main.tsx          # React entry point
│   ├── components/
│   │   ├── VisualPreviewWorkspace.tsx  # Preview workspace (multimodal)
│   │   ├── MediaWorkspace.tsx          # Left sidebar tabs
│   │   ├── GlobalDropZone.tsx          # Drag & drop overlay
│   │   ├── CreateJobPanel.tsx          # Loaded Media panel
│   │   ├── DirectoryNavigator.tsx      # Browse panel
│   │   └── DeliverControlPanel.tsx     # Settings inspector
│   ├── hooks/
│   │   ├── useIngestion.ts             # Canonical ingestion
│   │   ├── usePresets.ts               # Preset management
│   │   └── useGlobalFileDrop.ts        # Global drag state
│   └── stores/
│       ├── workspaceModeStore.ts       # Authoritative layout mode
│       └── presetStore.ts              # Preset UI state
├── index.html
├── package.json
├── tsconfig.json
└── vite.config.ts
```

### Backend

- Python FastAPI service
- SQLite for persistence
- FFmpeg subprocess execution
- Watch folder scanning

Location: `backend/`

Structure:
```
backend/
├── app/
│   ├── main.py           # FastAPI app initialization
│   ├── cli/              # CLI commands
│   ├── deliver/          # Deliver capability model
│   ├── execution/        # FFmpeg execution engine
│   ├── jobs/             # Job engine
│   ├── metadata/         # Media metadata extraction
│   ├── monitoring/       # Job status server
│   ├── persistence/      # SQLite storage
│   ├── presets/          # Preset system
│   ├── reporting/        # Job/clip reports
│   ├── routes/           # HTTP endpoints
│   └── watchfolders/     # Watch folder scanning
├── requirements.txt
└── run_dev.sh
```

### Execution Engine

FFmpeg is the only supported execution engine.

The execution pipeline:
1. Job receives clips from watch folder or manual add
2. Each clip becomes a task
3. FFmpeg subprocess generates proxy
4. ffprobe validates output
5. Results reported

### Data Flow

```
Watch Folder → Job Registry → Task Queue → FFmpeg → Output + Report
                    ↓
              Persistence (SQLite)
                    ↓
              Monitoring Server → Frontend UI
```

## Execution Model

- Backend and frontend run as separate processes
- Backend: `uvicorn app.main:app` on port 8085
- Frontend: Vite dev server on port 5173, Electron shell
- Combined launcher: `./dev_launch.sh`

## Data & State

- SQLite database: `./awaire_proxy.db`
- Job state persisted across restarts
- Watch folder state tracked for exactly-once ingestion

## QA System

Verify is the QA framework. See `qa/` for implementation.

Verification levels:
- `verify proxy fast` — lint, unit tests, schema validation
- `verify proxy` — integration tests, watch folder simulation
- `verify proxy full` — real FFmpeg transcodes, ffprobe validation
