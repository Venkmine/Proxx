# Forge UI State Model

> **RATIONALE**: Forge is a deterministic proxy engine, not a media browser.  
> The UI must reflect certainty, not speculation.

## Overview

This document describes the refactored Forge UI state model introduced to eliminate
invalid reactive states and align with the OS-native source selection approach.

## State Model

### SourceSelectionState Enum

All source-related UI behavior derives from a single, authoritative state enum:

```typescript
enum SourceSelectionState {
  EMPTY                  // No sources selected
  SELECTED_UNVALIDATED   // Paths selected, not yet validated by preflight
  PREFLIGHT_RUNNING      // Backend is validating sources
  PREFLIGHT_FAILED       // Preflight failed (persistent error)
  READY                  // Sources validated, job creation allowed
}
```

### State Transitions

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│   ┌───────┐   addPaths()   ┌─────────────────────┐              │
│   │ EMPTY │───────────────▶│ SELECTED_UNVALIDATED│              │
│   └───────┘                └─────────────────────┘              │
│       ▲                              │                          │
│       │                              │ runPreflight()           │
│       │ clearAll()                   ▼                          │
│       │                    ┌──────────────────┐                 │
│       ├────────────────────│ PREFLIGHT_RUNNING│                 │
│       │                    └──────────────────┘                 │
│       │                         │         │                     │
│       │              success    │         │    failure          │
│       │                         ▼         ▼                     │
│       │                    ┌───────┐ ┌────────────────┐         │
│       └────────────────────│ READY │ │ PREFLIGHT_FAILED│        │
│                            └───────┘ └────────────────┘         │
│                                             │                   │
│                                             │ retry()           │
│                                             ▼                   │
│                              ┌──────────────────┐               │
│                              │ PREFLIGHT_RUNNING│               │
│                              └──────────────────┘               │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## What Was Removed

### Phase 2 — Invalid Features Removed

1. **Thumbnail Previews** — Removed
   - Required file enumeration before preflight
   - Created speculative UI states
   - Implied capabilities the engine doesn't have

2. **Automatic Metadata Fetch on Selection** — Removed
   - Metadata is only available after preflight
   - UI shows explicit placeholder: "Metadata available after preflight"

3. **File Expansion/Preview** — Removed
   - No expanding directories in UI
   - Paths are opaque strings until preflight validates them

### Ad-hoc Boolean Flags Eliminated

The following legacy flags have been replaced by derivation from `SourceSelectionState`:

| Old Flag | Replaced By |
|----------|-------------|
| `hasSources` | `state !== EMPTY` |
| `isLoading` | `isPreflightRunning(state)` |
| `hasMetadata` | `shouldShowMetadata(state)` |
| `canSubmit` | `canCreateJob(state)` |

## UI Contract

### Source Selection ONLY:
- Displays selected paths (opaque strings)
- Allows removal
- NO expansion, NO preview

### Preflight is the ONLY Transition to READY
- No job creation without successful preflight
- No speculative file counts before preflight

### Errors are Persistent
- Errors displayed inline via `PreflightErrorBanner`
- NO toasts (they auto-dismiss and lose context)
- Error persists until user takes corrective action

## Key Components

| Component | Responsibility |
|-----------|----------------|
| `sourceSelectionStore.ts` | Zustand store with state enum and actions |
| `SourceSelectionPanel.tsx` | Unified source selection UI (flat, state-driven) |
| `SourceList.tsx` | Path display with remove capability |
| `PreflightErrorBanner.tsx` | Persistent inline error display |
| `SourceMetadataPanel.tsx` | Metadata display (preflight-gated) |
| `usePreflight.ts` | Hook for preflight API calls |

## Derived State Helpers

Use these instead of ad-hoc checks:

```typescript
import { 
  canModifySources,
  canRunPreflight,
  canCreateJob,
  isPreflightRunning,
  hasPreflightError,
  shouldShowMetadata,
} from '../stores/sourceSelectionStore'

// Example usage
const canModify = canModifySources(state)  // Can user add/remove sources?
const canCreate = canCreateJob(state)       // Can job be created?
const showMeta = shouldShowMetadata(state)  // Should metadata be displayed?
```

## Design Principles

1. **Deterministic**: UI state is predictable from the enum value
2. **Boring**: No animations, no speculative feedback
3. **Correct**: State transitions are explicit and validated
4. **Flat**: Reduced component nesting and complexity
5. **Empty over Disabled**: Prefer empty states over disabled controls
