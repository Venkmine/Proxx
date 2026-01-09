/**
 * presetService.ts — Durable Preset Storage (Electron Main Process)
 * 
 * PHASE 6: PRESET SYSTEM TRUTH
 * 
 * Presets are stored in the user data directory as JSON, surviving:
 * - App restarts
 * - App rebuilds
 * - OS reboots
 * 
 * CRITICAL RULES:
 * 1. If presets.json EXISTS: load only, overwrite NOTHING
 * 2. If presets.json DOES NOT EXIST: create empty store, then bootstrap defaults
 * 3. Default presets use THE SAME createPreset() function as user presets
 * 4. Default presets are indistinguishable from user presets after creation
 * 5. Deleting a default preset is PERMANENT - restart does NOT recreate it
 * 6. Watch folders MUST reference preset_id - no fallbacks
 * 
 * INTENT: Presets must exist without manual setup. The app must be usable
 * out-of-the-box by Watch Folders and manual job creation.
 */

import { app } from 'electron'
import fs from 'node:fs'
import path from 'node:path'

// ============================================================================
// TYPES
// ============================================================================

export interface VideoSettings {
  codec: string
  resolution_policy: string
  resolution_preset?: string
  width?: number
  height?: number
  frame_rate_policy: string
  frame_rate?: string
  pixel_aspect_ratio?: string
  color_space?: string
  quality?: number
  bitrate?: string
  custom_bitrate?: string
  rate_control_mode?: 'crf' | 'bitrate'
  bitrate_preset?: 'low' | 'medium' | 'high' | 'broadcast' | 'custom'
  preset?: string
  framing_mode?: 'fit' | 'fill' | 'stretch'
}

export interface AudioSettings {
  codec: string
  bitrate?: string
  channels?: number
  layout: string
  sample_rate?: number
  passthrough: boolean
}

export interface FileSettings {
  container: string
  naming_template: string
  prefix?: string
  suffix?: string
  overwrite_policy: string
  preserve_source_dirs: boolean
  preserve_dir_levels: number
}

export interface MetadataSettings {
  strip_all_metadata: boolean
  passthrough_all_container_metadata: boolean
  passthrough_timecode: boolean
  passthrough_reel_name: boolean
  passthrough_camera_metadata: boolean
  passthrough_color_metadata: boolean
}

export interface OverlaySettings {
  layers: any[]
  text_layers: any[]
  image_watermark?: any
  timecode_overlay?: any
}

export interface DeliverSettings {
  video: VideoSettings
  audio: AudioSettings
  file: FileSettings
  metadata: MetadataSettings
  overlay: OverlaySettings
  output_dir?: string
}

export interface Preset {
  id: string
  name: string
  description?: string
  createdAt: string
  updatedAt: string
  settings: DeliverSettings
  isDefault?: boolean  // DEPRECATED: Kept for backwards compatibility only. Does NOT protect from deletion.
}

// ============================================================================
// STORAGE
// ============================================================================

const PRESETS_FILENAME = 'presets.json'

function getPresetsPath(): string {
  return path.join(app.getPath('userData'), PRESETS_FILENAME)
}

