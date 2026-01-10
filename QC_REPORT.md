# UI QC Report — v2/reliable-proxy Branch

**Date:** January 2026  
**Author:** GitHub Copilot  
**Branch:** `v2/reliable-proxy`

---

## Executive Summary

This report documents the UI/UX fixes implemented to address the QC findings from the UI review. All critical issues have been resolved, with emphasis on the PRIMARY BLOCKER (missing RUN button).

---

## Fixes Implemented

### A. PRIMARY BLOCKER: RUN/RENDER Button ✅

**Issue:** There was no visible primary action button to start rendering. Users had to deduce that queue execution was triggered implicitly.

**Fix Applied:**
- Added prominent **RUN** button as the first element in `QueueExecutionControls.tsx`
- Button shows dynamic text: `RUN (count)`, `RUNNING…`, or `RESUME`
- Eye-catching green gradient styling with glow effect
- Disabled state when queue is empty
- Pulsing animation when running

**Files Modified:**
- [QueueExecutionControls.tsx](frontend/src/components/QueueExecutionControls.tsx)
- [QueueExecutionControls.css](frontend/src/components/QueueExecutionControls.css)

**Test ID:** `data-testid="btn-run-queue"`

---

### B. Drop Zone Functionality ✅

**Issue:** "DROP FILES HERE" overlay didn't work. Drag-and-drop was disabled.

**Fix Applied:**
- Re-enabled `useGlobalFileDrop` hook in `App.tsx`
- Added `handleFileDrop` callback that adds paths to source selection store
- Added `handleOutputDrop` callback for output directory
- Added drop overlay component with visual feedback

**Files Modified:**
- [App.tsx](frontend/src/App.tsx)

**Test ID:** `data-testid="drop-overlay"`

---

### C. Watch Folder Error States ✅

**Issue:** Watch folders showed red error state before user had taken any action (no preset selected). This violated the "never start in error" principle.

**Fix Applied:**
- Changed `preset-warning` to `preset-guidance` with neutral blue styling
- Errors now only appear after user has attempted to arm the folder
- Improved path display with end-of-path summary (`.../ShootA/Day03/CameraB`)
- Added RTL text direction for path truncation from the left
- Increased panel height and made it scrollable

**Files Modified:**
- [WatchFoldersPanelV3.tsx](frontend/src/components/WatchFoldersPanelV3.tsx)

---

### D. Jog Wheel Sensitivity ✅

**Issue:** Jog wheel was too sensitive, moving whole seconds instead of single frames.

**Fix Applied:**
- Changed from time-based (0.05 seconds per pixel) to quantized frame stepping
- Now requires 10 pixels of movement per frame step
- Video pauses during jog for true frame-by-frame control
- Visual rotation feedback scaled to 0.5x

**Files Modified:**
- [TransportBar.tsx](frontend/src/components/TransportBar.tsx)

---

### E. RAW Preview Error Messages ✅

**Issue:** When RAW preview failed, the error message was vague (just "preview unavailable").

**Fix Applied:**
- Added explicit error messages explaining why preview failed
- Translates technical ffprobe errors to user-friendly messages:
  - R3D: "RED R3D files require RED SDK for decode"
  - BRAW: "Blackmagic RAW files require BRAW SDK for decode"
  - ARRIRAW: "ARRI RAW files require ARRI SDK for decode"
- Added green confirmation: "✓ Delivery job creation still available"
- Added hint: "Click 'Generate Preview Proxy' to create a viewable proxy"

**Files Modified:**
- [MonitorSurface.tsx](frontend/src/components/MonitorSurface.tsx)

---

### F. Status Indicator Tooltips ✅

**Issue:** Status indicators (green lights next to FORGE) had no tooltips explaining their meaning.

**Fix Applied:**
- Added tooltip to backend connection indicator:
  - Connected: "Backend Connected — FFmpeg transcoding service is available..."
  - Disconnected: "Backend Disconnected — Unable to reach transcoding service..."
- Changed indicator text from `●`/`○` to `FORGE`/`OFFLINE`
- Added tooltip to Alpha badge explaining the early access status
- Added `cursor: help` to indicate interactive tooltips

**Files Modified:**
- [App.tsx](frontend/src/App.tsx)

---

### G. Metadata Panel Enhancement ✅

