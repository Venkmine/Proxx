import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function createWindow() {
  const preloadPath = path.join(__dirname, 'preload.mjs');
  
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    titleBarStyle: 'hidden',
    trafficLightPosition: { x: 12, y: 12 },
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    win.loadURL(process.env.VITE_DEV_SERVER_URL);
    win.webContents.openDevTools();
  } else {
    win.loadFile(path.join(__dirname, '../dist/index.html'));
  }
  
  // Log when page finishes loading and verify IPC is working
  win.webContents.on('did-finish-load', () => {
    console.log('✓ Renderer loaded successfully');
    setTimeout(() => {
      win.webContents.executeJavaScript('typeof window.electron !== "undefined"')
        .then((exists) => {
          if (exists) {
            console.log('✓ window.electron is available - IPC is working');
          } else {
            console.error('✗ window.electron is undefined - IPC failed');
          }
        })
        .catch((err) => console.error('Error checking window.electron:', err));
    }, 100);
  });
  
  return win;
}

// Phase 15: IPC handlers for file/folder dialogs and shell operations
function setupIpcHandlers() {
  ipcMain.handle('dialog:openFiles', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile', 'multiSelections'],
      filters: [
        { name: 'Media Files', extensions: ['mov', 'mxf', 'mp4', 'avi', 'mkv'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    });
    return result.filePaths;
  });
  ipcMain.handle('dialog:openFolder', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory']
    });
    return result.filePaths[0] || null;
  });
  ipcMain.handle('shell:showItemInFolder', async (_event, filePath) => {
    shell.showItemInFolder(filePath);
  });
}

app.whenReady().then(() => {
  setupIpcHandlers();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
