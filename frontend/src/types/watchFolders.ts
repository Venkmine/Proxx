/**
 * Watch Folders (V1) — Recursive, QC-Safe Automation
 * 
 * ⚠️ RECURSIVE FOLDER MONITORING ONLY
 * 
 * Watch folders automatically enqueue jobs when new eligible files appear
 * anywhere in a recursive directory tree. This is NOT a startup ingest scan.
 * 
 * CRITICAL RULES:
 * - ✅ Recursive: Watches entire folder tree
 * - ❌ No startup storm: Existing files are IGNORED when enabling
 * - ❌ No execution bypass: Uses preset → JobSpec → queue → execution
 * - ❌ No batching: One file = one job
 * - ✅ Eligibility gate: Extensions, patterns, duplicates checked
 * - ✅ FIFO preservation: Jobs queued normally, execute one at a time
 * 
 * USE CASES:
 * - Camera cards with nested folder structures
 * - Imported projects with deep hierarchies
 * - Nested vendor deliveries
 * - Editorial exports with subfolder organization
 * 
 * EXECUTION FLOW:
 * 1. New file detected (recursive)
 * 2. Check eligibility (extension, patterns, duplicates)
 * 3. Resolve preset by preset_id
 * 4. Build JobSpec normally
 * 5. Validate JobSpec
 * 6. Enqueue via existing FIFO queue
 * 7. Execute one at a time (existing logic)
 */

export interface WatchFolder {
  /** Unique identifier */
  id: string
  /** Root path to watch (recursively) */
  path: string
  /** Preset ID to use for jobs */
  preset_id: string
  /** Whether watching is active */
  enabled: boolean
  /** Always true for V1 (explicit recursive requirement) */
  recursive: true
  /** Allowlist of file extensions (e.g. ["mov", "mxf", "braw"]) */
  include_extensions?: string[]
  /** Exclusion patterns (regex or glob, e.g. /Proxy/, /\\.cache/) */
  exclude_patterns?: string[]
}

export interface WatchFolderRegistry {
  /** Map of watch folder ID to config */
  folders: Record<string, WatchFolder>
  /** Map of processed file paths to prevent duplicates */
  processed_files: Record<string, { mtime: number; hash?: string }>
}

export interface WatchFolderEvent {
  /** Watch folder ID that triggered this event */
  watch_folder_id: string
  /** File path that was detected */
  file_path: string
  /** Timestamp of event */
  timestamp: string
  /** Whether file was eligible for processing */
  eligible: boolean
  /** Rejection reason if not eligible */
  rejection_reason?: string
  /** Job ID if job was created */
  job_id?: string
}
