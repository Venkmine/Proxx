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
 * - ✓ Derives execution engine requirements from sources
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

import { deriveExecutionEngines } from './deriveExecutionEngines'

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
  /** Execution engine requirements (derived from source formats) */
  execution_engines: {
    /** FFmpeg engine is required */
    use_ffmpeg: boolean
    /** DaVinci Resolve engine is required */
    use_resolve: boolean
  }
  /**
   * PHASE 11: Execution capability status
   * - SUPPORTED: FFmpeg can handle all sources
   * - BLOCKED: Requires Resolve which is unavailable
   * - UNKNOWN: Capability not yet determined
   */
  capability_status: 'SUPPORTED' | 'BLOCKED' | 'UNKNOWN'
  /**
   * PHASE 11: Human-readable reason for blocked status
   * Only set when capability_status is BLOCKED
   */
  blocked_reason?: string
  /** 
   * PHASE 9B: Job state (DRAFT, QUEUED, RUNNING, etc.)
   * Created jobs start as DRAFT, require Add to Queue, then explicit Start
   */
  state: 'DRAFT' | 'QUEUED' | 'RUNNING' | 'PAUSED' | 'COMPLETED' | 'FAILED' | 'CANCELLED'
  /** 
   * PHASE 9B: Whether execution has been explicitly requested
   * Only true when user clicks Start. Watch folders and auto-queue set to false.
   */
  execution_requested: boolean
  /**
   * PHASE 9C: Ingest source association for watch folder jobs
   */
  ingest_source_id?: string
  /**
   * PHASE 9C: Ingest source type (WATCH_FOLDER, MANUAL, etc.)
   */
  ingest_source_type?: string
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
  // Derive Execution Engine Requirements
  // =================================================================
  
  // Convert sources to SourceMetadata format for engine derivation
  const sourceMetadata = outputState.sources.map(path => ({ path }))
  
  // Derive which engines this job requires
  // This will throw if sources array is empty (already validated above)
  const engineRequirements = deriveExecutionEngines(sourceMetadata)
  
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
    
    // Execution engine requirements (derived from source formats)
    execution_engines: {
      use_ffmpeg: engineRequirements.useFFmpeg,
      use_resolve: engineRequirements.useResolve,
    },
    
    // PHASE 11: Capability status based on engine requirements
    // If Resolve is required but not available (Proxy v1), job is BLOCKED
    capability_status: engineRequirements.useResolve && !engineRequirements.useFFmpeg 
      ? 'BLOCKED' 
      : engineRequirements.useResolve 
        ? 'BLOCKED'  // Mixed sources also blocked (need Resolve for RAW portion)
        : 'SUPPORTED',
    blocked_reason: engineRequirements.useResolve 
      ? `This job contains RAW format(s) that cannot be transcoded by FFmpeg. ${engineRequirements.reason}. Use DaVinci Resolve engine or generate a proxy via Resolve.`
      : undefined,
    
    // PHASE 9B: Job starts in DRAFT state, requires explicit queue and start
    state: 'DRAFT',
    execution_requested: false,
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
