/**
 * Watch Folder Service V2 - Electron Main Process
 * 
 * INTENT.md Compliance:
 * - Detection is automatic (chokidar watches filesystem)
 * - Execution is MANUAL (files accumulate in pending_files)
 * - No auto-retry, no silent automation
 * - Full QC_ACTION_TRACE logging
 * 
 * Architecture:
 * - Single source of truth: watchFoldersState Map
 * - State pushed to renderer via IPC
 * - Pending files accumulate until operator creates jobs
 * 
 * PHASE 6.5: Counts-First Model
 * - Counters track lifecycle: Detected → Staged → Jobs Created → Completed/Failed
 * - Counts update deterministically
 * - Counts survive UI refreshes
 */

import { BrowserWindow } from 'electron'
import chokidar, { FSWatcher } from 'chokidar'
import path from 'node:path'
import fs from 'node:fs'
import { randomUUID } from 'node:crypto'

// ============================================
// Types (mirrored from frontend for isolation)
// ============================================

/** Watch folder status - unambiguous states */
type WatchFolderStatus = 'watching' | 'paused'

/** Per-watch-folder counters (PHASE 6.5) */
interface WatchFolderCounts {
  detected: number
  staged: number
  jobs_created: number
  completed: number
  failed: number
}

interface PendingFile {
  path: string
  size: number
  detected_at: string
  selected: boolean
}

interface WatchFolder {
  id: string
  path: string
  enabled: boolean
  status: WatchFolderStatus
  recursive: boolean
  preset_id?: string
  include_extensions: string[]
  exclude_patterns: string[]
  pending_files: PendingFile[]
  counts: WatchFolderCounts
  error?: string
  created_at: string
  updated_at: string
}

export interface WatchFolderConfig {
  path: string
  enabled: boolean
  recursive: boolean
  preset_id?: string
  include_extensions: string[]
  exclude_patterns: string[]
}

// ============================================
// State (Single Source of Truth)
// ============================================

/** All watch folders, keyed by ID */
const watchFoldersState = new Map<string, WatchFolder>()

/** Active chokidar watchers, keyed by watch folder ID */
const activeWatchers = new Map<string, FSWatcher>()

/** Default video extensions */
const DEFAULT_VIDEO_EXTENSIONS = [
  '.mov', '.mp4', '.mxf', '.avi', '.mkv',
  '.r3d', '.braw', '.ari', '.dng', '.dpx', '.exr'
]

/** Default exclude patterns */
const DEFAULT_EXCLUDE_PATTERNS = [
  '**/._*',
  '**/.DS_Store',
  '**/Thumbs.db',
  '**/.Spotlight-V100',
  '**/.Trashes',
]

// ============================================
// QC_ACTION_TRACE Logging
// ============================================

function logTrace(event: string, watchFolderId: string, details?: Record<string, unknown>): void {
  const payload = {
    event,
    watchFolderId,
    timestamp: new Date().toISOString(),
    details,
  }
  console.log(`[QC_TRACE] ${event} watch_folder_id=${watchFolderId} timestamp=${payload.timestamp}`, details ? JSON.stringify(details) : '')
}

// ============================================
// State Management
// ============================================

function notifyStateChange(mainWindow: BrowserWindow | null): void {
  if (!mainWindow || mainWindow.isDestroyed()) return
  
  const watchFolders = Array.from(watchFoldersState.values())
  mainWindow.webContents.send('watch-folder:state-changed', { watchFolders })
}

function notifyFileDetected(mainWindow: BrowserWindow | null, watchFolderId: string, file: PendingFile): void {
  if (!mainWindow || mainWindow.isDestroyed()) return
  
  mainWindow.webContents.send('watch-folder:file-detected', { watchFolderId, file })
}

function notifyError(mainWindow: BrowserWindow | null, watchFolderId: string, error: string): void {
  if (!mainWindow || mainWindow.isDestroyed()) return
  
  mainWindow.webContents.send('watch-folder:error', { watchFolderId, error })
}

// ============================================
// File Detection Logic
// ============================================

function shouldIncludeFile(filePath: string, extensions: string[]): boolean {
  if (extensions.length === 0) {
    // Default to video extensions
    return DEFAULT_VIDEO_EXTENSIONS.some(ext => 
      filePath.toLowerCase().endsWith(ext)
    )
  }
  return extensions.some(ext => 
    filePath.toLowerCase().endsWith(ext.toLowerCase())
  )
}

