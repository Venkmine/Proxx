INACTIVE — DOES NOT DESCRIBE CURRENT PRODUCT STATE (ALPHA)

PRODUCT_PROXY_V1.md

QA.md (Verify principles stay, “Definition of Done” does not)

NEXT_AFTER_V1.md

# Awaire Proxy — Current Status

## v1.0 — Initial Release

Awaire Proxy v1.0 is a standalone, boring, reliable watch-folder proxy generator.

### Core Features

- ✅ Watch folder ingestion
- ✅ Exactly-once file detection
- ✅ FFmpeg proxy generation
- ✅ Job queue with reordering
- ✅ Metadata passthrough
- ✅ Reporting (CSV/JSON/TXT)
- ✅ Restart recovery
- ✅ Operator UI

### QA System

- ✅ Verify framework implemented
- ✅ Unit tests
- ✅ Integration tests
- ✅ E2E tests with real FFmpeg
- ✅ Definition of Done enforced

### Out of Scope

- ❌ Resolve integration (quarantined in `backend/_future/`)
- ❌ Ingest/copy tooling
- ❌ Checksums
- ❌ Automation chains
- ❌ Federation
- ❌ Enterprise features

---

## UX Refactor: Preset + Deliver Consolidation (Completed)

### Layout Restructure
- ✅ Three-column layout: Preset Library | Preset Editor | Sources + Queue
- ✅ LEFT: PresetManager as library panel with "Editing: <name>" indicator
- ✅ CENTER: DeliverControlPanel as primary settings editor
- ✅ RIGHT: CreateJobPanel + Queue combined vertically

### Preset System
- ✅ Zustand store (`/stores/presetStore.ts`) for activePresetId, isDirty, isBurnInsEditorOpen
- ✅ Single source of truth for active preset across all UI components

### BurnIns Module
- ✅ Unified `BurnInsEditor` component (`/components/BurnInsEditor.tsx`)
- ✅ 16:9 static canvas with title/action-safe guides
- ✅ Text overlay with token insertion and position corners
- ✅ Image overlay with drag-to-position and opacity controls
- ✅ Centre-panel takeover when editing (closeable via X)

### Resolution & Framing
- ✅ Resolution presets: Source, 1080p, 2K, 720p, 540p
- ✅ Aspect ratio framing: Fit (letterbox/pillarbox), Fill (centre-crop), Stretch
- ✅ Custom bitrate option behind "Custom..." in codec presets

### Naming Templates
- ✅ New tokens: `{fps}`, `{proxy}`
- ✅ Separator tokens: `_`, `-`, `.`, space
- ✅ Inline help panel with token reference

### Metadata Panel
- ✅ Reorganized: Passthrough toggle at top
- ✅ Checkbox tree visible without scrolling
- ✅ Clear hierarchy for metadata categories

## Running Verify

```bash
make verify-fast    # Lint + unit tests
make verify         # + integration tests
make verify-full    # + E2E transcodes
```

---

## UX Coherence Pass: Workspace Modes + Queue Layout (Completed)

### Workspace Mode System
- ✅ Zustand store (`/stores/workspaceModeStore.ts`) for authoritative layout control
- ✅ Three modes: `configure`, `design`, `execute`
- ✅ App.tsx branches layout width/visibility based on mode
- ✅ Design mode: full-width takeover, right panel hidden
- ✅ Execute mode: expanded queue panel, narrower settings

### Queue + Sources Layout
- ✅ SplitterPanel component for resizable vertical split
- ✅ Sources (45%) / Queue (55%) default ratio
- ✅ Minimum queue height 220px enforced
- ✅ Drag handle for user-adjustable split

### Panel Grouping Improvements
- ✅ Container moved to Video section as "Container (Output)"
- ✅ File section renamed to "File Naming" (template, prefix/suffix, policy)
- ✅ Metadata passthrough callout prominent at section top

### Overlay Enhancements
- ✅ TimecodeBurnInPanel component for source timecode overlay
- ✅ Position anchors, font, size, opacity, background box
- ✅ Integrated into Watermarks section before text burn-ins

### Splash Screen
- ✅ Click-to-dismiss after engine checks complete
- ✅ "Continue →" button when engines missing
- ✅ Dismiss hint shown when ready
