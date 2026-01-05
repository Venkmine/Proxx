/**
 * buildJobSpec — Pure UI-only JobSpec builder
 * 
 * ⚠️ PURE FUNCTION — NO SIDE EFFECTS, NO BACKEND, NO FILESYSTEM
 * 
 * Transforms Output tab state into a JobSpec JSON object suitable for
 * backend execution. This is a deterministic mapping with no external
 * dependencies.
 * 
 * SCOPE:
 * - ✓ Maps Output state → JobSpec structure
 * - ✓ Generates job_id and timestamps
 * - ✓ Fail-fast on missing required fields
 * - ❌ NO validation (delegated to backend)
 * - ❌ NO backend calls
 * - ❌ NO filesystem operations
 * - ❌ NO side effects
 * 
 * USAGE:
 * ```ts
 * const jobSpec = buildJobSpec({
 *   sources: ['/path/to/source.mov'],
 *   outputPath: '/path/to/output',
 *   containerFormat: 'mov',
 *   filenameTemplate: '{source_name}_proxy',
 *   deliveryType: 'proxy'
 * })
 * ```
 * 
 * CONTRACT:
 * - JobSpec version: 2.1
 * - Required fields enforced at build time
 * - Deterministic output for same inputs
 */

export interface OutputState {
  /** Ordered list of source file paths */
  sources: string[]
  /** Output directory path */
  outputPath: string
  /** Container format (mov, mp4, mxf) */
  containerFormat: string
  /** Filename template with optional tokens */
  filenameTemplate: string
  /** Delivery type (proxy or delivery) */
  deliveryType: 'proxy' | 'delivery'
  /** Optional codec override */
  codec?: string
  /** Optional resolution override */
  resolution?: string
  /** Optional frame rate mode */
  fpsMode?: 'same-as-source' | 'explicit'
  /** Optional explicit frame rate value */
  fpsExplicit?: number
}

export interface JobSpec {
  /** JobSpec contract version (always "2.1") */
  jobspec_version: string
  /** Unique job identifier (8-char hex) */
  job_id: string
  /** Ordered list of source file paths */
  sources: string[]
  /** Output directory path */
  output_directory: string
  /** Video codec */
  codec: string
  /** Container format */
  container: string
  /** Target resolution */
  resolution: string
  /** Frame rate handling mode */
  fps_mode: string
  /** Explicit frame rate (null if fps_mode is 'same-as-source') */
  fps_explicit: number | null
  /** Resolve preset name (null for now) */
  resolve_preset: string | null
  /** Proxy profile identifier (null for now) */
  proxy_profile: string | null
  /** Resolve edition requirement */
  requires_resolve_edition: string
  /** Output filename template */
  naming_template: string
  /** Resolved naming tokens (empty for now) */
  resolved_tokens: Record<string, string>
  /** ISO 8601 creation timestamp */
  created_at: string
  /** LUT identifier (null for now) */
  lut_id: string | null
  /** Whether LUT was applied */
  lut_applied: boolean
  /** LUT engine used (null for now) */
  lut_engine: string | null
}

export class JobSpecBuildError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'JobSpecBuildError'
  }
}

/**
 * Generate a short 8-character hex job ID
 */
function generateJobId(): string {
  // Generate 4 random bytes and convert to hex (8 chars)
  const bytes = new Uint8Array(4)
  crypto.getRandomValues(bytes)
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

/**
 * Get current timestamp in ISO 8601 format with UTC timezone
 */
function getTimestamp(): string {
  return new Date().toISOString()
}

/**
 * Get default codec based on delivery type
 */
function getDefaultCodec(deliveryType: 'proxy' | 'delivery'): string {
  return deliveryType === 'proxy' ? 'prores_proxy' : 'prores_hq'
}

/**
 * Get default resolution based on delivery type
 */
function getDefaultResolution(deliveryType: 'proxy' | 'delivery'): string {
  return deliveryType === 'proxy' ? 'half' : 'same'
}

/**
 * Build a JobSpec from Output tab state
 * 
 * This is a PURE function with deterministic output.
 * Throws JobSpecBuildError on missing required fields.
 * 
 * @param outputState - Current Output tab state
 * @returns JobSpec object ready for backend submission
 * @throws {JobSpecBuildError} If required fields are missing
 */
export function buildJobSpec(outputState: OutputState): JobSpec {
  // =================================================================
  // Fail-Fast: Required Fields Validation
  // =================================================================
  
  if (!outputState.sources || outputState.sources.length === 0) {
    throw new JobSpecBuildError(
      'Missing required field: sources (must have at least one source file)'
    )
  }
  
  if (!outputState.outputPath || outputState.outputPath.trim() === '') {
    throw new JobSpecBuildError(
      'Missing required field: outputPath (output directory cannot be empty)'
    )
  }
  
  if (!outputState.containerFormat || outputState.containerFormat.trim() === '') {
    throw new JobSpecBuildError(
      'Missing required field: containerFormat (container format cannot be empty)'
    )
  }
  
  if (!outputState.filenameTemplate || outputState.filenameTemplate.trim() === '') {
    throw new JobSpecBuildError(
      'Missing required field: filenameTemplate (filename template cannot be empty)'
    )
  }
  
  // =================================================================
  // JobSpec Construction
  // =================================================================
  
  const jobSpec: JobSpec = {
    // Contract version (locked at 2.1)
    jobspec_version: '2.1',
    
    // Generate unique job ID
    job_id: generateJobId(),
    
    // Source files (preserve order)
    sources: [...outputState.sources],
    
    // Output configuration
    output_directory: outputState.outputPath,
    container: outputState.containerFormat,
    naming_template: outputState.filenameTemplate,
    
    // Codec and resolution (use overrides or defaults based on delivery type)
    codec: outputState.codec || getDefaultCodec(outputState.deliveryType),
    resolution: outputState.resolution || getDefaultResolution(outputState.deliveryType),
    
    // Frame rate handling
    fps_mode: outputState.fpsMode || 'same-as-source',
    fps_explicit: outputState.fpsExplicit || null,
    
    // Future fields (null for now)
    resolve_preset: null,
    proxy_profile: null,
    requires_resolve_edition: 'either',
    
    // Naming tokens (empty until resolved during execution)
    resolved_tokens: {},
    
    // Timestamp
    created_at: getTimestamp(),
    
    // LUT fields (null/false for now)
    lut_id: null,
    lut_applied: false,
    lut_engine: null,
  }
  
  return jobSpec
}

/**
 * Serialize JobSpec to JSON string with stable ordering
 * 
 * @param jobSpec - JobSpec object to serialize
 * @param indent - Indentation level (default: 2)
 * @returns JSON string representation
 */
export function jobSpecToJson(jobSpec: JobSpec, indent: number = 2): string {
  return JSON.stringify(jobSpec, null, indent)
}
