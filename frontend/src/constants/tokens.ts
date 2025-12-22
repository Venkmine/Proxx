/**
 * tokens.ts — Canonical Token Definitions
 * 
 * SINGLE SOURCE OF TRUTH for all token usage:
 * - Naming Template (TokenPalette)
 * - Text Burn-In (VisualPreviewModal)
 * - Tooltips and previews
 * 
 * RULE: No component may define its own token list.
 * All token usage MUST import from this file.
 */

// ============================================================================
// TYPES
// ============================================================================

export interface Token {
  /** Unique identifier for the token */
  id: string
  /** Display label in UI */
  label: string
  /** Token pattern for substitution (e.g., '{source}') */
  token: string
  /** Human-readable description for tooltips */
  description: string
  /** Category for grouping in UI */
  category: 'source' | 'output' | 'metadata' | 'time'
}

export interface SeparatorToken {
  id: string
  label: string
  token: string
  description: string
}

// ============================================================================
// CANONICAL TOKEN LIST
// ============================================================================

/**
 * Primary tokens available for naming templates and text burn-ins.
 * Order determines display order in UI palettes.
 */
export const AVAILABLE_TOKENS: Token[] = [
  // Source metadata
  { id: 'source', label: 'Source', token: '{source}', description: 'Original filename without extension', category: 'source' },
  { id: 'reel', label: 'Reel', token: '{reel}', description: 'Source reel name from metadata', category: 'source' },
  
  // Time-related
  { id: 'tc', label: 'Timecode', token: '{tc}', description: 'Source timecode', category: 'time' },
  { id: 'date', label: 'Date', token: '{date}', description: 'Current date (YYYYMMDD)', category: 'time' },
  { id: 'frame', label: 'Frame', token: '{frame}', description: 'Current frame number', category: 'time' },
  
  // Output metadata
  { id: 'codec', label: 'Codec', token: '{codec}', description: 'Output codec name', category: 'output' },
  { id: 'resolution', label: 'Resolution', token: '{resolution}', description: 'Output resolution (1920x1080)', category: 'output' },
  { id: 'fps', label: 'FPS', token: '{fps}', description: 'Frame rate (e.g., 24, 25, 29.97)', category: 'output' },
  
  // Job metadata
  { id: 'job_name', label: 'Job', token: '{job_name}', description: 'Name of the encoding job', category: 'metadata' },
  { id: 'version', label: 'Version', token: '{version}', description: 'Version number (v01, v02, etc.)', category: 'metadata' },
  { id: 'proxy', label: 'Proxy', token: '{proxy}', description: 'Adds "_proxy" when creating proxy', category: 'metadata' },
]

/**
 * Separator tokens for naming templates.
 * Not typically used in burn-ins.
 */
export const SEPARATOR_TOKENS: SeparatorToken[] = [
  { id: 'sep_underscore', label: '_', token: '_', description: 'Underscore separator' },
  { id: 'sep_dash', label: '-', token: '-', description: 'Dash separator' },
  { id: 'sep_dot', label: '.', token: '.', description: 'Dot separator' },
  { id: 'sep_space', label: '␣', token: ' ', description: 'Space separator' },
]

// ============================================================================
// SUBSET EXPORTS FOR SPECIFIC USE CASES
// ============================================================================

/**
 * Tokens available for text burn-ins.
 * Excludes tokens that don't make sense in visual overlays.
 */
export const TEXT_BURNIN_TOKENS = AVAILABLE_TOKENS.filter(t => 
  ['source', 'reel', 'tc', 'date', 'frame', 'fps', 'job_name'].includes(t.id)
)

/**
 * Tokens available for naming templates.
 * Full set with all tokens.
 */
export const NAMING_TOKENS = AVAILABLE_TOKENS

// ============================================================================
// SAMPLE DATA FOR PREVIEW
// ============================================================================

/**
 * Mock sample data for live preview of token substitution.
 * Used in TokenPalette and VisualPreviewModal.
 */
export const SAMPLE_METADATA: Record<string, string | (() => string)> = {
  source: 'A001_C001_0101AB',
  source_name: 'A001_C001_0101AB', // Legacy alias
  reel: 'A001',
  tc: '10:00:00:00',
  timecode: '10_00_00_00', // Legacy format for filenames
  date: () => new Date().toISOString().slice(0, 10).replace(/-/g, ''),
  frame: '1001',
  codec: 'h264',
  resolution: '1920x1080',
  fps: '24',
  proxy: '_proxy',
  job_name: 'DailyEdit',
  version: 'v01',
}

/**
 * Resolves a token pattern to its sample value.
 */
export function resolveToken(tokenPattern: string): string {
  // Strip braces
  const key = tokenPattern.replace(/[{}]/g, '')
  const value = SAMPLE_METADATA[key]
  if (typeof value === 'function') {
    return value()
  }
  return value ?? tokenPattern
}

/**
 * Resolves all tokens in a template string to sample values.
 */
export function resolveTokens(template: string): string {
  return template.replace(/\{([^}]+)\}/g, (match) => resolveToken(match))
}
