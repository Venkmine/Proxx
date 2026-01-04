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
  });
}
