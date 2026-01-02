/**
 * Playback Capability — Centralized Playback Decision Logic
 * 
 * ============================================================================
 * DESIGN PHILOSOPHY
 * ============================================================================
 * This module is THE SINGLE SOURCE OF TRUTH for all playback decisions.
 * 
 * We do NOT guess based on:
 * - Codec names
 * - Container formats
 * - File extensions
 * - Allowlists/blocklists
 * 
 * We DO use the FFmpeg probe result from the backend:
 * - PLAYABLE → full playback + controls enabled
 * - METADATA_ONLY → poster/burst only, controls visible but disabled
 * - NO_VIDEO → no playback, explicit message
 * - ERROR → no playback, error message
 * 
 * All other components MUST use this module to determine:
 * 1. Can transport controls be enabled?
 * 2. Can video element be mounted?
 * 3. Which preview tier is allowed?
 * 
 * See: backend/playback_probe.py for probe implementation
 * ============================================================================
 */

// ============================================================================
// TYPES
// ============================================================================

/**
 * Playback capability states from backend probe.
 * Must match backend PlaybackCapability enum exactly.
 */
export type PlaybackCapability = 
  | 'PLAYABLE'        // FFmpeg can decode at least 1 video frame
  | 'METADATA_ONLY'   // Video stream exists but decode fails (RAW, etc.)
  | 'NO_VIDEO'        // No video stream in file
  | 'ERROR'           // Probe error (file not found, timeout, etc.)

/**
 * Probe result from backend API.
 */
export interface PlaybackProbeResult {
  capability: PlaybackCapability
  engine: string
  probe_ms: number
  message: string
}

/**
 * UI state derived from probe result.
 */
export interface PlaybackUIState {
  /** Can the video element be mounted and attempt playback? */
  canMountVideo: boolean
  /** Should transport controls be enabled (clickable)? */
  transportEnabled: boolean
  /** Should transport controls be visible at all? */
  transportVisible: boolean
  /** Can poster frame be shown? */
  canShowPoster: boolean
  /** Can burst thumbnails be shown? */
  canShowBurst: boolean
  /** Can video proxy be generated? */
  canGenerateProxy: boolean
  /** Message to display when playback is disabled */
  disabledMessage: string | null
  /** Is this a RAW format that requires Resolve? */
  isRawFormat: boolean
}

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * Backend API URL for playback probe.
 */
const DEFAULT_BACKEND_URL = 'http://127.0.0.1:8085'

/**
 * Messages for each capability state.
 * These are the canonical messages shown to users.
 */
export const CAPABILITY_MESSAGES: Record<PlaybackCapability, string> = {
  PLAYABLE: 'Playback available',
  METADATA_ONLY: 'Playback unavailable — requires Resolve. Generate preview proxy to enable playback.',
  NO_VIDEO: 'No video stream detected in file',
  ERROR: 'Unable to probe file for playback capability',
}

/**
 * Short messages for transport bar badge (space-constrained).
 */
export const CAPABILITY_MESSAGES_SHORT: Record<PlaybackCapability, string> = {
  PLAYABLE: 'Playback available',
  METADATA_ONLY: 'RAW — Generate proxy to play',
  NO_VIDEO: 'No video stream',
  ERROR: 'Probe failed',
}

// ============================================================================
// API FUNCTIONS
// ============================================================================

/**
 * Probe a file for playback capability.
 * 
 * This calls the backend probe endpoint which uses FFmpeg to attempt
 * decoding exactly 1 video frame.
 * 
 * @param path Absolute path to media file
 * @param backendUrl Optional backend URL (defaults to localhost:8085)
 * @returns Promise<PlaybackProbeResult>
 */
export async function probePlaybackCapability(
  path: string,
  backendUrl: string = DEFAULT_BACKEND_URL
): Promise<PlaybackProbeResult> {
  const url = `${backendUrl}/playback/probe`
  
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ path }),
    })
    
    if (!response.ok) {
      console.error(`[PLAYBACK PROBE] HTTP ${response.status} for ${path}`)
      return {
        capability: 'ERROR',
        engine: 'ffmpeg',
        probe_ms: 0,
        message: `Probe failed: HTTP ${response.status}`,
      }
    }
    
    const result: PlaybackProbeResult = await response.json()
    console.log(`[PLAYBACK PROBE] path=${path} capability=${result.capability} ms=${result.probe_ms}`)
    return result
    
  } catch (error) {
    console.error(`[PLAYBACK PROBE] Network error for ${path}:`, error)
    return {
      capability: 'ERROR',
      engine: 'ffmpeg',
      probe_ms: 0,
      message: `Probe failed: ${error instanceof Error ? error.message : 'Network error'}`,
    }
  }
}

// ============================================================================
// UI STATE DERIVATION
// ============================================================================

/**
 * Derive UI state from playback capability.
 * 
 * This is THE SINGLE FUNCTION that decides what the UI should do
 * based on probe results.
 * 
 * @param capability Playback capability from probe
 * @returns PlaybackUIState
 */
