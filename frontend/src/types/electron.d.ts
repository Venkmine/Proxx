/**
 * Global type definitions for Electron IPC APIs
 */

declare global {
  interface Window {
    electron?: {
      openFiles: () => Promise<string[]>
      openFolder: () => Promise<string | null>
      openFilesOrFolders: () => Promise<string[]>
      showItemInFolder: (filePath: string) => Promise<void>
      isAuditMode: () => boolean
    }
  }
}

export {}
