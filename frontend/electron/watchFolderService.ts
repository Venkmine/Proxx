/**
 * Watch Folder Service — Recursive File Monitoring (Electron Main Process)
 * 
 * ⚠️ RUNS IN ELECTRON MAIN PROCESS ONLY
 * 
 * Monitors watch folders recursively using chokidar and notifies renderer
 * when new eligible files are detected. Does NOT enqueue jobs - that's the
 * renderer's responsibility via IPC.
 * 
 * CRITICAL RULES:
 * - ✅ Recursive: Watches entire directory tree
 * - ❌ No startup storm: ignoreInitial: true (existing files ignored)
 * - ✅ Debouncing: 2-second stabilization before triggering
 * - ✅ File size validation: Must be stable (not growing)
 * - ❌ No temp files: .tmp, .part, .download, dotfiles excluded
 * - ❌ No execution: Only notifies renderer via IPC
 * 
 * ARCHITECTURE:
 * Main process (this file) ← chokidar file events
 *         ↓ IPC
 * Renderer process ← file notification
 *         ↓
 * Eligibility check → JobSpec → Queue → Execution
 */

import { BrowserWindow } from 'electron'
import chokidar, { type FSWatcher } from 'chokidar'
import fs from 'node:fs'
import path from 'node:path'

export interface WatchFolderConfig {
  id: string
  path: string
  enabled: boolean
  include_extensions?: string[]
  exclude_patterns?: string[]
}

interface WatcherState {
  watcher: FSWatcher | null
  config: WatchFolderConfig
}

const watchers = new Map<string, WatcherState>()

// Default supported media extensions
const DEFAULT_EXTENSIONS = [
  'mov', 'mp4', 'mxf', 'avi', 'mkv', 'webm',
  'braw', 'r3d', 'R3D', 'ari', 'arri', 'dng',
  'cri', 'crm', 'cine',
]

// Temp/system files to always ignore
const ALWAYS_IGNORE = [
  /^\./,                    // Dotfiles
  /\.tmp$/i,                // Temp files
  /\.part$/i,               // Partial downloads
  /\.download$/i,           // Download files
  /\.crdownload$/i,         // Chrome downloads
  /~$/,                     // Editor backups
  /\.DS_Store$/,            // macOS metadata
  /Thumbs\.db$/i,           // Windows thumbnails
]

function shouldIgnoreFile(filePath: string): boolean {
  const basename = path.basename(filePath)
  return ALWAYS_IGNORE.some((pattern) => pattern.test(basename))
}

function matchesExtension(filePath: string, extensions: string[]): boolean {
  const ext = path.extname(filePath).slice(1).toLowerCase()
  return extensions.some((allowed) => allowed.toLowerCase() === ext)
}

function matchesExcludePattern(filePath: string, patterns: string[]): boolean {
  return patterns.some((pattern) => {
    // Support both regex and glob-style patterns
    if (pattern.startsWith('/') && pattern.endsWith('/')) {
      // Regex pattern
      const regex = new RegExp(pattern.slice(1, -1))
      return regex.test(filePath)
    } else {
      // Simple substring match
      return filePath.includes(pattern)
    }
  })
}

async function isFileStable(filePath: string): Promise<boolean> {
  try {
    const stats1 = fs.statSync(filePath)
    const size1 = stats1.size
    
    // Wait 500ms and check again
    await new Promise((resolve) => setTimeout(resolve, 500))
    
    const stats2 = fs.statSync(filePath)
    const size2 = stats2.size
    
    // File is stable if size hasn't changed
    return size1 === size2
  } catch (err) {
    console.error('[WatchService] Error checking file stability:', err)
    return false
  }
}

export function startWatchFolder(
  config: WatchFolderConfig,
  mainWindow: BrowserWindow,
): void {
  if (!config.enabled) {
    console.log('[WatchService] Not starting disabled watch folder:', config.id)
    return
  }

  // Stop existing watcher if any
  stopWatchFolder(config.id)

  const allowedExtensions = config.include_extensions || DEFAULT_EXTENSIONS
  const excludePatterns = config.exclude_patterns || []

  console.log('[WatchService] Starting watch folder:', config.id, config.path)
  console.log('[WatchService]   Extensions:', allowedExtensions)
  console.log('[WatchService]   Exclude patterns:', excludePatterns)

  // Create chokidar watcher with recursive support
  const watcher = chokidar.watch(config.path, {
    // CRITICAL: ignoreInitial prevents startup storm
    ignoreInitial: true,
    // Recursive by default in chokidar
    persistent: true,
    // Aggressive debouncing
    awaitWriteFinish: {
      stabilityThreshold: 2000,  // 2 second stability
      pollInterval: 100,          // Check every 100ms
    },
    // Ignore system files
    ignored: (filePath: string) => {
      return shouldIgnoreFile(filePath)
    },
  })

  watcher.on('add', async (filePath: string) => {
    console.log('[WatchService] File detected:', filePath)

    // Check extension
    if (!matchesExtension(filePath, allowedExtensions)) {
      console.log('[WatchService] Rejected: extension not allowed')
      mainWindow.webContents.send('watch-folder:file-rejected', {
        watch_folder_id: config.id,
        file_path: filePath,
        reason: 'Extension not in allowlist',
      })
      return
    }

    // Check exclude patterns
    if (matchesExcludePattern(filePath, excludePatterns)) {
      console.log('[WatchService] Rejected: matches exclude pattern')
      mainWindow.webContents.send('watch-folder:file-rejected', {
        watch_folder_id: config.id,
        file_path: filePath,
        reason: 'Matches exclude pattern',
      })
      return
    }

    // Final stability check (chokidar awaitWriteFinish might not be enough)
    const isStable = await isFileStable(filePath)
    if (!isStable) {
      console.log('[WatchService] Rejected: file still growing')
      mainWindow.webContents.send('watch-folder:file-rejected', {
        watch_folder_id: config.id,
        file_path: filePath,
        reason: 'File size still changing',
      })
      return
    }

    // File is eligible - notify renderer
    console.log('[WatchService] File eligible:', filePath)
    mainWindow.webContents.send('watch-folder:file-detected', {
      watch_folder_id: config.id,
      file_path: filePath,
    })
  })

  watcher.on('error', (error: unknown) => {
    console.error('[WatchService] Watcher error:', error)
    mainWindow.webContents.send('watch-folder:error', {
      watch_folder_id: config.id,
      error: error instanceof Error ? error.message : String(error),
    })
  })

  watchers.set(config.id, { watcher, config })
  console.log('[WatchService] Watch folder started:', config.id)
}

export function stopWatchFolder(id: string): void {
  const state = watchers.get(id)
  if (state) {
    console.log('[WatchService] Stopping watch folder:', id)
    state.watcher?.close()
    watchers.delete(id)
  }
}

export function stopAllWatchers(): void {
  console.log('[WatchService] Stopping all watchers')
  for (const [id, state] of watchers.entries()) {
    state.watcher?.close()
  }
  watchers.clear()
}

export function getActiveWatchers(): string[] {
  return Array.from(watchers.keys())
}
