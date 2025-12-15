import { contextBridge } from 'electron'

contextBridge.exposeInMainWorld('electron', {
  // Future IPC handlers will go here
})