function generateId(): string {
  return `preset_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
}

// ============================================================================
// DEFAULT PRESET DEFINITIONS (Templates only - used by bootstrapDefaultPresets)
// ============================================================================

/**
 * PHASE 6: Default preset templates.
 * 
 * These are ONLY used during first-launch bootstrap.
 * After creation, they are indistinguishable from user-created presets.
 * Deleting them is PERMANENT - restart does NOT recreate them.
 * 
 * Named exactly as specified:
 * 1. "2K ProRes Proxy – Editorial"
 * 2. "HD ProRes Proxy – Broadcast Offline"
 * 3. "Source Resolution – ProRes 422 HQ"
 * 4. "Camera Native – No Resize (Archive)"
 * 5. "H.264 Review – Low Bitrate"
 */
interface PresetTemplate {
  name: string
  description: string
  settings: DeliverSettings
}

function getDefaultPresetTemplates(): PresetTemplate[] {
  return [
    {
      name: '2K ProRes Proxy – Editorial',
      description: 'Half-resolution editorial proxy. 2048×1080 ProRes Proxy for NLE timeline work.',
      settings: {
        video: {
          codec: 'prores_proxy',
          resolution_policy: 'preset',
          resolution_preset: '2k',
          width: 2048,
          height: 1080,
          frame_rate_policy: 'source',
          pixel_aspect_ratio: 'square',
          framing_mode: 'fit',
        },
        audio: {
          codec: 'aac',
          layout: 'source',
          sample_rate: 48000,
          passthrough: true,
        },
        file: {
          container: 'mov',
          naming_template: '{source_name}_proxy',
          overwrite_policy: 'increment',
          preserve_source_dirs: true,
          preserve_dir_levels: 2,
        },
        metadata: {
          strip_all_metadata: false,
          passthrough_all_container_metadata: true,
          passthrough_timecode: true,
          passthrough_reel_name: true,
          passthrough_camera_metadata: true,
          passthrough_color_metadata: true,
        },
        overlay: {
          layers: [],
          text_layers: [],
        },
      },
    },
    {
      name: 'HD ProRes Proxy – Broadcast Offline',
      description: '1920×1080 ProRes Proxy for broadcast offline editing workflows.',
      settings: {
        video: {
          codec: 'prores_proxy',
          resolution_policy: 'preset',
          resolution_preset: '1080p',
          width: 1920,
          height: 1080,
          frame_rate_policy: 'source',
          pixel_aspect_ratio: 'square',
          framing_mode: 'fit',
        },
        audio: {
          codec: 'aac',
          layout: 'source',
          sample_rate: 48000,
          passthrough: true,
        },
        file: {
          container: 'mov',
          naming_template: '{source_name}_offline',
          overwrite_policy: 'increment',
          preserve_source_dirs: true,
          preserve_dir_levels: 2,
        },
        metadata: {
          strip_all_metadata: false,
          passthrough_all_container_metadata: true,
          passthrough_timecode: true,
          passthrough_reel_name: true,
          passthrough_camera_metadata: true,
          passthrough_color_metadata: true,
        },
        overlay: {
          layers: [],
          text_layers: [],
        },
      },
    },
    {
      name: 'Source Resolution – ProRes 422 HQ',
      description: 'Master-quality transcode at source resolution. ProRes 422 HQ for archive and delivery.',
      settings: {
        video: {
          codec: 'prores_422_hq',
          resolution_policy: 'source',
          frame_rate_policy: 'source',
          pixel_aspect_ratio: 'square',
        },
        audio: {
          codec: 'pcm_s24le',
          layout: 'source',
          sample_rate: 48000,
          passthrough: false,
        },
        file: {
          container: 'mov',
          naming_template: '{source_name}_master',
          overwrite_policy: 'increment',
          preserve_source_dirs: true,
          preserve_dir_levels: 2,
        },
        metadata: {
          strip_all_metadata: false,
          passthrough_all_container_metadata: true,
          passthrough_timecode: true,
          passthrough_reel_name: true,
          passthrough_camera_metadata: true,
          passthrough_color_metadata: true,
        },
        overlay: {
          layers: [],
          text_layers: [],
        },
      },
    },
    {
      name: 'Camera Native – No Resize (Archive)',
      description: 'Source-native transcode for archival. No resize, preserves all camera metadata.',
      settings: {
        video: {
          codec: 'prores_422',
          resolution_policy: 'source',
          frame_rate_policy: 'source',
          pixel_aspect_ratio: 'source',
        },
        audio: {
          codec: 'pcm_s24le',
          layout: 'source',
          sample_rate: 48000,
          passthrough: false,
        },
        file: {
          container: 'mov',
          naming_template: '{source_name}_archive',
          overwrite_policy: 'skip',
          preserve_source_dirs: true,
          preserve_dir_levels: 3,
        },
        metadata: {
          strip_all_metadata: false,
          passthrough_all_container_metadata: true,
          passthrough_timecode: true,
          passthrough_reel_name: true,
          passthrough_camera_metadata: true,
          passthrough_color_metadata: true,
        },
        overlay: {
          layers: [],
          text_layers: [],
        },
      },
    },
    {
      name: 'H.264 Review – Low Bitrate',
      description: 'Lightweight H.264 for quick review, client sharing, or streaming preview.',
      settings: {
        video: {
          codec: 'h264',
          resolution_policy: 'preset',
          resolution_preset: '1080p',
          width: 1920,
          height: 1080,
          frame_rate_policy: 'source',
          pixel_aspect_ratio: 'square',
          rate_control_mode: 'bitrate',
          bitrate_preset: 'low',
          bitrate: '5M',
          framing_mode: 'fit',
        },
        audio: {
          codec: 'aac',
          bitrate: '192k',
          layout: 'stereo',
          sample_rate: 48000,
          passthrough: false,
        },
        file: {
          container: 'mp4',
          naming_template: '{source_name}_review',
          overwrite_policy: 'increment',
          preserve_source_dirs: false,
          preserve_dir_levels: 0,
        },
        metadata: {
          strip_all_metadata: true,
          passthrough_all_container_metadata: false,
          passthrough_timecode: false,
          passthrough_reel_name: false,
          passthrough_camera_metadata: false,
          passthrough_color_metadata: false,
        },
        overlay: {
          layers: [],
          text_layers: [],
        },
      },
    },
  ]
}

// ============================================================================
// PRESET OPERATIONS
// ============================================================================

/**
 * PHASE 6: Internal preset creation function.
 * 
 * This is the SINGLE function used to create ALL presets:
 * - User-created presets
 * - First-launch default presets
 * 
 * The isDefault flag is purely informational after creation.
 * It does NOT protect from deletion.
 */
function createPresetInternal(
  presets: Preset[],
  name: string,
  settings: DeliverSettings,
  description?: string,
  isDefault: boolean = false
): Preset {
  // Validate unique name
  if (presets.some(p => p.name === name)) {
    throw new Error(`Preset with name "${name}" already exists`)
  }
  
  const now = new Date().toISOString()
  const preset: Preset = {
    id: generateId(),
    name,
    description,
    createdAt: now,
    updatedAt: now,
    settings,
    isDefault, // Informational only - does NOT protect from deletion
  }
  
  presets.push(preset)
  return preset
}

/**
 * PHASE 6: Bootstrap default presets on first launch.
 * 
 * CRITICAL: Uses the SAME creation function as user presets.
 * After creation, defaults are indistinguishable from user presets.
 * Deleting them is PERMANENT - restart does NOT recreate them.
 */
function bootstrapDefaultPresets(): Preset[] {
  const presets: Preset[] = []
  const templates = getDefaultPresetTemplates()
  
  console.log('[PresetService] PHASE 6: Bootstrapping default presets...')
  
  for (const template of templates) {
    try {
      createPresetInternal(
        presets,
        template.name,
        template.settings,
        template.description,
        true // Mark as default (informational only)
      )
      console.log(`[PresetService] Created default preset: ${template.name}`)
    } catch (err) {
      console.error(`[PresetService] Failed to create default preset "${template.name}":`, err)
    }
  }
  
  console.log(`[PresetService] PHASE 6: Bootstrapped ${presets.length} default presets`)
  return presets
}

/**
 * PHASE 6: Load all presets from disk.
 * 
 * CRITICAL RULES:
 * 1. If file EXISTS: load only, overwrite NOTHING
 * 2. If file DOES NOT EXIST: create empty store, bootstrap defaults
 * 3. On parse error: start fresh with defaults (recovery)
 */
export function loadPresets(): Preset[] {
  const presetsPath = getPresetsPath()
  
  try {
    if (fs.existsSync(presetsPath)) {
      // File exists - load it and DO NOT recreate defaults
      const data = fs.readFileSync(presetsPath, 'utf8')
      const presets = JSON.parse(data)
      console.log(`[PresetService] Loaded ${presets.length} presets from ${presetsPath}`)
      return presets
    } else {
      // First launch - bootstrap defaults using the same creation function
      console.log('[PresetService] PHASE 6: No presets file found, bootstrapping defaults')
      const defaults = bootstrapDefaultPresets()
      savePresets(defaults)
      return defaults
    }
  } catch (err) {
    console.error('[PresetService] Error loading presets (will bootstrap fresh):', err)
    // Recovery: bootstrap fresh
    const defaults = bootstrapDefaultPresets()
    savePresets(defaults)
    return defaults
  }
}

/**
 * Save all presets to disk.
 */
export function savePresets(presets: Preset[]): void {
  const presetsPath = getPresetsPath()
  
  try {
    const data = JSON.stringify(presets, null, 2)
    fs.writeFileSync(presetsPath, data, 'utf8')
    console.log(`[PresetService] Saved ${presets.length} presets to ${presetsPath}`)
  } catch (err) {
    console.error('[PresetService] Error saving presets:', err)
    throw err
  }
}

/**
 * Get a single preset by ID.
 */
export function getPreset(id: string): Preset | null {
  const presets = loadPresets()
  return presets.find(p => p.id === id) || null
}

/**
 * PHASE 6: Create a new preset (public API).
 * 
 * Uses the same internal function as bootstrap.
 * User presets have isDefault: false.
 */
export function createPreset(name: string, settings: DeliverSettings, description?: string): Preset {
  const presets = loadPresets()
  const preset = createPresetInternal(presets, name, settings, description, false)
  savePresets(presets)
  console.log(`[PresetService] Created user preset: ${name}`)
  return preset
}

/**
 * Update an existing preset.
 */
export function updatePreset(id: string, updates: Partial<Pick<Preset, 'name' | 'description' | 'settings'>>): Preset {
  const presets = loadPresets()
  const index = presets.findIndex(p => p.id === id)
  
  if (index === -1) {
    throw new Error(`Preset with ID "${id}" not found`)
  }
  
  // Validate unique name if name is being changed
  if (updates.name && updates.name !== presets[index].name) {
    if (presets.some(p => p.name === updates.name)) {
      throw new Error(`Preset with name "${updates.name}" already exists`)
    }
  }
  
  const updatedPreset = {
    ...presets[index],
    ...updates,
    updatedAt: new Date().toISOString(),
  }
  
  presets[index] = updatedPreset
  savePresets(presets)
  
  console.log(`[PresetService] Updated preset: ${updatedPreset.name}`)
  return updatedPreset
}

/**
 * PHASE 6: Delete a preset by ID.
 * 
 * CRITICAL: ALL presets can be deleted, including defaults.
 * Deletion is PERMANENT. Restarting does NOT recreate deleted defaults.
 * The isDefault flag does NOT protect from deletion.
 */
export function deletePreset(id: string): boolean {
  const presets = loadPresets()
  const index = presets.findIndex(p => p.id === id)
  
  if (index === -1) {
    throw new Error(`Preset with ID "${id}" not found`)
  }
  
  const preset = presets[index]
  
  // PHASE 6: isDefault does NOT protect from deletion
  // User can delete any preset, including defaults
  
  presets.splice(index, 1)
  savePresets(presets)
  
  console.log(`[PresetService] Deleted preset: ${preset.name} (wasDefault: ${preset.isDefault ?? false})`)
  return true
}

/**
 * Duplicate a preset with a new name.
 */
export function duplicatePreset(id: string, newName: string): Preset {
  const presets = loadPresets()
  const original = presets.find(p => p.id === id)
  
  if (!original) {
    throw new Error(`Preset with ID "${id}" not found`)
  }
  
  // Validate unique name
  if (presets.some(p => p.name === newName)) {
    throw new Error(`Preset with name "${newName}" already exists`)
  }
  
  const now = new Date().toISOString()
  const duplicate: Preset = {
    id: generateId(),
    name: newName,
    description: original.description ? `Copy of ${original.description}` : `Copy of ${original.name}`,
    createdAt: now,
    updatedAt: now,
    settings: JSON.parse(JSON.stringify(original.settings)),
    isDefault: false,
  }
  
  presets.push(duplicate)
  savePresets(presets)
  
  console.log(`[PresetService] Duplicated preset: ${original.name} → ${newName}`)
  return duplicate
}

/**
 * PHASE 6: Reset all presets to defaults.
 * 
 * This REPLACES all presets with fresh defaults.
 * Uses the same bootstrap function as first-launch.
 */
export function resetToDefaults(): Preset[] {
  console.log('[PresetService] PHASE 6: Resetting to default presets...')
  const defaults = bootstrapDefaultPresets()
  savePresets(defaults)
  console.log('[PresetService] Reset to default presets complete')
  return defaults
}

/**
 * Get the path where presets are stored (for debugging/documentation).
 */
export function getPresetStoragePath(): string {
  return getPresetsPath()
}
