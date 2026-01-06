/**
 * NativeSourceSelector - OS-native file/folder selection for Proxx.
 * 
 * RATIONALE:
 * - macOS system volumes and network mounts are not safely enumerable
 * - Custom directory trees cause UI hangs on /Volumes, system roots, and network paths
 * - Native OS dialogs are the ONLY correct solution for filesystem browsing
 * - This matches industry-standard NLE (Premiere, Resolve, etc.) behavior
 * 
 * DESIGN:
 * - Uses Electron dialog.showOpenDialog for file/folder selection
 * - No recursive directory tree traversal in UI
 * - No custom directory navigator
 * - No loading spinners tied to directory enumeration
 * - All filesystem permission handling delegated to OS
 * 
 * FEATURES:
 * - Native OS file picker (files or folders)
 * - Drag-and-drop support
 * - Manual path paste with backend validation
 * - Recent paths (localStorage)
 * - Favorites (localStorage)
 * 
 * SECURITY:
 * - Backend validates all paths before job creation
 * - No client-side path enumeration at browse time
 * - Enumeration happens ONLY during job preflight
 */

import { useState, useCallback } from 'react'
import { Button } from './Button'

interface NativeSourceSelectorProps {
  /** Callback when files are selected */
  onFilesSelected: (paths: string[]) => void
  /** Callback when a folder is selected */
  onFolderSelected: (path: string) => void
  /** Backend URL for path validation */
  backendUrl: string
  /** Recent paths from localStorage */
  recentPaths: string[]
  /** Favorite paths from localStorage */
  favorites: string[]
  /** Add a path to favorites */
  onAddFavorite: (path: string) => void
  /** Remove a path from favorites */
  onRemoveFavorite: (path: string) => void
  /** Has Electron access */
  hasElectron: boolean
}

/**
 * NativeSourceSelector - Replace DirectoryNavigator with OS-native dialogs.
 * 
 * NO recursive filesystem traversal.
 * NO custom tree navigation.
 * NO /Volumes enumeration attempts.
 */
