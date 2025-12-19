import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// BOOT DIAGNOSTICS: Catch uncaught errors in main process
process.on('uncaughtException', (error) => {
    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.error('UNCAUGHT EXCEPTION IN MAIN PROCESS');
    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.error(error);
});
process.on('unhandledRejection', (reason) => {
    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.error('UNHANDLED REJECTION IN MAIN PROCESS');
    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.error(reason);
});
async function loadDevWithRetries(win, url, retries = 12, delayMs = 500) {
    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            console.log(`Attempt ${attempt}/${retries} to load ${url}`);
            await win.loadURL(url);
            console.log('✓ loadURL succeeded');
            return;
        }
        catch (err) {
            console.error(`loadURL failed (attempt ${attempt}/${retries}):`, err);
            if (attempt === retries)
                throw err;
            await new Promise((resolve) => setTimeout(resolve, delayMs));
        }
    }
}
async function createWindow() {
    const preloadPath = path.join(__dirname, 'preload.mjs');
    // BOOT DIAGNOSTICS: Log preload path resolution
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('ELECTRON BOOT DIAGNOSTICS');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('__dirname:', __dirname);
    console.log('Preload path:', preloadPath);
    console.log('VITE_DEV_SERVER_URL:', process.env.VITE_DEV_SERVER_URL || '(not set)');
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
    // BOOT DIAGNOSTICS: Catch all load failures
    win.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
        console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.error('RENDERER FAILED TO LOAD');
        console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.error('Error code:', errorCode);
        console.error('Description:', errorDescription);
        console.error('URL:', validatedURL);
    });
    // BOOT DIAGNOSTICS: Log what we're attempting to load
    if (process.env.VITE_DEV_SERVER_URL) {
        const devUrl = process.env.VITE_DEV_SERVER_URL.replace('localhost', '127.0.0.1');
        console.log('━━━ LOADING:', devUrl);
        try {
            await loadDevWithRetries(win, devUrl);
        }
        catch (err) {
            console.error('━━━ loadURL() failed after retries:', err);
        }
        win.webContents.openDevTools({ mode: 'detach' });
    }
    else {
        const prodPath = path.join(__dirname, '../dist/index.html');
        console.log('━━━ LOADING PROD:', prodPath);
        win.loadFile(prodPath);
    }
    // Log when page finishes loading and verify IPC is working
    win.webContents.on('did-finish-load', () => {
        console.log('✓ Renderer loaded successfully');
        setTimeout(() => {
            win.webContents.executeJavaScript('typeof window.electron !== "undefined"')
                .then((exists) => {
                if (exists) {
                    console.log('✓ window.electron is available - IPC is working');
                }
                else {
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
    // Detect renderer crashes / hangs
    win.webContents.on('render-process-gone', (_event, details) => {
        console.error('✗ Renderer process has gone (render-process-gone):', details);
    });
    win.on('unresponsive', () => {
        console.error('✗ Window is unresponsive');
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
app.whenReady().then(async () => {
    setupIpcHandlers();
    await createWindow();
    app.on('activate', async () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            await createWindow();
        }
    });
});
app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});
