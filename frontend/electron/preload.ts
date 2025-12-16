import { contextBridge, ipcRenderer } from 'electron'

// Phase 15: Expose file/folder dialogs and shell operations to renderer
contextBridge.exposeInMainWorld('electron', {
  // File picker - returns array of file paths
  openFiles: (): Promise<string[]> => ipcRenderer.invoke('dialog:openFiles'),
  
  // Folder picker - returns single folder path or null
  openFolder: (): Promise<string | null> => ipcRenderer.invoke('dialog:openFolder'),
  
  // Reveal file/folder in system file manager
  showItemInFolder: (filePath: string): Promise<void> => ipcRenderer.invoke('shell:showItemInFolder', filePath)
})

// Type declaration for TypeScript
declare global {
  interface Window {
    electron: {
      openFiles: () => Promise<string[]>
      openFolder: () => Promise<string | null>
      showItemInFolder: (filePath: string) => Promise<void>
    }
  }
}
