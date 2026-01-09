/**
 * Watch Folders V2 - Types
 * 
 * INTENT.md Compliance:
 * - Detection is automatic (file watcher runs)
 * - Execution is MANUAL (operator must click "Create Jobs")
 * - No auto-retry, no silent automation
 * - Full QC_ACTION_TRACE coverage
 * 
 * Single Source of Truth:
 * - WatchFolder state is owned by Electron main process
 * - Renderer receives state via IPC
 * - Pending files accumulate until operator acts
 * 
 * PHASE 6.5: Counts-First Model
 * - Counters track lifecycle: Detected → Staged → Jobs Created → Completed/Failed
 * - Counts survive UI refreshes (persisted in main process)
 * - No inference from UI text - counts are explicit
 */

/**
 * Watch folder status enum - unambiguous states
 * PHASE 7: Added 'armed' status for auto job creation mode
 */
export type WatchFolderStatus = 'watching' | 'paused' | 'armed'

/**
 * Per-watch-folder counters for tracking file lifecycle
 * PHASE 6.5: Counts-first model for scalability
 */
export interface WatchFolderCounts {
  /** Total files detected since last reset */
  detected: number
  /** Files currently eligible for job creation (not yet processed) */
  staged: number
  /** Files already converted into jobs */
  jobs_created: number
  /** Successful encodes from this watch folder */
  completed: number
  /** Failed encodes (sticky - does not auto-clear) */
  failed: number
}

/**
 * A watched folder configuration
 */
export interface WatchFolder {
  /** Unique identifier (UUID) */
  id: string
  /** Absolute path to the folder being watched */
  path: string
  /** Whether the watcher is currently active */
  enabled: boolean
  /** Explicit status for UI clarity (derived from enabled + armed) */
  status: WatchFolderStatus
  /** 
   * PHASE 7: Armed mode - when true, automatically creates jobs for detected files
   * Requires: preset_id set, delivery destination configured, engine resolved
   * Cannot be armed while paused
   */
  armed: boolean
  /** Whether to watch subdirectories recursively */
  recursive: boolean
  /** Optional preset ID to apply to detected files */
  preset_id?: string
  /** File extensions to include (e.g., ['.mov', '.mxf']) - empty means all video files */
  include_extensions: string[]
  /** Glob patterns to exclude (e.g., ['._*', '.DS_Store']) */
  exclude_patterns: string[]
  /** Files detected but not yet processed (pending operator action) */
  pending_files: PendingFile[]
  /** PHASE 6.5: Lifecycle counters */
  counts: WatchFolderCounts
  /** Optional error message if watcher failed */
  error?: string
  /** Timestamp when watcher was created */
  created_at: string
  /** Timestamp when watcher was last modified */
  updated_at: string
}

/**
 * A file detected by the watcher, pending operator action
 */
export interface PendingFile {
  /** Absolute path to the detected file */
  path: string
  /** File size in bytes */
  size: number
  /** Timestamp when file was detected */
  detected_at: string
  /** Whether file is selected for job creation */
  selected: boolean
}

/**
 * Configuration for adding a new watch folder
 */
export interface WatchFolderConfig {
  path: string
  enabled: boolean
  recursive: boolean
  preset_id?: string
  include_extensions: string[]
  exclude_patterns: string[]
}

/**
 * IPC Events sent from main process to renderer
 */
export interface WatchFolderEvents {
  /** Emitted when a file is detected in a watched folder */
  'watch-folder:file-detected': {
    watchFolderId: string
    file: PendingFile
  }
  /** Emitted when watch folder state changes */
  'watch-folder:state-changed': {
    watchFolders: WatchFolder[]
  }
  /** Emitted when a watcher encounters an error */
  'watch-folder:error': {
    watchFolderId: string
    error: string
  }
}

/**
 * QC_ACTION_TRACE events for Watch Folders
 * These events are logged for E2E test observability
 * PHASE 7: Added armed-related events
 */
export type WatchFolderTraceEvent =
  | 'WATCH_FOLDER_ADDED'
  | 'WATCH_FOLDER_ENABLED'
  | 'WATCH_FOLDER_DISABLED'
  | 'WATCH_FOLDER_REMOVED'
  | 'WATCH_FOLDER_FILE_DETECTED'
  | 'WATCH_FOLDER_PENDING_LIST_UPDATED'
  | 'WATCH_FOLDER_JOBS_CREATED'
  | 'WATCH_FOLDER_COUNTS_UPDATED'
  | 'WATCH_FOLDER_JOB_COMPLETED'
  | 'WATCH_FOLDER_JOB_FAILED'
  // PHASE 7: Armed watch folder events
  | 'WATCH_FOLDER_ARMED'
  | 'WATCH_FOLDER_DISARMED'
  | 'WATCH_FOLDER_ARM_BLOCKED'
  | 'WATCH_FOLDER_AUTO_JOB_CREATED'
  | 'WATCH_FOLDER_AUTO_JOB_BLOCKED'

/**
 * PHASE 7: Reasons why a watch folder cannot be armed
 */
export type ArmBlockReason =
  | 'NO_PRESET'          // No preset assigned
  | 'PAUSED'             // Watch folder is paused
  | 'ALREADY_ARMED'      // Already in armed state
  | 'WATCHER_ERROR'      // Watcher has an error

/**
 * PHASE 7: Result of arm validation check
 */
export interface ArmValidationResult {
  canArm: boolean
  blockReasons: ArmBlockReason[]
}

/**
 * Trace event payload for QC observability
 * PHASE 7: Extended with armed-related details
 */
export interface WatchFolderTracePayload {
  event: WatchFolderTraceEvent
  watchFolderId: string
  timestamp: string
  details?: {
    path?: string
    fileCount?: number
    jobIds?: string[]
    error?: string
    counts?: WatchFolderCounts
    // PHASE 7: Armed-related details
    armed?: boolean
    blockReasons?: ArmBlockReason[]
    autoJobId?: string
    sourcePath?: string
    presetId?: string
  }
}

/**
 * Default video file extensions to watch
 */
export const DEFAULT_VIDEO_EXTENSIONS = [
  '.mov',
  '.mp4',
  '.mxf',
  '.avi',
  '.mkv',
  '.r3d',
  '.braw',
  '.ari',
  '.dng',
]

/**
 * Default exclude patterns (system files, hidden files)
 */
export const DEFAULT_EXCLUDE_PATTERNS = [
  '**/._*',
  '**/.DS_Store',
  '**/Thumbs.db',
  '**/.Spotlight-V100',
  '**/.Trashes',
]