function createWatcher(watchFolder: WatchFolder, mainWindow: BrowserWindow | null): FSWatcher {
  // Just watch the folder path - chokidar handles recursion via depth option
  // Using glob patterns with path.join can cause issues on different platforms
  const watchPath = watchFolder.path
  
  console.log(`[WATCH FOLDER] Creating watcher for: ${watchPath} (recursive: ${watchFolder.recursive})`)
  
  const watcher = chokidar.watch(watchPath, {
    ignored: watchFolder.exclude_patterns.length > 0 
      ? watchFolder.exclude_patterns 
      : DEFAULT_EXCLUDE_PATTERNS,
    persistent: true,
    ignoreInitial: false, // Scan existing files on start
    depth: watchFolder.recursive ? undefined : 0, // undefined = infinite depth
    awaitWriteFinish: {
      stabilityThreshold: 2000, // Wait 2s for file to finish writing
      pollInterval: 100,
    },
    usePolling: false, // Use native fsevents on macOS for better performance
  })
  
  watcher.on('ready', () => {
    console.log(`[WATCH FOLDER] Watcher ready for: ${watchPath}`)
    logTrace('WATCH_FOLDER_READY', watchFolder.id, { path: watchPath })
  })
  
  watcher.on('add', async (filePath: string) => {
    // Check if file matches extensions
    if (!shouldIncludeFile(filePath, watchFolder.include_extensions)) {
      return
    }
    
    // Check if file is already pending
    const existing = watchFolder.pending_files.find(f => f.path === filePath)
    if (existing) {
      return
    }
    
    try {
      const stats = await fs.promises.stat(filePath)
      
      const pendingFile: PendingFile = {
        path: filePath,
        size: stats.size,
        detected_at: new Date().toISOString(),
        selected: true, // Selected by default
      }
      
      // Add to pending files
      watchFolder.pending_files.push(pendingFile)
      watchFolder.updated_at = new Date().toISOString()
      
      // PHASE 6.5: Update counts deterministically
      watchFolder.counts.detected += 1
      watchFolder.counts.staged += 1
      
      // Log trace with counts
      logTrace('WATCH_FOLDER_FILE_DETECTED', watchFolder.id, { 
        path: filePath, 
        size: stats.size,
        counts: watchFolder.counts 
      })
      
      // Notify renderer
      notifyFileDetected(mainWindow, watchFolder.id, pendingFile)
      notifyStateChange(mainWindow)
      
    } catch (err) {
      console.error(`[WATCH FOLDER] Failed to stat file ${filePath}:`, err)
    }
  })
  
  watcher.on('error', (error: unknown) => {
    const errorMessage = error instanceof Error ? error.message : String(error)
    console.error(`[WATCH FOLDER] Watcher error for ${watchFolder.id}:`, error)
    watchFolder.error = errorMessage
    watchFolder.updated_at = new Date().toISOString()
    
    logTrace('WATCH_FOLDER_ERROR', watchFolder.id, { error: errorMessage })
    notifyError(mainWindow, watchFolder.id, errorMessage)
    notifyStateChange(mainWindow)
  })
  
  return watcher
}

// ============================================
// Public API
// ============================================

/**
 * Add a new watch folder
 */
export function addWatchFolder(config: WatchFolderConfig, mainWindow: BrowserWindow | null): WatchFolder {
  const id = randomUUID()
  const now = new Date().toISOString()
  
  const watchFolder: WatchFolder = {
    id,
    path: config.path,
    enabled: config.enabled,
    status: config.enabled ? 'watching' : 'paused',
    recursive: config.recursive,
    preset_id: config.preset_id,
    include_extensions: config.include_extensions,
    exclude_patterns: config.exclude_patterns,
    pending_files: [],
    counts: {
      detected: 0,
      staged: 0,
      jobs_created: 0,
      completed: 0,
      failed: 0,
    },
    created_at: now,
    updated_at: now,
  }
  
  watchFoldersState.set(id, watchFolder)
  
  logTrace('WATCH_FOLDER_ADDED', id, { path: config.path, recursive: config.recursive })
  
  // Start watcher if enabled
  if (config.enabled) {
    const watcher = createWatcher(watchFolder, mainWindow)
    activeWatchers.set(id, watcher)
    logTrace('WATCH_FOLDER_ENABLED', id, { path: config.path })
  }
  
  notifyStateChange(mainWindow)
  
  return watchFolder
}

/**
 * Enable a watch folder (start watching)
 */