export function NativeSourceSelector({
  onFilesSelected,
  onFolderSelected,
  backendUrl,
  recentPaths,
  favorites,
  onAddFavorite,
  onRemoveFavorite,
  hasElectron,
}: NativeSourceSelectorProps) {
  const [manualPath, setManualPath] = useState('')
  const [validationError, setValidationError] = useState<string | null>(null)
  const [validating, setValidating] = useState(false)

  /**
   * Open native OS dialog to select files.
   * Uses Electron showOpenDialog with multiSelections + openFile.
   */
  const handleSelectFiles = useCallback(async () => {
    if (!hasElectron || !window.electron) {
      console.error('Electron API not available')
      return
    }

    try {
      const result = await window.electron?.openFiles?.()
      if (result && result.length > 0) {
        onFilesSelected(result)
      }
    } catch (err) {
      console.error('Error selecting files:', err)
    }
  }, [hasElectron, onFilesSelected])

  /**
   * Open native OS dialog to select a folder.
   * Uses Electron showOpenDialog with openDirectory.
   */
  const handleSelectFolder = useCallback(async () => {
    if (!hasElectron || !window.electron) {
      console.error('Electron API not available')
      return
    }

    try {
      const result = await window.electron?.openFolder?.()
      if (result) {
        onFolderSelected(result)
      }
    } catch (err) {
      console.error('Error selecting folder:', err)
    }
  }, [hasElectron, onFolderSelected])

  /**
   * Validate a manually entered path via backend.
   * Backend performs all security checks and path normalization.
   */
  const handleValidateAndAdd = useCallback(async () => {
    if (!manualPath.trim()) return

    setValidating(true)
    setValidationError(null)

    try {
      const response = await fetch(
        `${backendUrl}/filesystem/validate-path?path=${encodeURIComponent(manualPath.trim())}`
      )

      if (!response.ok) {
        const error = await response.json()
        // UX TRUTHFULNESS: Explicit error messages instead of generic "Invalid path"
        const errorDetail = error.detail || 'Path validation failed'
        if (errorDetail.includes('not exist') || errorDetail.includes('not found')) {
          setValidationError('Path does not exist')
        } else if (errorDetail.includes('permission') || errorDetail.includes('access')) {
          setValidationError('Cannot access this path (permission denied)')
        } else if (errorDetail.includes('system') || errorDetail.includes('protected')) {
          setValidationError('System directories are not valid sources')
        } else {
          setValidationError(errorDetail)
        }
        return
      }

      const data = await response.json()
      
      if (data.valid) {
        if (data.type === 'file') {
          onFilesSelected([manualPath.trim()])
        } else if (data.type === 'directory') {
          onFolderSelected(manualPath.trim())
        }
        setManualPath('')
        setValidationError(null)
      } else {
        // UX TRUTHFULNESS: Explicit error messages
        const errorMsg = data.error || 'Path validation failed'
        if (errorMsg.includes('not exist') || errorMsg.includes('not found')) {
          setValidationError('Path does not exist')
        } else if (errorMsg.includes('no media') || errorMsg.includes('no supported')) {
          setValidationError('Path contains no supported media files')
        } else if (errorMsg.includes('system') || errorMsg.includes('protected')) {
          setValidationError('System directories are not valid sources')
        } else {
          setValidationError(errorMsg)
        }
      }
    } catch (err) {
      console.error('Path validation error:', err)
      setValidationError('Failed to validate path')
    } finally {
      setValidating(false)
    }
  }, [manualPath, backendUrl, onFilesSelected, onFolderSelected])

  /**
   * Add a recent/favorite path.
   * Validates via backend first.
   */
  const handleAddPath = useCallback(async (path: string) => {
    try {
      const response = await fetch(
        `${backendUrl}/filesystem/validate-path?path=${encodeURIComponent(path)}`
      )

      if (!response.ok) {
        console.error('Path validation failed:', path)
        return
      }

      const data = await response.json()
      
      if (data.valid) {
        if (data.type === 'file') {
          onFilesSelected([path])
        } else if (data.type === 'directory') {
          onFolderSelected(path)
        }
      }
    } catch (err) {
      console.error('Error adding path:', err)
    }
  }, [backendUrl, onFilesSelected, onFolderSelected])

  return (
    <div className="native-source-selector" style={{ 
      display: 'flex', 
      flexDirection: 'column', 
      gap: '16px',
      padding: '16px',
      height: '100%',
      overflow: 'auto'
    }}>
      {/* SELECTION ACTIONS */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <Button
          onClick={handleSelectFiles}
          disabled={!hasElectron}
          style={{ width: '100%' }}
        >
          📁 Select Files
        </Button>
        <Button
          onClick={handleSelectFolder}
          disabled={!hasElectron}
          style={{ width: '100%' }}
        >
          📂 Select Folder
        </Button>
      </div>

      {/* MANUAL PATH ENTRY */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <label style={{ fontSize: '12px', fontWeight: 500, color: '#888' }}>
          Or paste path:
        </label>
        <div style={{ display: 'flex', gap: '8px' }}>
          <input
            type="text"
            value={manualPath}
            onChange={(e) => setManualPath(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                handleValidateAndAdd()
              }
            }}
            placeholder="/path/to/file/or/folder"
            style={{
              flex: 1,
              padding: '8px',
              border: '1px solid #444',
              borderRadius: '4px',
              backgroundColor: '#2a2a2a',
              color: '#fff',
              fontSize: '13px',
            }}
          />
          <Button
            onClick={handleValidateAndAdd}
            disabled={!manualPath.trim() || validating}
            style={{ whiteSpace: 'nowrap' }}
          >
            {validating ? 'Validating...' : 'Add'}
          </Button>
        </div>
        {validationError && (
          <div style={{ 
            padding: '8px', 
            backgroundColor: '#3a1a1a', 
            border: '1px solid #661111',
            borderRadius: '4px',
            fontSize: '12px',
            color: '#ff6b6b'
          }}>
            {validationError}
          </div>
        )}
      </div>

      {/* FAVORITES */}
      {favorites.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{ 
            fontSize: '12px', 
            fontWeight: 500, 
            color: '#888',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}>
            ⭐ Favorites
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {favorites.map((path, index) => (
              <div
                key={index}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '8px',
                  backgroundColor: '#2a2a2a',
                  borderRadius: '4px',
                  fontSize: '12px',
                }}
              >
                <button
                  onClick={() => handleAddPath(path)}
                  style={{
                    flex: 1,
                    textAlign: 'left',
                    background: 'none',
                    border: 'none',
                    color: '#fff',
                    cursor: 'pointer',
                    padding: 0,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                  title={path}
                >
                  {path}
                </button>
                <button
                  onClick={() => onRemoveFavorite(path)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#888',
                    cursor: 'pointer',
                    padding: '4px',
                    fontSize: '14px',
                  }}
                  title="Remove from favorites"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* RECENT PATHS */}
      {recentPaths.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{ 
            fontSize: '12px', 
            fontWeight: 500, 
            color: '#888',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}>
            🕒 Recent
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {recentPaths.slice(0, 10).map((path, index) => (
              <div
                key={index}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '8px',
                  backgroundColor: '#2a2a2a',
                  borderRadius: '4px',
                  fontSize: '12px',
                }}
              >
                <button
                  onClick={() => handleAddPath(path)}
                  style={{
                    flex: 1,
                    textAlign: 'left',
                    background: 'none',
                    border: 'none',
                    color: '#fff',
                    cursor: 'pointer',
                    padding: 0,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                  title={path}
                >
                  {path}
                </button>
                <button
                  onClick={() => onAddFavorite(path)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#888',
                    cursor: 'pointer',
                    padding: '4px',
                    fontSize: '14px',
                  }}
                  title="Add to favorites"
                >
                  ⭐
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* INFO BOX */}
      <div style={{
        padding: '12px',
        backgroundColor: '#2a2a2a',
        border: '1px solid #444',
        borderRadius: '4px',
        fontSize: '12px',
        color: '#888',
        lineHeight: '1.5',
      }}>
        <strong style={{ color: '#fff' }}>Why no directory tree?</strong>
        <br />
        macOS system volumes and network mounts cannot be safely enumerated. 
        Native OS dialogs are the only reliable solution.
        <br /><br />
        This matches industry-standard NLE behavior (Premiere, Resolve, etc.).
      </div>
    </div>
  )
}
