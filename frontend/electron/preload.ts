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

// Preload receives flags via additionalArguments in webPreferences
// These are accessible via process.argv even in sandboxed context
const e2eTestArg = process.argv.find((arg) => arg.startsWith('--e2e-test='))
const E2E_TEST = e2eTestArg?.split('=')[1] === '1'

const auditModeArg = process.argv.find((arg) =>
  arg.startsWith('--e2e-audit-mode='),
)
const E2E_AUDIT_MODE = auditModeArg?.split('=')[1] === '1'

const qcTestFileArg = process.argv.find((arg) =>
  arg.startsWith('--qc-test-file='),
)
const QC_TEST_FILE = qcTestFileArg?.split('=')[1]

// DEBUG: Always log to understand what's happening
console.log('[PRELOAD DEBUG] E2E_TEST:', E2E_TEST)
console.log('[PRELOAD DEBUG] QC_TEST_FILE:', QC_TEST_FILE)
console.log('[PRELOAD DEBUG] E2E_AUDIT_MODE:', E2E_AUDIT_MODE)
console.log('[PRELOAD DEBUG] process.argv:', process.argv)

// FORCE: Always expose SOMETHING to prove preload runs
// Also expose process.argv to debug what args are passed
contextBridge.exposeInMainWorld('__PRELOAD_RAN__', true)
contextBridge.exposeInMainWorld('__PRELOAD_ARGV__', process.argv)
// Expose E2E_TEST flag for splash screen skip logic
contextBridge.exposeInMainWorld('__E2E_TEST__', E2E_TEST)