export function enableWatchFolder(id: string, mainWindow: BrowserWindow | null): boolean {
  const watchFolder = watchFoldersState.get(id)
  if (!watchFolder) return false
  
  // Already enabled
  if (watchFolder.enabled && activeWatchers.has(id)) return true
  
  watchFolder.enabled = true
  watchFolder.status = 'watching'
  watchFolder.error = undefined
  watchFolder.updated_at = new Date().toISOString()
  
  const watcher = createWatcher(watchFolder, mainWindow)
  activeWatchers.set(id, watcher)
  
  logTrace('WATCH_FOLDER_ENABLED', id, { path: watchFolder.path })
  notifyStateChange(mainWindow)
  
  return true
}

/**
 * Disable a watch folder (stop watching)
 */
export function disableWatchFolder(id: string, mainWindow: BrowserWindow | null): boolean {
  const watchFolder = watchFoldersState.get(id)
  if (!watchFolder) return false
  
  watchFolder.enabled = false
  watchFolder.status = 'paused'
  watchFolder.updated_at = new Date().toISOString()
  
  const watcher = activeWatchers.get(id)
  if (watcher) {
    watcher.close()
    activeWatchers.delete(id)
  }
  
  logTrace('WATCH_FOLDER_DISABLED', id, { path: watchFolder.path })
  notifyStateChange(mainWindow)
  
  return true
}

/**
 * Remove a watch folder completely
 */
export function removeWatchFolder(id: string, mainWindow: BrowserWindow | null): boolean {
  const watchFolder = watchFoldersState.get(id)
  if (!watchFolder) return false
  
  // Stop watcher if active
  const watcher = activeWatchers.get(id)
  if (watcher) {
    watcher.close()
    activeWatchers.delete(id)
  }
  
  watchFoldersState.delete(id)
  
  logTrace('WATCH_FOLDER_REMOVED', id, { path: watchFolder.path })
  notifyStateChange(mainWindow)
  
  return true
}

/**
 * Update watch folder configuration
 */
export function updateWatchFolder(
  id: string, 
  updates: Partial<WatchFolderConfig>, 
  mainWindow: BrowserWindow | null
): WatchFolder | null {
  const watchFolder = watchFoldersState.get(id)
  if (!watchFolder) return null
  
  const wasEnabled = watchFolder.enabled
  
  // Apply updates
  if (updates.path !== undefined) watchFolder.path = updates.path
  if (updates.recursive !== undefined) watchFolder.recursive = updates.recursive
  if (updates.preset_id !== undefined) watchFolder.preset_id = updates.preset_id
  if (updates.include_extensions !== undefined) watchFolder.include_extensions = updates.include_extensions
  if (updates.exclude_patterns !== undefined) watchFolder.exclude_patterns = updates.exclude_patterns
  if (updates.enabled !== undefined) watchFolder.enabled = updates.enabled
  
  watchFolder.updated_at = new Date().toISOString()
  
  // Restart watcher if configuration changed and was enabled
  if (wasEnabled) {
    const existingWatcher = activeWatchers.get(id)
    if (existingWatcher) {
      existingWatcher.close()
      activeWatchers.delete(id)
    }
    
    if (watchFolder.enabled) {
      const newWatcher = createWatcher(watchFolder, mainWindow)
      activeWatchers.set(id, newWatcher)
    }
  }
  
  notifyStateChange(mainWindow)
  
  return watchFolder
}

/**
 * Toggle file selection in pending list
 */
export function togglePendingFileSelection(
  watchFolderId: string, 
  filePath: string, 
  mainWindow: BrowserWindow | null
): boolean {
  const watchFolder = watchFoldersState.get(watchFolderId)
  if (!watchFolder) return false
  
  const file = watchFolder.pending_files.find(f => f.path === filePath)
  if (!file) return false
  
  file.selected = !file.selected
  watchFolder.updated_at = new Date().toISOString()
  
  notifyStateChange(mainWindow)
  
  return true
}

/**
 * Select/deselect all pending files
 */
export function selectAllPendingFiles(
  watchFolderId: string, 
  selected: boolean, 
  mainWindow: BrowserWindow | null
): boolean {
  const watchFolder = watchFoldersState.get(watchFolderId)
  if (!watchFolder) return false
  
  for (const file of watchFolder.pending_files) {
    file.selected = selected
  }
  watchFolder.updated_at = new Date().toISOString()
  
  logTrace('WATCH_FOLDER_PENDING_LIST_UPDATED', watchFolderId, { 
    action: selected ? 'select_all' : 'deselect_all',
    fileCount: watchFolder.pending_files.length 
  })
  
  notifyStateChange(mainWindow)
  
  return true
}

/**
 * Clear pending files (after jobs created or manual clear)
 * PHASE 6.5: Updates staged count but NOT jobs_created (that happens in logJobsCreated)
 */
