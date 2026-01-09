# Phase 6: Preset System Truth + Watch Folder Contract Readiness

**Date:** January 9, 2026  
**Status:** Complete  
**Purpose:** Make presets real, persistent, and authoritative. Prepare watch folders for future auto-transcoding.

---

## Goals Achieved

### 1. Preset Persistence (FOUNDATIONAL)
- ✅ Disk-backed preset store (`userData/presets.json`)
- ✅ Presets have stable IDs, names, full encoding config, and `createdAt` metadata
- ✅ Presets load from disk on startup
- ✅ If file exists: load only, overwrite NOTHING
- ✅ If file does not exist: create empty store, bootstrap defaults

### 2. First-Launch Default Preset Bootstrap
On first launch (no preset file exists), these presets are created USING THE SAME CREATION FUNCTION as user presets:

| Preset Name | Codec | Resolution | Container |
|-------------|-------|------------|-----------|
| 2K ProRes Proxy – Editorial | ProRes Proxy | 2048×1080 | MOV |
| HD ProRes Proxy – Broadcast Offline | ProRes Proxy | 1920×1080 | MOV |
| Source Resolution – ProRes 422 HQ | ProRes 422 HQ | Source | MOV |
| Camera Native – No Resize (Archive) | ProRes 422 | Source | MOV |
| H.264 Review – Low Bitrate | H.264 | 1920×1080 | MP4 |

**Key Properties:**
- ✅ Indistinguishable from user presets after creation
- ✅ Editable and deletable
- ✅ Deleting is **permanent** — restart does NOT recreate them
- ✅ `isDefault` flag is INFORMATIONAL ONLY (does not protect from deletion)

### 3. UI ↔ Preset Authority Cleanup
- ✅ Removed hardcoded preset definitions from UI
- ✅ UI dropdown driven ONLY by preset store state
- ✅ If preset store is empty, dropdown is empty
- ✅ "No preset selected" is an explicit, visible state

### 4. Watch Folder Contract Readiness (NO AUTOMATION YET)
- ✅ Watch folders reference presets by `preset_id`
- ✅ Job creation FAILS LOUDLY if no `preset_id` is set
- ✅ UI shows clear warning when no preset configured
- ✅ "Create Jobs" button disabled without preset
- ✅ Never falls back to defaults — explicit configuration required

---

## What Was NOT Done (By Design)

- ❌ Auto-transcoding NOT enabled
- ❌ Watch folder semantics unchanged (detection + manual job creation)
- ❌ No silent defaults introduced
- ❌ Deleted presets not recreated
- ❌ No new UX flows invented
- ❌ QC and Electron-only rules preserved

---

## Files Changed

### Core Preset Service
- `frontend/electron/presetService.ts` — Complete rewrite of preset creation logic
  - New `createPresetInternal()` function used by both defaults and user presets
  - New `bootstrapDefaultPresets()` for first-launch initialization
  - `getDefaultPresetTemplates()` provides template data (not full presets)
  - `deletePreset()` now allows deleting ALL presets including defaults

### Types
- `frontend/src/types/presets.ts` — Updated documentation, clarified `isDefault` is informational only

### UI Hook
- `frontend/src/hooks/usePresets.ts` — Removed `isDefault` protection on deletion

### Watch Folders
- `frontend/src/components/WatchFoldersPanel.tsx`
  - Preset field marked as required (not optional)
  - Warning shown when no preset configured
  - "Create Jobs" button disabled without preset
- `frontend/src/App.tsx` — `handleCreateJobsFromWatchFolder` fails loudly without preset

### E2E Tests
- `qa/e2e/phase6_preset_truth.spec.ts` — New comprehensive test file
- `qa/e2e/playwright.config.ts` — Added phase6 test to test match list

---

## E2E Test Coverage

| Test ID | Description | Status |
|---------|-------------|--------|
| PHASE6-001 | Fresh install creates 5 default presets | ✅ Pass |
| PHASE6-002 | Presets stored in userData directory | ✅ Pass |
| PHASE6-003 | Default presets can be deleted | ✅ Pass |
| PHASE6-004 | User presets are indistinguishable from defaults | ✅ Pass |
| PHASE6-005 | Watch folder UI shows preset requirement | ✅ Pass |
| PHASE6-006 | Create Jobs disabled without preset | ✅ Pass |
| PHASE6-007 | Deletion persists to disk immediately | ✅ Pass |

---

## Future Work (Phase 7+)

1. **Auto-transcoding**: Watch folders can automatically create and execute jobs
2. **Preset application**: Jobs apply full preset settings (codec, resolution, etc.)
3. **Preset export/import**: Share presets between machines
4. **Workspace presets**: Project-level preset definitions

---

## End Conditions Met

✅ Presets are no longer "UI suggestions"  
✅ Watch folders can safely depend on preset IDs  
✅ Automation is now POSSIBLE in a future phase  
✅ Nothing auto-executes yet
