# Preset Persistence System

**Status:** IMPLEMENTED
**Purpose:** Durable preset storage that survives app restarts and rebuilds

---

## Overview

Presets are configurations that define how proxy files are encoded (codec, resolution, audio settings, etc.). The preset system provides:

1. **Durable Storage** — Presets stored in Electron userData directory, not localStorage
2. **Default Templates** — 5 editor-sane presets created on first launch
3. **IPC Architecture** — Main process handles persistence, renderer uses IPC
4. **Backward Compatibility** — Falls back to localStorage when Electron not available

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                          Renderer Process                           │
├─────────────────────────────────────────────────────────────────────┤
│  usePresets() Hook                                                  │
│    ├─ Tries window.electron.preset.getAll() first                  │
│    ├─ Falls back to localStorage if Electron unavailable           │
│    └─ Syncs CRUD operations to main process                        │
└─────────────────────────────────────────────────────────────────────┘
                                    ↓ IPC
┌─────────────────────────────────────────────────────────────────────┐
│                           Main Process                              │
├─────────────────────────────────────────────────────────────────────┤
│  presetService.ts                                                   │
│    ├─ loadPresets() — Loads from userData/presets.json             │
│    ├─ savePresets() — Writes to userData/presets.json              │
│    ├─ createPreset(), updatePreset(), deletePreset()               │
│    └─ getDefaultPresets() — Creates 5 templates on first launch    │
└─────────────────────────────────────────────────────────────────────┘
                                    ↓
                    ~/Library/Application Support/Awaire Proxy/presets.json
```

---

## Default Presets

On first launch (when presets.json doesn't exist), five editor-sane presets are created:

| Preset Name | Codec | Resolution | Container | Use Case |
|-------------|-------|------------|-----------|----------|
| **2K ProRes Proxy – Editorial** | ProRes Proxy | 2048×1080 | MOV | Half-res editorial proxy |
| **HD ProRes Proxy – Broadcast Offline** | ProRes Proxy | 1920×1080 | MOV | Broadcast offline editing |
| **Source Resolution – ProRes 422 HQ** | ProRes 422 HQ | Source | MOV | Master-quality transcode |
| **Camera Native – No Resize (Archive)** | ProRes 422 | Source | MOV | Archival, preserve metadata |
| **H.264 Review – Low Bitrate** | H.264 | 1920×1080 | MP4 | Quick review, client sharing |

These presets have `isDefault: true` and cannot be deleted (only duplicated and modified).

---

## IPC API

### Exposed via window.electron.preset

```typescript
interface PresetAPI {
  getAll(): Promise<Preset[]>
  get(id: string): Promise<Preset | null>
  create(name: string, settings: DeliverSettings, description?: string): Promise<Preset>
  update(id: string, updates: Partial<Preset>): Promise<Preset>
  delete(id: string): Promise<boolean>
  duplicate(id: string, newName: string): Promise<Preset>
  resetDefaults(): Promise<Preset[]>
  getStoragePath(): Promise<string>
}
```

### IPC Channels (main.ts)

| Channel | Handler | Description |
|---------|---------|-------------|
| `preset:get-all` | `loadPresets()` | Returns all presets |
| `preset:get` | `getPreset(id)` | Returns single preset |
| `preset:create` | `createPreset(name, settings, desc)` | Creates new preset |
| `preset:update` | `updatePreset(id, updates)` | Updates existing preset |
| `preset:delete` | `deletePreset(id)` | Deletes preset (not defaults) |
| `preset:duplicate` | `duplicatePreset(id, newName)` | Copies preset |
| `preset:reset-defaults` | `resetToDefaults()` | Resets to 5 defaults |
| `preset:get-storage-path` | `getPresetStoragePath()` | Returns JSON file path |

---

## Storage Location

Presets are stored at:

```
macOS:   ~/Library/Application Support/Awaire Proxy/presets.json
Windows: %APPDATA%/Awaire Proxy/presets.json
Linux:   ~/.config/Awaire Proxy/presets.json
```

This location:
- ✅ Survives app restarts
- ✅ Survives app rebuilds  
- ✅ Survives Electron upgrades
- ❌ Does NOT sync across devices (future feature)

---

## Preset Structure

```typescript
interface Preset {
  id: string              // Unique identifier
  name: string            // Display name
  description?: string    // Optional description
  createdAt: string       // ISO timestamp
  updatedAt: string       // ISO timestamp
  isDefault?: boolean     // True for built-in presets
  settings: DeliverSettings
}

interface DeliverSettings {
  video: VideoSettings
  audio: AudioSettings
  file: FileSettings
  metadata: MetadataSettings
  overlay: OverlaySettings
}
```

---

## E2E Tests

The preset system is tested by `qa/e2e/preset_persistence.spec.ts`:

| Test ID | Description |
|---------|-------------|
| PRESET-001 | Default presets exist on first launch |
| PRESET-002 | Presets loaded via Electron IPC |
| PRESET-003 | Storage path is in userData directory |
| PRESET-004 | Default presets have isDefault flag |
| PRESET-005 | Default preset settings are valid |
| PRESET-006 | Can create a new preset via IPC |

Run tests:
```bash
cd qa/e2e && pnpm test preset_persistence.spec.ts
```

---

## Migration from localStorage

The `usePresets` hook automatically migrates from localStorage to Electron:

1. On mount, checks if `window.electron.preset` API is available
2. If available, loads presets from Electron IPC
3. If unavailable (browser dev mode), falls back to localStorage
4. CRUD operations sync to Electron in background when available

This ensures:
- Development in browser still works
- Electron production uses durable storage
- No manual migration required

---

## Related Files

| File | Purpose |
|------|---------|
| `frontend/electron/presetService.ts` | Main process preset CRUD + defaults |
| `frontend/electron/main.ts` | IPC handler registration |
| `frontend/electron/preload.ts` | Exposes preset API to renderer |
| `frontend/src/hooks/usePresets.ts` | React hook for preset management |
| `frontend/src/types/presets.ts` | TypeScript types |
| `frontend/src/types/electron.d.ts` | Window.electron type definitions |
| `qa/e2e/preset_persistence.spec.ts` | E2E tests |

---

## Why This Matters

From the user's perspective:

1. **No setup required** — App is usable out-of-the-box with sensible defaults
2. **Presets survive reinstalls** — User's work is preserved in userData
3. **Watch Folders can use presets** — Automation requires known preset IDs
4. **Provable via E2E tests** — System correctness is machine-verifiable

This is not a feature — it's truth enforcement. The app must work without manual setup.
