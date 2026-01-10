/**
 * Ingest Source Types - PHASE 8
 * 
 * Shared abstraction for file sources across Watch Folders, Manual Adds, and Future Ingest Pipeline.
 * 
 * DESIGN GOALS:
 * - Unified model for all file ingestion paths
 * - Count-based (never file lists) for scalability
 * - State machine clarity (IDLE → DETECTING → READY → ERROR)
 * - Future-proof for copy-then-transcode workflows
 * 
 * NON-GOALS (Phase 8):
 * - No auto job creation logic
 * - No file moves or copies
 * - No execution behaviour attached
 * - No Resolve interaction
 */

/**
 * Types of ingest sources
 */
export type IngestSourceType = 
  | 'WATCH_FOLDER'      // Automated filesystem watcher
  | 'MANUAL'            // Operator drag-drop or file selection
  | 'INGEST_PIPELINE'   // Future: staged copy-then-transcode

/**
 * Lifecycle states for an ingest source
 */
export type IngestSourceState =
  | 'IDLE'              // No activity, waiting for files
  | 'DETECTING'         // Actively scanning/watching for files
  | 'READY'             // Files detected and ready for job creation
  | 'ERROR'             // Error state (watcher failed, path invalid, etc.)

/**
 * Future ingest strategy (PHASE 8: schema only, no behavior)
 */
export type IngestStrategy =
  | 'DIRECT'            // Files processed in place (current behavior)
  | 'COPY_THEN_PROCESS' // Files copied to staging area first (future)

/**
 * Unified ingest source abstraction
 * 
 * CRITICAL: This is count-based only. No file lists.
 * Individual file details belong in domain-specific structures (WatchFolder.pending_files).
 */
export interface IngestSource {
  /** Unique identifier (UUID) */
  id: string
  
  /** Source type - determines which subsystem owns this source */
  type: IngestSourceType
  
  /** Source path (watch folder path, manual selection root, or staging directory) */
  sourcePath: string
  
  /** Timestamp when source was created or files first detected */
  detectedAt: number
  
  /** Count of files currently available in this source */
  fileCount: number
  
  /** Current state of the source */
  state: IngestSourceState
  
  /** Optional error message if state is ERROR */
  error?: string
  
  /** 
   * PHASE 8: Future ingest strategy (not used yet)
   * When COPY_THEN_PROCESS is implemented, files will be copied to stagingPath first
   */
  ingestStrategy?: IngestStrategy
  
  /**
   * PHASE 8: Future staging path (not used yet)
   * Target directory for copy-then-transcode workflow
   */
  stagingPath?: string
  
  /** Last activity timestamp (updated when files added/removed/processed) */
  lastActivityAt: number
}

/**
 * Conversion utilities (not yet implemented in Phase 8)
 * These will be added when Watch Folders are refactored to emit IngestSources
 */

/**
 * Convert Watch Folder to IngestSource summary
 * (Future: replace direct WatchFolder state with IngestSource emission)
 */
export interface WatchFolderToIngestSourceMapping {
  watchFolderId: string
  ingestSourceId: string
  // Reserved for future implementation
}