export function clearPendingFiles(
  watchFolderId: string, 
  filePaths: string[], 
  mainWindow: BrowserWindow | null
): boolean {
  const watchFolder = watchFoldersState.get(watchFolderId)
  if (!watchFolder) return false
  
  const clearedCount = filePaths.length
  
  watchFolder.pending_files = watchFolder.pending_files.filter(
    f => !filePaths.includes(f.path)
  )
  watchFolder.updated_at = new Date().toISOString()
  
  // PHASE 6.5: Update staged count (decrement by cleared count)
  watchFolder.counts.staged = Math.max(0, watchFolder.counts.staged - clearedCount)
  
  logTrace('WATCH_FOLDER_PENDING_LIST_UPDATED', watchFolderId, { 
    action: 'cleared',
    clearedCount,
    remainingCount: watchFolder.pending_files.length,
    counts: watchFolder.counts
  })
  
  notifyStateChange(mainWindow)
  
  return true
}

/**
 * Get all watch folders (for initial state sync)
 */
export function getAllWatchFolders(): WatchFolder[] {
  return Array.from(watchFoldersState.values())
}

/**
 * Get a single watch folder by ID
 */
export function getWatchFolder(id: string): WatchFolder | undefined {
  return watchFoldersState.get(id)
}

/**
 * Stop all watchers (for app shutdown)
 */
export function stopAllWatchers(): void {
  for (const [id, watcher] of activeWatchers) {
    console.log(`[WATCH FOLDER] Stopping watcher ${id}`)
    watcher.close()
  }
  activeWatchers.clear()
}

/**
 * Log jobs created from pending files (for QC trace)
 * PHASE 6.5: Increments jobs_created count
 */
export function logJobsCreated(watchFolderId: string, jobIds: string[], mainWindow: BrowserWindow | null = null): void {
  const watchFolder = watchFoldersState.get(watchFolderId)
  if (watchFolder) {
    watchFolder.counts.jobs_created += jobIds.length
    watchFolder.updated_at = new Date().toISOString()
  }
  
  logTrace('WATCH_FOLDER_JOBS_CREATED', watchFolderId, { 
    jobIds,
    jobCount: jobIds.length,
    counts: watchFolder?.counts
  })
  
  if (mainWindow) {
    notifyStateChange(mainWindow)
  }
}

/**
 * Record a job completion from this watch folder
 * PHASE 6.5: Increments completed count
 */
export function recordJobCompleted(watchFolderId: string, jobId: string, mainWindow: BrowserWindow | null = null): void {
  const watchFolder = watchFoldersState.get(watchFolderId)
  if (!watchFolder) return
  
  watchFolder.counts.completed += 1
  watchFolder.updated_at = new Date().toISOString()
  
  logTrace('WATCH_FOLDER_JOB_COMPLETED', watchFolderId, { 
    jobId,
    counts: watchFolder.counts
  })
  
  if (mainWindow) {
    notifyStateChange(mainWindow)
  }
}

/**
 * Record a job failure from this watch folder
 * PHASE 6.5: Increments failed count (sticky - does not auto-clear)
 */
export function recordJobFailed(watchFolderId: string, jobId: string, error: string, mainWindow: BrowserWindow | null = null): void {
  const watchFolder = watchFoldersState.get(watchFolderId)
  if (!watchFolder) return
  
  watchFolder.counts.failed += 1
  watchFolder.updated_at = new Date().toISOString()
  
  logTrace('WATCH_FOLDER_JOB_FAILED', watchFolderId, { 
    jobId,
    error,
    counts: watchFolder.counts
  })
  
  if (mainWindow) {
    notifyStateChange(mainWindow)
  }
}

/**
 * Reset counts for a watch folder (manual reset action)
 */
export function resetWatchFolderCounts(watchFolderId: string, mainWindow: BrowserWindow | null = null): boolean {
  const watchFolder = watchFoldersState.get(watchFolderId)
  if (!watchFolder) return false
  
  // Reset all counts except staged (which reflects current pending files)
  watchFolder.counts.detected = watchFolder.pending_files.length
  watchFolder.counts.jobs_created = 0
  watchFolder.counts.completed = 0
  watchFolder.counts.failed = 0
  watchFolder.updated_at = new Date().toISOString()
  
  logTrace('WATCH_FOLDER_COUNTS_UPDATED', watchFolderId, { 
    action: 'reset',
    counts: watchFolder.counts
  })
  
  if (mainWindow) {
    notifyStateChange(mainWindow)
  }
  
  return true
}
