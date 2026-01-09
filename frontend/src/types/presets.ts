/**
 * Type definitions for Preset system (Durable storage in Electron userData)
 * 
 * PHASE 6: Preset System Truth
 * - Presets are stored in userData/presets.json
 * - Default presets are created on first launch using same creation function
 * - All presets (including defaults) can be deleted
 * - Deletion is permanent - restart does NOT recreate defaults
 */

import type { DeliverSettings as DeliverSettingsFromCP } from '../components/DeliverControlPanel'

// Re-export DeliverSettings for use in preset types
export type DeliverSettings = DeliverSettingsFromCP

/**
 * Preset — A saved configuration snapshot.
 * 
 * Presets are stored in the Electron userData directory as JSON,
 * surviving app restarts and rebuilds.
 * 
 * PHASE 6: All presets are editable and deletable, including defaults.
 */
export interface Preset {
  id: string
  name: string
  description?: string
  createdAt: string
  updatedAt: string
  settings: DeliverSettings
  isDefault?: boolean  // INFORMATIONAL ONLY - does NOT protect from deletion
}