if (E2E_TEST && QC_TEST_FILE) {
  console.log('[PRELOAD E2E] Installing dialog mocks BEFORE app render');
  console.log('[PRELOAD E2E] Test file:', QC_TEST_FILE);
  
  // Mock both dialog functions to return test file
  const mockOpenFiles = async () => {
    console.log('[PRELOAD E2E MOCK] openFiles() called, returning:', [QC_TEST_FILE]);
    return [QC_TEST_FILE];
  };
  
  const mockOpenFilesOrFolders = async () => {
    console.log('[PRELOAD E2E MOCK] openFilesOrFolders() called, returning:', [QC_TEST_FILE]);
    return [QC_TEST_FILE];
  };
  
  const mockOpenFolder = async () => {
    // Return the directory containing the test file (output directory for QC tests)
    const folderPath = '/tmp/qc_output';
    console.log('[PRELOAD E2E MOCK] openFolder() called, returning:', folderPath);
    return folderPath;
  };
  
  contextBridge.exposeInMainWorld('electron', {
    openFiles: mockOpenFiles,
    openFolder: mockOpenFolder,
    openFilesOrFolders: mockOpenFilesOrFolders,
    showItemInFolder: (filePath: string) => ipcRenderer.invoke('shell:showItemInFolder', filePath),
    isAuditMode: () => E2E_AUDIT_MODE,
    // Watch Folders V2 - MUST be exposed in E2E mode too
    watchFolder: {
      getAll: () => ipcRenderer.invoke('watch-folder:get-all'),
      add: (config: any) => ipcRenderer.invoke('watch-folder:add', config),
      enable: (id: string) => ipcRenderer.invoke('watch-folder:enable', id),
      disable: (id: string) => ipcRenderer.invoke('watch-folder:disable', id),
      remove: (id: string) => ipcRenderer.invoke('watch-folder:remove', id),
      update: (id: string, updates: any) => ipcRenderer.invoke('watch-folder:update', id, updates),
      toggleFile: (watchFolderId: string, filePath: string) => 
        ipcRenderer.invoke('watch-folder:toggle-file', watchFolderId, filePath),
      selectAll: (watchFolderId: string, selected: boolean) => 
        ipcRenderer.invoke('watch-folder:select-all', watchFolderId, selected),
      clearPending: (watchFolderId: string, filePaths: string[]) => 
        ipcRenderer.invoke('watch-folder:clear-pending', watchFolderId, filePaths),
      logJobsCreated: (watchFolderId: string, jobIds: string[]) => 
        ipcRenderer.invoke('watch-folder:log-jobs-created', watchFolderId, jobIds),
      // PHASE 7: Armed watch folder operations
      arm: (id: string) => ipcRenderer.invoke('watch-folder:arm', id),
      disarm: (id: string) => ipcRenderer.invoke('watch-folder:disarm', id),
      validateArm: (id: string) => ipcRenderer.invoke('watch-folder:validate-arm', id),
      onStateChanged: (callback: (data: any) => void) => {
        ipcRenderer.on('watch-folder:state-changed', (_event, data) => callback(data))
      },
      onFileDetected: (callback: (data: any) => void) => {
        ipcRenderer.on('watch-folder:file-detected', (_event, data) => callback(data))
      },
      onError: (callback: (data: any) => void) => {
        ipcRenderer.on('watch-folder:error', (_event, data) => callback(data))
      },
    },
    // Preset Persistence - Durable storage in userData
    preset: {
      getAll: () => ipcRenderer.invoke('preset:get-all'),
      get: (id: string) => ipcRenderer.invoke('preset:get', id),
      create: (name: string, settings: any, description?: string) =>
        ipcRenderer.invoke('preset:create', name, settings, description),
      update: (id: string, updates: any) => ipcRenderer.invoke('preset:update', id, updates),
      delete: (id: string) => ipcRenderer.invoke('preset:delete', id),
      duplicate: (id: string, newName: string) => ipcRenderer.invoke('preset:duplicate', id, newName),
      resetDefaults: () => ipcRenderer.invoke('preset:reset-defaults'),
      getStoragePath: () => ipcRenderer.invoke('preset:get-storage-path'),
    },
  });
  
  // Set flag to indicate mocks are installed
  contextBridge.exposeInMainWorld('__QC_MOCKS_INSTALLED__', true);
  
  console.log('[PRELOAD E2E] Mocks installed, __QC_MOCKS_INSTALLED__=true');
} else {
  // Normal mode: use real IPC
  contextBridge.exposeInMainWorld('electron', {
    // Legacy: Select files only
    openFiles: () => ipcRenderer.invoke('dialog:openFiles'),
    // Legacy: Select a single folder
    openFolder: () => ipcRenderer.invoke('dialog:openFolder'),
    // INC-003: Select files AND/OR folders (combined selection)
    // Returns array of paths (files or directories). Does NOT auto-expand directories.
    openFilesOrFolders: () => ipcRenderer.invoke('dialog:openFilesOrFolders'),
    // Shell operations
    showItemInFolder: (filePath: string) => ipcRenderer.invoke('shell:showItemInFolder', filePath),
    // Audit mode flag (dev/test-only)
    isAuditMode: () => E2E_AUDIT_MODE,
    
    // ============================================
    // Watch Folders V2: Detection automatic, execution manual
    // ============================================
    watchFolder: {
      getAll: () => ipcRenderer.invoke('watch-folder:get-all'),
      add: (config: any) => ipcRenderer.invoke('watch-folder:add', config),
      enable: (id: string) => ipcRenderer.invoke('watch-folder:enable', id),
      disable: (id: string) => ipcRenderer.invoke('watch-folder:disable', id),
      remove: (id: string) => ipcRenderer.invoke('watch-folder:remove', id),
      update: (id: string, updates: any) => ipcRenderer.invoke('watch-folder:update', id, updates),
      toggleFile: (watchFolderId: string, filePath: string) => 
        ipcRenderer.invoke('watch-folder:toggle-file', watchFolderId, filePath),
      selectAll: (watchFolderId: string, selected: boolean) => 
        ipcRenderer.invoke('watch-folder:select-all', watchFolderId, selected),
      clearPending: (watchFolderId: string, filePaths: string[]) => 
        ipcRenderer.invoke('watch-folder:clear-pending', watchFolderId, filePaths),
      logJobsCreated: (watchFolderId: string, jobIds: string[]) => 
        ipcRenderer.invoke('watch-folder:log-jobs-created', watchFolderId, jobIds),
      // PHASE 7: Armed watch folder operations
      arm: (id: string) => ipcRenderer.invoke('watch-folder:arm', id),
      disarm: (id: string) => ipcRenderer.invoke('watch-folder:disarm', id),
      validateArm: (id: string) => ipcRenderer.invoke('watch-folder:validate-arm', id),
      // Event listeners
      onStateChanged: (callback: (data: any) => void) => {
        ipcRenderer.on('watch-folder:state-changed', (_event, data) => callback(data))
      },
      onFileDetected: (callback: (data: any) => void) => {
        ipcRenderer.on('watch-folder:file-detected', (_event, data) => callback(data))
      },
      onError: (callback: (data: any) => void) => {
        ipcRenderer.on('watch-folder:error', (_event, data) => callback(data))
      },
    },
    
    // ============================================
    // Preset Persistence: Durable storage in userData
    // ============================================
    preset: {
      getAll: () => ipcRenderer.invoke('preset:get-all'),
      get: (id: string) => ipcRenderer.invoke('preset:get', id),
      create: (name: string, settings: any, description?: string) =>
        ipcRenderer.invoke('preset:create', name, settings, description),
      update: (id: string, updates: any) => ipcRenderer.invoke('preset:update', id, updates),
      delete: (id: string) => ipcRenderer.invoke('preset:delete', id),
      duplicate: (id: string, newName: string) => ipcRenderer.invoke('preset:duplicate', id, newName),
      resetDefaults: () => ipcRenderer.invoke('preset:reset-defaults'),
      getStoragePath: () => ipcRenderer.invoke('preset:get-storage-path'),
    },
  });
}
