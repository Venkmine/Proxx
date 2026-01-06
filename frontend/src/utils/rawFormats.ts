/**
 * RAW Format Definitions
 * 
 * Authoritative list of camera RAW formats that require DaVinci Resolve.
 * 
 * Design principles:
 * - Explicit extension whitelist
 * - No MIME sniffing
 * - No filesystem access
 * - No binary probing
 * - Deterministic and boring
 * 
 * Source of truth for engine routing logic.
 */

/**
 * Camera RAW file extensions that require Resolve.
 * 
 * These formats contain proprietary RAW sensor data that FFmpeg cannot decode.
 */
export const RAW_EXTENSIONS = [
  // RED Digital Cinema
  'r3d',
  
  // ARRI
  'ari',
  'arx',
  
  // Blackmagic Design
  'braw',
  
  // Canon
  'crm',
  'rmf',
  
  // Sony
  'mxf',  // Note: MXF can be RAW or non-RAW, requires codec inspection
  
  // Panasonic
  'rw2',
  
  // Apple ProRes RAW
  // Note: ProRes RAW is in .mov container, requires codec inspection
] as const

/**
 * Check if a file extension indicates a camera RAW format.
 * 
 * @param extension - File extension (with or without leading dot)
 * @returns true if the extension is a known RAW format
 * 
 * @example
 * isRawExtension('r3d')     // true
 * isRawExtension('.r3d')    // true
 * isRawExtension('mp4')     // false
 * isRawExtension('.mp4')    // false
 */
export function isRawExtension(extension: string): boolean {
  const normalized = extension.toLowerCase().replace(/^\./, '')
  return (RAW_EXTENSIONS as readonly string[]).includes(normalized)
}

/**
 * Check if a file path appears to be a camera RAW file based on extension.
 * 
 * LIMITATIONS:
 * - This is extension-based only
 * - .mov and .mxf files require codec inspection to determine if RAW
 * - Does not inspect file contents
 * - Does not probe with FFprobe
 * 
 * For definitive RAW detection, use backend source inspection.
 * 
 * @param path - File path or name
 * @returns true if the path has a RAW extension
 * 
 * @example
 * looksLikeRawFile('/path/to/clip.r3d')        // true
 * looksLikeRawFile('footage.braw')             // true
 * looksLikeRawFile('/clips/standard.mp4')      // false
 */
export function looksLikeRawFile(path: string): boolean {
  const extension = path.split('.').pop() || ''
  return isRawExtension(extension)
}

/**
 * Ambiguous container formats that require codec inspection.
 * 
 * These containers can hold either RAW or standard codecs.
 * Frontend cannot determine RAW status - backend must inspect.
 */
export const AMBIGUOUS_CONTAINERS = [
  'mov',   // Could be ProRes, ProRes RAW, H.264, etc.
  'mxf',   // Could be DNxHD, Sony RAW, ARRIRAW, etc.
] as const

/**
 * Check if a file extension is an ambiguous container format.
 * 
 * @param extension - File extension (with or without leading dot)
 * @returns true if the extension is ambiguous
 */
export function isAmbiguousContainer(extension: string): boolean {
  const normalized = extension.toLowerCase().replace(/^\./, '')
  return (AMBIGUOUS_CONTAINERS as readonly string[]).includes(normalized)
}
