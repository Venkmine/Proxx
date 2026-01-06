/**
 * Deterministic Execution Engine Derivation
 * 
 * Pure function that determines which execution engines a job requires
 * based solely on source media metadata.
 * 
 * Design principles:
 * - No side effects
 * - No UI interaction
 * - No filesystem access
 * - No network calls
 * - No logging (caller logs)
 * - Deterministic and testable
 * 
 * This function is CURRENTLY UNUSED - it establishes the logic foundation
 * before wiring to JobSpec construction.
 */

import { looksLikeRawFile, isAmbiguousContainer } from './rawFormats'

/**
 * Source metadata required for engine derivation.
 */
export interface SourceMetadata {
  /** File path or name */
  path: string
  
  /** Optional: Codec name if known (e.g., from backend inspection) */
  codec?: string
  
  /** Optional: Container format if known */
  container?: string
}

/**
 * Engine derivation result.
 */
export interface EngineRequirements {
  /** FFmpeg engine is required */
  useFFmpeg: boolean
  
  /** DaVinci Resolve engine is required */
  useResolve: boolean
  
  /** Reason for this derivation (for debugging/logging) */
  reason: string
}

/**
 * Derive which execution engines a job requires.
 * 
 * Rules (locked, deterministic):
 * - Any camera RAW source → useResolve = true
 * - Any non-RAW source → useFFmpeg = true
 * - Mixed sources → both true
 * - Empty sources → throw error (invalid state)
 * 
 * LIMITATIONS:
 * - Extension-based RAW detection only (frontend limitation)
 * - Ambiguous containers (.mov, .mxf) conservatively treated as RAW
 * - Backend must provide codec metadata for definitive routing
 * 
 * @param sources - Array of source file metadata
 * @returns Engine requirements with reasoning
 * @throws Error if sources array is empty (invalid state)
 * 
 * @example
 * // All RAW
 * deriveExecutionEngines([
 *   { path: 'clip1.r3d' },
 *   { path: 'clip2.braw' }
 * ])
 * // => { useFFmpeg: false, useResolve: true, reason: 'All sources are RAW' }
 * 
 * @example
 * // All non-RAW
 * deriveExecutionEngines([
 *   { path: 'clip1.mp4' },
 *   { path: 'clip2.mov', codec: 'h264' }
 * ])
 * // => { useFFmpeg: true, useResolve: false, reason: 'All sources are non-RAW' }
 * 
 * @example
 * // Mixed
 * deriveExecutionEngines([
 *   { path: 'raw.r3d' },
 *   { path: 'standard.mp4' }
 * ])
 * // => { useFFmpeg: true, useResolve: true, reason: 'Mixed RAW and non-RAW sources' }
 */
export function deriveExecutionEngines(sources: SourceMetadata[]): EngineRequirements {
  // Validate input
  if (!sources || sources.length === 0) {
    throw new Error('Cannot derive execution engines: sources array is empty (invalid state)')
  }
  
  // Classify each source as RAW or non-RAW
  let hasRaw = false
  let hasNonRaw = false
  
  for (const source of sources) {
    const isRaw = classifySource(source)
    
    if (isRaw) {
      hasRaw = true
    } else {
      hasNonRaw = true
    }
    
    // Early exit if we already know it's mixed
    if (hasRaw && hasNonRaw) {
      break
    }
  }
  
  // Derive engine requirements
  if (hasRaw && hasNonRaw) {
    return {
      useFFmpeg: true,
      useResolve: true,
      reason: 'Mixed RAW and non-RAW sources',
    }
  } else if (hasRaw) {
    return {
      useFFmpeg: false,
      useResolve: true,
      reason: 'All sources are RAW',
    }
  } else {
    return {
      useFFmpeg: true,
      useResolve: false,
      reason: 'All sources are non-RAW',
    }
  }
}

/**
 * Classify a single source as RAW or non-RAW.
 * 
 * Conservative approach:
 * - Known RAW extensions → RAW
 * - Ambiguous containers without codec metadata → treated as RAW (safe default)
 * - Codec metadata overrides extension (when available)
 * 
 * @param source - Source metadata
 * @returns true if source appears to be RAW
 */
function classifySource(source: SourceMetadata): boolean {
  // If we have codec metadata, use it for definitive classification
  if (source.codec) {
    return isRawCodec(source.codec)
  }
  
  // Extract extension from path
  const extension = source.path.split('.').pop()?.toLowerCase() || ''
  
  // Check if it's an ambiguous container
  if (isAmbiguousContainer(extension)) {
    // Conservative: treat as RAW if we don't have codec metadata
    // Backend must provide codec inspection for definitive routing
    return true
  }
  
  // Use extension-based RAW detection
  return looksLikeRawFile(source.path)
}

/**
 * Check if a codec name indicates a RAW format.
 * 
 * @param codec - Codec name (from FFprobe or similar)
 * @returns true if codec is RAW
 */
function isRawCodec(codec: string): boolean {
  const normalized = codec.toLowerCase()
  
  // Known RAW codec names
  const rawCodecs = [
    'prores_raw',
    'proresraw',
    'arriraw',
    'redcode',
    'r3d',
    'braw',
    'blackmagic_raw',
    'cinema_dng',
    'cinemadng',
    'sony_raw',
  ]
  
  return rawCodecs.some(raw => normalized.includes(raw))
}
