import { contextBridge, ipcRenderer } from 'electron';
// Expose Electron IPC APIs to the renderer process
contextBridge.exposeInMainWorld('electron', {
    openFiles: () => ipcRenderer.invoke('dialog:openFiles'),
    openFolder: () => ipcRenderer.invoke('dialog:openFolder'),
    showItemInFolder: (filePath) => ipcRenderer.invoke('shell:showItemInFolder', filePath)
});