export function deriveUIState(capability: PlaybackCapability): PlaybackUIState {
  switch (capability) {
    case 'PLAYABLE':
      return {
        canMountVideo: true,
        transportEnabled: true,
        transportVisible: true,
        canShowPoster: true,
        canShowBurst: false,  // No need for burst on playable files
        canGenerateProxy: false,  // No need for proxy on playable files
        disabledMessage: null,
        isRawFormat: false,
      }
    
    case 'METADATA_ONLY':
      // RAW or other non-decodable format
      // User can see poster/burst but not play
      // User CAN request proxy generation
      return {
        canMountVideo: false,
        transportEnabled: false,
        transportVisible: true,  // Controls visible but disabled
        canShowPoster: true,
        canShowBurst: true,
        canGenerateProxy: true,
        disabledMessage: CAPABILITY_MESSAGES.METADATA_ONLY,
        isRawFormat: true,
      }
    
    case 'NO_VIDEO':
      return {
        canMountVideo: false,
        transportEnabled: false,
        transportVisible: true,  // Controls visible but disabled
        canShowPoster: false,
        canShowBurst: false,
        canGenerateProxy: false,
        disabledMessage: CAPABILITY_MESSAGES.NO_VIDEO,
        isRawFormat: false,
      }
    
    case 'ERROR':
    default:
      return {
        canMountVideo: false,
        transportEnabled: false,
        transportVisible: true,  // Controls visible but disabled
        canShowPoster: false,
        canShowBurst: false,
        canGenerateProxy: false,
        disabledMessage: CAPABILITY_MESSAGES.ERROR,
        isRawFormat: false,
      }
  }
}

/**
 * Derive UI state from probe result (convenience wrapper).
 * 
 * @param probeResult Full probe result from backend
 * @returns PlaybackUIState
 */
export function deriveUIStateFromProbe(probeResult: PlaybackProbeResult): PlaybackUIState {
  const state = deriveUIState(probeResult.capability)
  
  // Use probe message if more specific
  if (probeResult.message && probeResult.capability !== 'PLAYABLE') {
    state.disabledMessage = probeResult.message
  }
  
  return state
}

// ============================================================================
// CONVENIENCE FUNCTIONS
// ============================================================================

/**
 * Check if a capability allows full playback.
 * 
 * @param capability Playback capability
 * @returns True if PLAYABLE
 */
export function canPlayback(capability: PlaybackCapability): boolean {
  return capability === 'PLAYABLE'
}

/**
 * Check if a capability allows poster/burst but not playback.
 * 
 * @param capability Playback capability
 * @returns True if METADATA_ONLY
 */
export function isMetadataOnly(capability: PlaybackCapability): boolean {
  return capability === 'METADATA_ONLY'
}

/**
 * Check if transport controls should be enabled.
 * 
 * Controls are enabled ONLY when:
 * - Capability is PLAYABLE, AND
 * - Video has loaded successfully
 * 
 * @param capability Playback capability
 * @param videoLoaded Whether video element has loaded
 * @returns True if controls should be enabled
 */
export function areTransportControlsEnabled(
  capability: PlaybackCapability,
  videoLoaded: boolean
): boolean {
  return capability === 'PLAYABLE' && videoLoaded
}

/**
 * Check if transport controls should be visible.
 * 
 * Controls are visible when:
 * - Source is loaded (any capability except initial state)
 * 
 * @param hasSource Whether a source is loaded
 * @returns True if controls should be visible
 */
export function areTransportControlsVisible(hasSource: boolean): boolean {
  return hasSource
}

/**
 * Get the status message for disabled transport controls.
 * Uses short messages by default for space-constrained UI.
 * 
 * @param capability Playback capability
 * @param videoLoading Whether video is currently loading
 * @param videoError Error message if video failed to load
 * @param useShortMessage Use abbreviated message for compact UI
 * @returns Status message or null if playback is available
 */
export function getTransportStatusMessage(
  capability: PlaybackCapability,
  videoLoading: boolean,
  videoError: string | null,
  useShortMessage: boolean = true
): string | null {
  // Playback available - no message
  if (capability === 'PLAYABLE' && !videoLoading && !videoError) {
    return null
  }
  
  // Video is loading
  if (videoLoading) {
    return 'Loading video…'
  }
  
  // Video load error
  if (videoError) {
    return `Video error: ${videoError}`
  }
  
  // Use capability message (short or full)
  const messages = useShortMessage ? CAPABILITY_MESSAGES_SHORT : CAPABILITY_MESSAGES
  return messages[capability] || null
}

/**
 * Check if a generated proxy should be used for playback.
 * 
 * Proxy playback is allowed when:
 * - Original capability was METADATA_ONLY (RAW file), AND
 * - Proxy has been generated, AND
 * - Proxy itself passes playback probe
 * 
 * @param originalCapability Original file's capability
 * @param hasProxy Whether a proxy has been generated
 * @param proxyCapability Proxy file's capability (if probed)
 * @returns True if proxy playback should be enabled
 */
export function canUseProxyForPlayback(
  originalCapability: PlaybackCapability,
  hasProxy: boolean,
  proxyCapability?: PlaybackCapability
): boolean {
  // Only RAW files (METADATA_ONLY) can use proxies
  if (originalCapability !== 'METADATA_ONLY') {
    return false
  }
  
  // Proxy must exist
  if (!hasProxy) {
    return false
  }
  
  // If proxy was probed, it must be PLAYABLE
  if (proxyCapability !== undefined) {
    return proxyCapability === 'PLAYABLE'
  }
  
  // Assume proxy is playable if not probed (optimistic for generated proxies)
  return true
}
