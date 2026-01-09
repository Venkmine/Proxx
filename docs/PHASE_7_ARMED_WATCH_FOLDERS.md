# Phase 7: Armed Watch Folders

**Status**: ✅ Implemented  
**Date**: 2026-01-03

## Overview

Phase 7 introduces an explicit "ARMED" mode for watch folders that enables automatic job creation when files are detected. This builds on Phase 6.5's counts-first model while maintaining full QC traceability.

## Key Concepts

### Armed Mode
When a watch folder is **armed**:
- Newly detected files automatically trigger job creation
- Jobs are created using the watch folder's configured preset
- No manual "Create Jobs" click required
- Full QC_ACTION_TRACE coverage for all automated actions

### Pre-arm Validation
A watch folder **cannot be armed** unless:
1. **Preset configured** - Must have a preset_id assigned
2. **Not paused** - Watcher must be enabled (status = 'watching')
3. **No errors** - Watcher must not have an error state
4. **Not already armed** - Cannot arm if already armed

### Status States
Watch folders now have three possible statuses:
- `watching` (green) - Active, manual job creation
- `armed` (orange) - Active, automatic job creation
- `paused` (gray) - Inactive

## QC_ACTION_TRACE Events

### New Events (Phase 7)
| Event | Description |
|-------|-------------|
| `WATCH_FOLDER_ARMED` | Watch folder successfully armed |
| `WATCH_FOLDER_DISARMED` | Watch folder disarmed (manual or auto) |
| `WATCH_FOLDER_ARM_BLOCKED` | Arm attempt failed validation |
| `WATCH_FOLDER_AUTO_JOB_CREATED` | Job auto-created while armed |
| `WATCH_FOLDER_AUTO_JOB_BLOCKED` | Auto job creation failed |

### Event Payloads
```typescript
// WATCH_FOLDER_ARMED
{
  path: string
  presetId: string
}

// WATCH_FOLDER_DISARMED
{
  path: string
  reason: 'manual' | 'paused'
}

// WATCH_FOLDER_ARM_BLOCKED
{
  blockReasons: ArmBlockReason[]
}

// WATCH_FOLDER_AUTO_JOB_CREATED
{
  path: string
  autoJobId: string
  presetId: string
  counts: WatchFolderCounts
}
```

## API Changes

### Types (watchFolders.ts)
```typescript
// Status now includes 'armed'
export type WatchFolderStatus = 'watching' | 'paused' | 'armed'

// New armed field on WatchFolder
export interface WatchFolder {
  // ... existing fields
  armed: boolean  // PHASE 7
}

// Block reasons for pre-arm validation
export type ArmBlockReason =
  | 'NO_PRESET'
  | 'PAUSED'
  | 'ALREADY_ARMED'
  | 'WATCHER_ERROR'

// Validation result
export interface ArmValidationResult {
  canArm: boolean
  blockReasons: ArmBlockReason[]
}
```

### Service Functions (watchFolderService.ts)
```typescript
// Validate if watch folder can be armed
export function validateArmWatchFolder(id: string): ArmValidationResult

// Arm a watch folder (returns success/failure with reasons)
export function armWatchFolder(
  id: string,
  mainWindow: BrowserWindow | null
): { success: boolean; blockReasons?: ArmBlockReason[] }

// Disarm a watch folder
export function disarmWatchFolder(
  id: string,
  mainWindow: BrowserWindow | null
): boolean

// Register callback for auto job creation
export function registerAutoJobCreationCallback(
  callback: (watchFolderId: string, filePath: string, presetId: string) => Promise<string | null>
): void
```

### IPC Channels
| Channel | Description |
|---------|-------------|
| `watch-folder:arm` | Arm a watch folder |
| `watch-folder:disarm` | Disarm a watch folder |
| `watch-folder:validate-arm` | Check if arming is possible |

## UI Changes

### Arm/Disarm Button
- Located in watch folder header (before Pause/Resume)
- Shows "Arm" when disarmed, "⚡ Armed" when armed
- Disabled when arming is blocked
- Tooltip shows reason why arming is blocked

### Status Indicator
- Orange color and glow when armed
- Label shows "ARMED" in uppercase
- Clear visual distinction from watching/paused

### Block Reasons Display
- Temporary notification shown when arming fails
- Lists all blocking reasons
- Auto-clears after 5 seconds

## Behavior Rules

### Pausing Disarms
When a watch folder is **paused**, it is automatically **disarmed**:
- Emits both `WATCH_FOLDER_DISABLED` and `WATCH_FOLDER_DISARMED`
- Arm button becomes disabled while paused
- Reason recorded as 'paused' in trace

### Resuming Restores Armed State
When a **previously armed** watch folder is **resumed**:
- If preset still exists and no errors: status returns to 'armed'
- Otherwise: status becomes 'watching', armed cleared

### Preset Removal Disarms
If a preset is removed from an armed watch folder:
- Status changes to 'watching'
- Armed state cleared
- Arm button becomes disabled

## E2E Tests

Located at: `qa/e2e/phase_7_armed_watch_folders.spec.ts`

### Test Cases
1. **Cannot arm without preset** - Arm button disabled
2. **Can arm with preset** - Successful arming flow
3. **Disarm returns to watching** - Full arm/disarm cycle
4. **Pausing disarms** - Auto-disarm on pause
5. **Status indicator colors** - Visual state verification

## File Changes Summary

### Modified
- `frontend/src/types/watchFolders.ts` - Added armed types
- `frontend/src/types/electron.d.ts` - Added IPC type definitions
- `frontend/electron/watchFolderService.ts` - Core arm/disarm logic
- `frontend/electron/main.ts` - IPC handlers
- `frontend/electron/preload.ts` - IPC bridge
- `frontend/src/components/WatchFoldersPanelV3.tsx` - UI updates
- `frontend/src/App.tsx` - Handler wiring

### Added
- `qa/e2e/phase_7_armed_watch_folders.spec.ts` - E2E tests
- `docs/PHASE_7_ARMED_WATCH_FOLDERS.md` - This document

## INTENT.md Compliance

Phase 7 maintains compliance with INTENT.md:

1. **Execution remains observable** - All auto-actions emit QC traces
2. **No silent automation** - Armed mode is explicit, visible, requires action
3. **Preset enforcement** - Cannot arm without configured preset
4. **Deterministic behavior** - Same conditions → same outcome
5. **Full traceability** - Every state change is logged

## Future Work

### Phase 8 Candidates
- Auto-arm on folder add (with preset pre-selected)
- Arm scheduling (arm during specific hours)
- Arm with queue limits (stop after N jobs)
- Arm status persistence across app restart

