import { contextBridge, ipcRenderer } from 'electron';
/**
 * Electron Preload - Exposes safe IPC APIs to the renderer process.
 *
 * INC-003: Added openFilesOrFolders for combined file+folder selection.
 *
 * Why separate methods instead of one universal dialog?
 * - openFiles: For selecting media files only (legacy, backwards compat)
 * - openFolder: For selecting a single folder (legacy, backwards compat)
 * - openFilesOrFolders: For selecting files AND/OR folders together (v1.1+)
 *
 * All methods trigger native OS dialogs. No auto-scanning or enumeration
 * occurs on selection — the frontend handles preflight after receiving paths.
 */
contextBridge.exposeInMainWorld('electron', {
    // Legacy: Select files only
    openFiles: () => ipcRenderer.invoke('dialog:openFiles'),
    // Legacy: Select a single folder
    openFolder: () => ipcRenderer.invoke('dialog:openFolder'),
    // INC-003: Select files AND/OR folders (combined selection)
    // Returns array of paths (files or directories). Does NOT auto-expand directories.
    openFilesOrFolders: () => ipcRenderer.invoke('dialog:openFilesOrFolders'),
    // Shell operations
    showItemInFolder: (filePath) => ipcRenderer.invoke('shell:showItemInFolder', filePath)
});
