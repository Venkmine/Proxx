import { app, BrowserWindow, ipcMain, dialog, shell, Menu } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import os from 'node:os';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Logging to ~/Library/Logs/Awaire Proxy/
const LOG_DIR = path.join(os.homedir(), 'Library', 'Logs', 'Awaire Proxy');

function ensureLogDir() {
  try {
    if (!fs.existsSync(LOG_DIR)) {
      fs.mkdirSync(LOG_DIR, { recursive: true });
    }
  } catch (err) {
    console.error('Failed to create log directory:', err);
  }
}

function writeLog(level: 'INFO' | 'ERROR' | 'WARN', message: string) {
  ensureLogDir();
  const timestamp = new Date().toISOString();
  const logLine = `[${timestamp}] [${level}] ${message}\n`;
  const logFile = path.join(LOG_DIR, `awaire-proxy-${new Date().toISOString().slice(0, 10)}.log`);
  
  try {
    fs.appendFileSync(logFile, logLine);
  } catch (err) {
    console.error('Failed to write log:', err);
  }
  
  if (level === 'ERROR') {
    console.error(message);
  } else {
    console.log(message);
  }
}

// Phase 20: Error fallback HTML for white screen prevention
function getErrorHtml(errorTitle: string, errorDetails: string): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Awaire Proxy - Error</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      background: #0a0a0a;
      color: #e4e4e7;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      padding: 40px;
      -webkit-app-region: drag;
    }
    .error-container {
      max-width: 600px;
      text-align: center;
    }
    .error-icon {
      font-size: 64px;
      margin-bottom: 24px;
      opacity: 0.6;
    }
    h1 {
      font-size: 24px;
      font-weight: 600;
      margin-bottom: 16px;
      color: #f87171;
    }
    p {
      font-size: 14px;
      line-height: 1.6;
      color: #a1a1aa;
      margin-bottom: 24px;
    }
    .details {
      background: rgba(255, 255, 255, 0.05);
      border-radius: 8px;
      padding: 16px;
      font-family: 'SF Mono', Monaco, monospace;
      font-size: 12px;
      text-align: left;
      white-space: pre-wrap;
      word-break: break-all;
      color: #71717a;
      margin-bottom: 24px;
    }
    .actions {
      -webkit-app-region: no-drag;
    }
    button {
      background: #27272a;
      color: #e4e4e7;
      border: 1px solid #3f3f46;
      padding: 12px 24px;
      border-radius: 6px;
      font-size: 14px;
      cursor: pointer;
      margin: 0 8px;
    }
    button:hover {
      background: #3f3f46;
    }
    .log-path {
      font-size: 11px;
      color: #52525b;
      margin-top: 24px;
    }
  </style>
</head>
<body>
  <div class="error-container">
    <div class="error-icon">⚠️</div>
    <h1>${errorTitle}</h1>
    <p>Awaire Proxy encountered an error and couldn't load properly. This may be a temporary issue.</p>
    <div class="details">${errorDetails}</div>
    <div class="actions">
      <button onclick="window.location.reload()">Retry</button>
      <button onclick="require('electron').ipcRenderer.send('app:quit')">Quit</button>
    </div>
    <p class="log-path">Logs: ~/Library/Logs/Awaire Proxy/</p>
  </div>
  <script>
    const { ipcRenderer } = require('electron');
    document.querySelector('button:last-child').onclick = () => ipcRenderer.send('app:quit');
  </script>
