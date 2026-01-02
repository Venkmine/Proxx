/**
 * Preview Router — Deterministic Preview Decision Logic
 * 
 * DESIGN PRINCIPLES:
 * - Preview routing is deterministic based on source type
 * - No implicit codec guessing
 * - All preview decisions centralized in this file
 * 
 * PREVIEW ROUTING TABLE:
 * - mp4/mov/mxf → native HTML5 video
 * - ProRes → native HTML5 video
 * - DNx → native HTML5 video
 * - RAW folders → NO playback, show "Proxy Required"
 * - Image sequences → poster only
 * - Unknown → poster only
 */

export type SourceType = 
  | 'native-video'      // mp4, mov, mxf, ProRes, DNx (native HTML5)
  | 'raw-folder'        // R3D, ARRIRAW, Sony RAW folders
  | 'image-sequence'    // Numbered frames (DPX, EXR, etc.)
  | 'unknown'           // Fallback

export interface PreviewCapability {
  /** Can this source play natively in HTML5 video? */
  canPlayNative: boolean
  /** Can this source show a poster frame? */
  canShowPoster: boolean
  /** Can this source generate burst previews? */
  canShowBurst: boolean
  /** Can this source generate video previews? */
  canGenerateVideoProxy: boolean
  /** Message to display when playback is not available */
  playbackDisabledMessage?: string
}

/**
 * Detect source type from metadata.
 * 
 * Uses deterministic rules based on:
 * - raw_type field (for folder sources)
 * - file extension
 * - codec name
 */
export function detectSourceType(metadata: {
  rawType?: string | null
  filePath?: string | null
  codec?: string | null
}): SourceType {
  // Priority 1: RAW folder type
  if (metadata.rawType) {
    return 'raw-folder'
  }
  
  // Priority 2: File extension
  if (metadata.filePath) {
    const ext = metadata.filePath.toLowerCase().split('.').pop() || ''
    
    // Image sequence extensions
    if (['dpx', 'exr', 'tiff', 'tif'].includes(ext)) {
      return 'image-sequence'
    }
    
    // Native video formats
    if (['mp4', 'mov', 'mxf', 'avi', 'mkv'].includes(ext)) {
      return 'native-video'
    }
  }
  
  // Priority 3: Codec name
  if (metadata.codec) {
    const codec = metadata.codec.toLowerCase()
    
    // RAW codecs
    if (codec.includes('arriraw') || 
        codec.includes('redcode') || 
        codec.includes('braw') || 
        codec.includes('r3d') || 
        codec.includes('prores_raw') || 
        codec.includes('prores raw')) {
      return 'raw-folder'
    }
    
    // Native playback codecs
    if (codec.includes('prores') || 
        codec.includes('dnxhd') || 
        codec.includes('dnxhr') || 
        codec.includes('h264') || 
        codec.includes('h265') ||
        codec.includes('hevc')) {
      return 'native-video'
    }
  }
  
  return 'unknown'
}

/**
 * Get preview capabilities for a source type.
 * 
 * This is the SINGLE SOURCE OF TRUTH for preview routing.
 */
export function getPreviewCapabilities(sourceType: SourceType): PreviewCapability {
  switch (sourceType) {
    case 'native-video':
      return {
        canPlayNative: true,
        canShowPoster: true,
        canShowBurst: false,
        canGenerateVideoProxy: false, // No proxy needed
        playbackDisabledMessage: undefined,
      }
    
    case 'raw-folder':
      return {
        canPlayNative: false,
        canShowPoster: true,
        canShowBurst: true,
        canGenerateVideoProxy: true,
        playbackDisabledMessage: 'Generate preview to enable playback',
      }
    
    case 'image-sequence':
      return {
        canPlayNative: false,
        canShowPoster: true,
        canShowBurst: true,
        canGenerateVideoProxy: false,
        playbackDisabledMessage: 'Image sequences cannot be played',
      }
    
    case 'unknown':
    default:
      return {
        canPlayNative: false,
        canShowPoster: true,
        canShowBurst: false,
        canGenerateVideoProxy: false,
        playbackDisabledMessage: 'Preview not available for this source',
      }
  }
}

/**
 * Determine if playback is currently available.
 * 
 * Playback is available when:
 * - Native video sources can play directly
 * - RAW sources have a generated video proxy
 */
export function canPlayback(
  sourceType: SourceType,
  hasVideoProxy: boolean
): boolean {
  const capabilities = getPreviewCapabilities(sourceType)
  
  if (capabilities.canPlayNative) {
    return true
  }
  
  if (capabilities.canGenerateVideoProxy && hasVideoProxy) {
    return true
  }
  
  return false
}

/**
 * Determine if transport controls should be enabled.
 * 
 * Controls are enabled when playback is available.
 */
export function areTransportControlsEnabled(
  sourceType: SourceType,
  hasVideoProxy: boolean,
  videoLoaded: boolean
): boolean {
  return canPlayback(sourceType, hasVideoProxy) && videoLoaded
}

/**
 * Get the status message to display for disabled transport controls.
 */
export function getPlaybackStatusMessage(
  sourceType: SourceType,
  hasVideoProxy: boolean,
  videoLoaded: boolean,
  videoLoading: boolean,
  videoError: string | null
): string | null {
  const capabilities = getPreviewCapabilities(sourceType)
  
  // Playback is available - no message needed
  if (canPlayback(sourceType, hasVideoProxy) && videoLoaded) {
    return null
  }
  
  // Video is loading
  if (videoLoading) {
    return capabilities.canPlayNative 
      ? 'Loading video…' 
      : 'Generating preview proxy…'
  }
  
  // Video load error
  if (videoError) {
    return `Preview error: ${videoError}`
  }
  
  // Video not loaded yet but can play
  if (canPlayback(sourceType, hasVideoProxy) && !videoLoaded) {
    return 'Loading video…'
  }
  
  // Playback not available
  return capabilities.playbackDisabledMessage || null
}
