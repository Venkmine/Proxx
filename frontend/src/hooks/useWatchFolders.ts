/**
 * useWatchFolders — Watch Folder Registry & Persistence
 * 
 * Manages watch folder configuration with localStorage persistence.
 * Does NOT implement file watching - that's handled by the watcher service.
 * 
 * RESPONSIBILITIES:
 * - CRUD operations for watch folders
 * - Persistence to localStorage
 * - Processed file tracking (duplicate prevention)
 * - Event history
 * 
 * NON-RESPONSIBILITIES:
 * - File watching (delegated to watcher service)
 * - JobSpec building (delegated to buildJobSpec)
 * - Job execution (delegated to existing queue)
 */

import { useState, useEffect, useCallback } from 'react'
import type { WatchFolder, WatchFolderRegistry, WatchFolderEvent } from '../types/watchFolders'

const STORAGE_KEY = 'proxx_watch_folders_v1'
const EVENTS_KEY = 'proxx_watch_folder_events_v1'
const MAX_EVENTS = 1000

function generateId(): string {
  return Math.random().toString(36).substring(2, 10)
}

function loadRegistry(): WatchFolderRegistry {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      const parsed = JSON.parse(stored)
      return {
        folders: parsed.folders || {},
        processed_files: parsed.processed_files || {},
      }
    }
  } catch (err) {
    console.error('[WatchFolders] Failed to load registry:', err)
  }
  return { folders: {}, processed_files: {} }
}

function saveRegistry(registry: WatchFolderRegistry): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(registry))
  } catch (err) {
    console.error('[WatchFolders] Failed to save registry:', err)
  }
}

function loadEvents(): WatchFolderEvent[] {
  try {
    const stored = localStorage.getItem(EVENTS_KEY)
    if (stored) {
      return JSON.parse(stored)
    }
  } catch (err) {
    console.error('[WatchFolders] Failed to load events:', err)
  }
  return []
}

function saveEvents(events: WatchFolderEvent[]): void {
  try {
    // Keep only most recent MAX_EVENTS
    const trimmed = events.slice(-MAX_EVENTS)
    localStorage.setItem(EVENTS_KEY, JSON.stringify(trimmed))
  } catch (err) {
    console.error('[WatchFolders] Failed to save events:', err)
  }
}

export interface UseWatchFoldersReturn {
  /** All watch folders */
  watchFolders: WatchFolder[]
  /** Recent events */
  events: WatchFolderEvent[]
  /** Add new watch folder */
  addWatchFolder: (config: Omit<WatchFolder, 'id'>) => string
  /** Remove watch folder */
  removeWatchFolder: (id: string) => void
  /** Enable watch folder */
  enableWatchFolder: (id: string) => void
  /** Disable watch folder */
  disableWatchFolder: (id: string) => void
  /** Update watch folder configuration */
  updateWatchFolder: (id: string, updates: Partial<Omit<WatchFolder, 'id'>>) => void
  /** Check if file has been processed */
  isFileProcessed: (path: string) => boolean
  /** Mark file as processed */
  markFileProcessed: (path: string, mtime: number, hash?: string) => void
  /** Log event */
  logEvent: (event: Omit<WatchFolderEvent, 'timestamp'>) => void
  /** Clear all events */
  clearEvents: () => void
  /** Clear processed files registry */
  clearProcessedFiles: () => void
}

export function useWatchFolders(): UseWatchFoldersReturn {
  const [registry, setRegistry] = useState<WatchFolderRegistry>(loadRegistry)
  const [events, setEvents] = useState<WatchFolderEvent[]>(loadEvents)

  // Persist registry changes
  useEffect(() => {
    saveRegistry(registry)
  }, [registry])

  // Persist events changes
  useEffect(() => {
    saveEvents(events)
  }, [events])

  const addWatchFolder = useCallback((config: Omit<WatchFolder, 'id'>): string => {
    const id = generateId()
    const newFolder: WatchFolder = {
      ...config,
      id,
      recursive: true, // Always true for V1
    }
    
    setRegistry((prev) => ({
      ...prev,
      folders: {
        ...prev.folders,
        [id]: newFolder,
      },
    }))
    
    console.log('[WatchFolders] Added watch folder:', id, newFolder.path)
    return id
  }, [])

  const removeWatchFolder = useCallback((id: string) => {
    setRegistry((prev) => {
      const { [id]: removed, ...remainingFolders } = prev.folders
      return {
        ...prev,
        folders: remainingFolders,
      }
    })
    console.log('[WatchFolders] Removed watch folder:', id)
  }, [])

  const enableWatchFolder = useCallback((id: string) => {
    setRegistry((prev) => {
      const folder = prev.folders[id]
      if (!folder) {
        console.warn('[WatchFolders] Cannot enable non-existent folder:', id)
        return prev
      }
      return {
        ...prev,
        folders: {
          ...prev.folders,
          [id]: { ...folder, enabled: true },
        },
      }
    })
    console.log('[WatchFolders] Enabled watch folder:', id)
  }, [])

  const disableWatchFolder = useCallback((id: string) => {
    setRegistry((prev) => {
      const folder = prev.folders[id]
      if (!folder) {
        console.warn('[WatchFolders] Cannot disable non-existent folder:', id)
        return prev
      }
      return {
        ...prev,
        folders: {
          ...prev.folders,
          [id]: { ...folder, enabled: false },
        },
      }
    })
    console.log('[WatchFolders] Disabled watch folder:', id)
  }, [])

  const updateWatchFolder = useCallback((id: string, updates: Partial<Omit<WatchFolder, 'id'>>) => {
    setRegistry((prev) => {
      const folder = prev.folders[id]
      if (!folder) {
        console.warn('[WatchFolders] Cannot update non-existent folder:', id)
        return prev
      }
      return {
        ...prev,
        folders: {
          ...prev.folders,
          [id]: { ...folder, ...updates, id, recursive: true }, // Always preserve recursive: true
        },
      }
    })
    console.log('[WatchFolders] Updated watch folder:', id, updates)
  }, [])

  const isFileProcessed = useCallback((path: string): boolean => {
    return path in registry.processed_files
  }, [registry.processed_files])

  const markFileProcessed = useCallback((path: string, mtime: number, hash?: string) => {
    setRegistry((prev) => ({
      ...prev,
      processed_files: {
        ...prev.processed_files,
        [path]: { mtime, hash },
      },
    }))
  }, [])

  const logEvent = useCallback((event: Omit<WatchFolderEvent, 'timestamp'>) => {
    const fullEvent: WatchFolderEvent = {
      ...event,
      timestamp: new Date().toISOString(),
    }
    setEvents((prev) => [...prev, fullEvent])
    
    if (!event.eligible && event.rejection_reason) {
      console.log('[WatchFolders] File rejected:', event.file_path, event.rejection_reason)
    } else if (event.job_id) {
      console.log('[WatchFolders] Job created:', event.job_id, 'for', event.file_path)
    }
  }, [])

  const clearEvents = useCallback(() => {
    setEvents([])
    console.log('[WatchFolders] Cleared event history')
  }, [])

  const clearProcessedFiles = useCallback(() => {
    setRegistry((prev) => ({
      ...prev,
      processed_files: {},
    }))
    console.log('[WatchFolders] Cleared processed files registry')
  }, [])

  const watchFolders = Object.values(registry.folders)

  return {
    watchFolders,
    events,
    addWatchFolder,
    removeWatchFolder,
    enableWatchFolder,
    disableWatchFolder,
    updateWatchFolder,
    isFileProcessed,
    markFileProcessed,
    logEvent,
    clearEvents,
    clearProcessedFiles,
  }
}
