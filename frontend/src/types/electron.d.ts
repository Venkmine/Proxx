/**
 * Global type definitions for Electron IPC APIs
 */

import type { WatchFolder, WatchFolderConfig, PendingFile, ArmBlockReason } from './watchFolders'
import type { Preset, DeliverSettings } from './presets'

declare global {
  interface Window {
    electron?: {
      openFiles: () => Promise<string[]>
      openFolder: () => Promise<string | null>
      openFilesOrFolders: () => Promise<string[]>
      showItemInFolder: (filePath: string) => Promise<void>
      isAuditMode: () => boolean
      
      // Watch Folders V2: Detection automatic, execution manual
      watchFolder: {
        getAll: () => Promise<WatchFolder[]>
        add: (config: WatchFolderConfig) => Promise<WatchFolder>
        enable: (id: string) => Promise<boolean>
        disable: (id: string) => Promise<boolean>
        remove: (id: string) => Promise<boolean>
        update: (id: string, updates: Partial<WatchFolderConfig>) => Promise<WatchFolder | null>
        toggleFile: (watchFolderId: string, filePath: string) => Promise<boolean>
        selectAll: (watchFolderId: string, selected: boolean) => Promise<boolean>
        clearPending: (watchFolderId: string, filePaths: string[]) => Promise<boolean>
        logJobsCreated: (watchFolderId: string, jobIds: string[]) => Promise<boolean>
        // PHASE 7: Armed watch folder operations
        arm: (id: string) => Promise<{ success: boolean; blockReasons?: ArmBlockReason[] }>
        disarm: (id: string) => Promise<boolean>
        validateArm: (id: string) => Promise<{ canArm: boolean; blockReasons: ArmBlockReason[] }>
        onStateChanged: (callback: (data: { watchFolders: WatchFolder[] }) => void) => void
        onFileDetected: (callback: (data: { watchFolderId: string; file: PendingFile }) => void) => void
        onError: (callback: (data: { watchFolderId: string; error: string }) => void) => void
      }
      
      // Preset Persistence: Durable storage in userData
      preset: {
        getAll: () => Promise<Preset[]>
        get: (id: string) => Promise<Preset | null>
        create: (name: string, settings: DeliverSettings, description?: string) => Promise<Preset>
        update: (id: string, updates: Partial<Pick<Preset, 'name' | 'description' | 'settings'>>) => Promise<Preset>
        delete: (id: string) => Promise<boolean>
        duplicate: (id: string, newName: string) => Promise<Preset>
        resetDefaults: () => Promise<Preset[]>
        getStoragePath: () => Promise<string>
      }
    }
  }
}

export {}