</body>
</html>`;
}

// BOOT DIAGNOSTICS: Catch uncaught errors in main process
process.on('uncaughtException', (error) => {
  writeLog('ERROR', `UNCAUGHT EXCEPTION IN MAIN PROCESS: ${error.stack || error.message}`);
});

process.on('unhandledRejection', (reason) => {
  writeLog('ERROR', `UNHANDLED REJECTION IN MAIN PROCESS: ${reason}`);
});

async function loadDevWithRetries(win: BrowserWindow, url: string, retries = 12, delayMs = 800) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      console.log(`Attempt ${attempt}/${retries} to load ${url}`);
      await win.loadURL(url);
      console.log('✓ loadURL succeeded');
      return;
    } catch (err) {
      console.error(`loadURL failed (attempt ${attempt}/${retries}):`, err);
      if (attempt === retries) throw err;
      // Exponential backoff: increase delay for each retry
      const backoffDelay = delayMs * Math.min(attempt, 3);
      console.log(`⏳ Waiting ${backoffDelay}ms before retry...`);
      await new Promise((resolve) => setTimeout(resolve, backoffDelay));
    }
  }
}

async function createWindow() {
  const preloadPath = path.join(__dirname, 'preload.mjs');
  
  writeLog('INFO', '═══════════════════════════════════════');
  writeLog('INFO', 'AWAIRE PROXY BOOT');
  writeLog('INFO', '═══════════════════════════════════════');
  writeLog('INFO', `__dirname: ${__dirname}`);
  writeLog('INFO', `Preload path: ${preloadPath}`);
  writeLog('INFO', `VITE_DEV_SERVER_URL: ${process.env.VITE_DEV_SERVER_URL || '(not set)'}`);
  writeLog('INFO', `Platform: ${process.platform}, Arch: ${process.arch}`);
  
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

  // Phase 20: Show error fallback UI instead of white screen on load failures
  win.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
    const errorMsg = `Load failed: ${errorDescription} (code: ${errorCode}) URL: ${validatedURL}`;
    writeLog('ERROR', `RENDERER FAILED TO LOAD: ${errorMsg}`);
    
    // Show fallback error page instead of white screen
    win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(
      getErrorHtml('Failed to Load', `Error ${errorCode}: ${errorDescription}\\n\\nURL: ${validatedURL}`)
    )}`);
  });

  // BOOT DIAGNOSTICS: Log what we're attempting to load
  if (process.env.VITE_DEV_SERVER_URL) {
    const devUrl = process.env.VITE_DEV_SERVER_URL.replace('localhost', '127.0.0.1');
    writeLog('INFO', `Loading dev server: ${devUrl}`);

    try {
      await loadDevWithRetries(win, devUrl);
    } catch (err) {
      const errorMsg = `Failed to connect to dev server after retries: ${err}`;
      writeLog('ERROR', errorMsg);
      
      // Show fallback error page instead of white screen
      win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(
        getErrorHtml('Dev Server Unavailable', `Could not connect to Vite dev server at ${devUrl}\\n\\nMake sure the dev server is running:\\n  pnpm dev`)
      )}`);
    }

    win.webContents.openDevTools({ mode: 'detach' });
  } else {
    const prodPath = path.join(__dirname, '../dist/index.html');
    writeLog('INFO', `Loading production build: ${prodPath}`);
    
    try {
      await win.loadFile(prodPath);
    } catch (err) {
      const errorMsg = `Failed to load production build: ${err}`;
      writeLog('ERROR', errorMsg);
      
      // Show fallback error page
      win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(
        getErrorHtml('Failed to Load', `Could not load application from:\\n${prodPath}`)
      )}`);
    }
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

  // Forward renderer console messages to main process logs for diagnostics
  win.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    console.log(`Renderer console [level=${level}] ${sourceId}:${line} - ${message}`);
  });

  // Phase 20: Detect renderer crashes / hangs and show fallback UI
  win.webContents.on('render-process-gone', (_event, details) => {
    const errorMsg = `Renderer process crashed: reason=${details.reason}, exitCode=${details.exitCode}`;
    writeLog('ERROR', errorMsg);
    
    // Show fallback error page
    win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(
      getErrorHtml('Renderer Crashed', `Reason: ${details.reason}\\nExit code: ${details.exitCode}`)
    )}`);
  });
  
  win.on('unresponsive', () => {
    writeLog('WARN', 'Window became unresponsive');
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
  
  // Phase 20: Quit handler for error fallback page
  ipcMain.on('app:quit', () => {
    app.quit();
  });
}

// Phase 20: Application menu with Preferences, About, Undo/Redo
function setupApplicationMenu() {
  const isMac = process.platform === 'darwin'
  
  const template: Electron.MenuItemConstructorOptions[] = [
    // App menu (macOS only)
    ...(isMac ? [{
      label: 'Awaire Proxy',
      submenu: [
        { role: 'about' as const, label: 'About Awaire Proxy' },
        { type: 'separator' as const },
        {
          label: 'Preferences...',
          accelerator: 'CmdOrCtrl+,',
          click: () => {
            // TODO: Open preferences window
            const win = BrowserWindow.getFocusedWindow()
            if (win) {
              win.webContents.send('menu:preferences')
            }
          }
        },
        { type: 'separator' as const },
        { role: 'services' as const },
        { type: 'separator' as const },
        { role: 'hide' as const },
        { role: 'hideOthers' as const },
        { role: 'unhide' as const },
        { type: 'separator' as const },
        { role: 'quit' as const },
      ]
    }] : []),
    
    // File menu
    {
      label: 'File',
      submenu: [
        {
          label: 'Add Files...',
          accelerator: 'CmdOrCtrl+O',
          click: async () => {
            const result = await dialog.showOpenDialog({
              properties: ['openFile', 'multiSelections'],
              filters: [
                { name: 'Media Files', extensions: ['mov', 'mxf', 'mp4', 'avi', 'mkv'] },
                { name: 'All Files', extensions: ['*'] }
              ]
            })
            if (result.filePaths.length > 0) {
              const win = BrowserWindow.getFocusedWindow()
              if (win) {
                win.webContents.send('menu:addFiles', result.filePaths)
              }
            }
          }
        },
        {
          label: 'Set Output Folder...',
          accelerator: 'CmdOrCtrl+Shift+O',
          click: async () => {
            const result = await dialog.showOpenDialog({
              properties: ['openDirectory']
            })
            if (result.filePaths[0]) {
              const win = BrowserWindow.getFocusedWindow()
              if (win) {
                win.webContents.send('menu:setOutputFolder', result.filePaths[0])
              }
            }
          }
        },
        { type: 'separator' },
        isMac ? { role: 'close' } : { role: 'quit' }
      ]
    },
    
    // Edit menu with Undo/Redo
    {
      label: 'Edit',
      submenu: [
        {
          label: 'Undo',
          accelerator: 'CmdOrCtrl+Z',
          click: () => {
            const win = BrowserWindow.getFocusedWindow()
            if (win) {
              win.webContents.send('menu:undo')
            }
          }
        },
        {
          label: 'Redo',
          accelerator: 'CmdOrCtrl+Shift+Z',
          click: () => {
            const win = BrowserWindow.getFocusedWindow()
            if (win) {
              win.webContents.send('menu:redo')
            }
          }
        },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        ...(isMac ? [
          { role: 'pasteAndMatchStyle' as const },
          { role: 'delete' as const },
          { role: 'selectAll' as const },
        ] : [
          { role: 'delete' as const },
          { type: 'separator' as const },
          { role: 'selectAll' as const },
        ])
      ]
    },
    
    // View menu
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
        { type: 'separator' },
        {
          label: 'Toggle Theme',
          accelerator: 'CmdOrCtrl+Shift+T',
          click: () => {
            const win = BrowserWindow.getFocusedWindow()
            if (win) {
              win.webContents.send('menu:toggleTheme')
            }
          }
        }
      ]
    },
    
    // Window menu
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        ...(isMac ? [
          { type: 'separator' as const },
          { role: 'front' as const },
          { type: 'separator' as const },
          { role: 'window' as const }
        ] : [
          { role: 'close' as const }
        ])
      ]
    },
    
    // Help menu
    {
      role: 'help',
      submenu: [
        {
          label: 'Awaire Proxy Documentation',
          click: async () => {
            await shell.openExternal('https://github.com/Venkmine/Proxx')
          }
        }
      ]
    }
  ]
  
  const menu = Menu.buildFromTemplate(template)
  Menu.setApplicationMenu(menu)
}

app.whenReady().then(async () => {
  setupApplicationMenu()  // Phase 20: Set up menu before window
  setupIpcHandlers();
  await createWindow();
  app.on('activate', async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      await createWindow();
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