**Issue:** Only "Clip Details" was shown in metadata panel. Video, Audio, Camera, Technical sections were empty.

**Fix Applied:**
- Enhanced `rawMetadataForPanel` to incorporate data from `tieredPreview.poster?.sourceInfo`
- Now merges metadata from multiple sources for better coverage
- Added duration and file size fields from preview info

**Files Modified:**
- [App.tsx](frontend/src/App.tsx)

---

### H. Visual Contrast Improvements ✅

**Issue:** Some text was too dim, making it hard to read.

**Fix Applied:**
- Enhanced text color contrast in design tokens:
  - `--text-primary`: #e2e8f0 → #f1f5f9 (brighter)
  - `--text-secondary`: #94a3b8 → #a1b0c4 (brighter)
  - `--text-muted`: #64748b → #7689a0 (brighter)
  - `--text-dim`: #475569 → #5a6a80 (brighter)
- Improved border contrast for better panel definition
- Added missing CSS variables: `--surface-primary`, `--surface-secondary`, `--bg-secondary`, `--interactive-primary`

**Files Modified:**
- [design-tokens.css](frontend/src/design-tokens.css)

---

## E2E Tests Added

A new test file was created to verify all UI fixes:

**File:** [ui_qc_fixes.spec.ts](frontend/tests/ui_qc_fixes.spec.ts)

**Test Coverage:**
- A. RUN button visibility and functionality
- B. Drop zone functionality
- C. Watch folder neutral state
- D. Status indicator tooltips
- E. Jog wheel control presence
- F. Overall app layout

**Screenshot Locations:**
- `artifacts/ui/visual/run_button_visible.png`
- `artifacts/ui/visual/watch_folders_neutral.png`
- `artifacts/ui/visual/status_indicator_tooltip.png`
- `artifacts/ui/visual/transport_bar.png`
- `artifacts/ui/visual/full_app_layout.png`
- `artifacts/ui/visual/metadata_panel_toggle.png`

---

## Files Modified Summary

| File | Changes |
|------|---------|
| `frontend/src/components/QueueExecutionControls.tsx` | Added prominent RUN button |
| `frontend/src/components/QueueExecutionControls.css` | Added RUN button styling |
| `frontend/src/components/WatchFoldersPanelV3.tsx` | Changed error states to guidance |
| `frontend/src/App.tsx` | Re-enabled drop zone, enhanced metadata, added tooltips |
| `frontend/src/components/TransportBar.tsx` | Fixed jog wheel sensitivity |
| `frontend/src/components/MonitorSurface.tsx` | Improved RAW preview error messages |
| `frontend/src/design-tokens.css` | Enhanced visual contrast |
| `frontend/tests/ui_qc_fixes.spec.ts` | Added E2E tests |

---

## Verification Steps

1. **Build and run the app:**
   ```bash
   cd frontend && npm run dev
   ```

2. **Run E2E tests:**
   ```bash
   npx playwright test frontend/tests/ui_qc_fixes.spec.ts
   ```

3. **Manual verification checklist:**
   - [ ] RUN button visible in queue controls
   - [ ] Drop files into app window works
   - [ ] Watch folders show guidance (blue), not errors (red)
   - [ ] Jog wheel moves one frame at a time
   - [ ] RAW preview failure shows specific message
   - [ ] Status indicators have tooltips on hover
   - [ ] Metadata panel shows available data
   - [ ] Text is readable (improved contrast)

---

## Remaining Items (Future Work)

- **Backend probe enhancement:** Return audio, camera metadata from ffprobe for complete metadata display
- **XMP support:** Currently read-only, embedding not supported
- **Resolve integration status:** Add indicator when DaVinci Resolve is connected

---

## Commit Information

```
Branch: v2/reliable-proxy
Commit message: fix(ui): QC fixes - RUN button, drop zone, watch folders, jog wheel, contrast

- Add prominent RUN button as PRIMARY action in queue controls
- Re-enable drag-and-drop file handling
- Change watch folder error states to neutral guidance
- Fix jog wheel sensitivity (10px per frame, quantized stepping)  
- Improve RAW preview error messages with specific explanations
- Add tooltips to status indicators
- Enhance metadata panel data sources
- Improve visual contrast in design tokens
- Add E2E tests for UI QC verification
```
