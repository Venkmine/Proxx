import React, { useState, useCallback } from 'react'
import { Button } from './Button'
import { Select } from './Select'

/**
 * CreateJobPanel component - Sources panel (Proxy v1).
 * 
 * ⚠️ VERIFY GUARD:
 * Any change to this component requires Playwright coverage.
 * Tests: qa/verify/ui/proxy/create_job.spec.ts
 *        qa/verify/ui/proxy/validation_errors.spec.ts
 * Run: make verify-ui before committing changes.
 * 
 * Per design requirements:
 * - File selection for manual job creation
 * - Full height left column
 * - Supports drag & drop for files
 * - Favorites moved to collapsible utility section
 * 
 * Proxy v1 scope:
 * - File selection (required)
 * - Preset selection (required)
 * - Output directory (required)
 * - Engine selection (FFmpeg only)
 * - Nothing render-related (no Deliver/codec/metadata logic)
 */

interface PresetInfo {
  id: string
  name: string
}

// Phase 16: Engine info
interface EngineInfo {
  type: string
  name: string
  available: boolean
}

interface CreateJobPanelProps {
  isVisible: boolean
  onToggleVisibility: () => void
  
  // File selection
  selectedFiles: string[]
  onFilesChange: (files: string[]) => void
  onSelectFilesClick: () => void
  
  // Preset selection
  presets: PresetInfo[]
  selectedPresetId: string
  onPresetChange: (presetId: string) => void
  presetError?: string
  
  // Phase 16: Engine selection
  engines?: EngineInfo[]
  selectedEngine?: string
  onEngineChange?: (engine: string) => void
  
  // Output directory
  outputDirectory: string
  onOutputDirectoryChange: (dir: string) => void
  onSelectFolderClick: () => void
  
  // Favorites
  pathFavorites: string[]
  onAddFavorite: (path: string) => void
  onRemoveFavorite: (path: string) => void
  
  // Actions
  onCreateJob: () => void
  onClear: () => void
  
  // State
  loading?: boolean
  hasElectron?: boolean
  backendUrl?: string
}

export function CreateJobPanel({
  isVisible,
  onToggleVisibility,
  selectedFiles,
  onFilesChange,
  onSelectFilesClick,
  presets,
  selectedPresetId,
  onPresetChange,
  presetError,
  engines = [],
  selectedEngine = 'ffmpeg',
  onEngineChange,
  outputDirectory,
  onOutputDirectoryChange,
  onSelectFolderClick,
  pathFavorites,
  onAddFavorite,
  onRemoveFavorite,
  onCreateJob,
  onClear,
  loading = false,
  hasElectron = false,
  backendUrl = '',
}: CreateJobPanelProps) {
  const [isDragOver, setIsDragOver] = useState(false)

  // Drag & drop handlers
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(false)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(false)

    const items = e.dataTransfer.items
    const newPaths: string[] = []

    if (items) {
      // Use DataTransferItemList interface for file access
      for (let i = 0; i < items.length; i++) {
        const item = items[i]
        if (item.kind === 'file') {
          const file = item.getAsFile()
          if (file) {
            // In Electron, we can get the path from webUtils
            // For now, use the file name as a placeholder
            // The actual path extraction happens via Electron's webUtils.getPathForFile
            const path = (file as any).path || file.name
            if (path) {
              newPaths.push(path)
            }
          }
        }
      }
    } else {
      // Fallback for files property
      const files = e.dataTransfer.files
      for (let i = 0; i < files.length; i++) {
        const file = files[i]
        const path = (file as any).path || file.name
        if (path) {
          newPaths.push(path)
        }
      }
    }

    if (newPaths.length > 0) {
      onFilesChange([...selectedFiles, ...newPaths])
    }
  }, [selectedFiles, onFilesChange])

  const canCreate = selectedFiles.length > 0 && selectedPresetId && outputDirectory && !loading
  const presetOptions = presets.map(p => ({ value: p.id, label: `${p.id} — ${p.name}` }))
  const favoriteOptions = pathFavorites.map(p => ({ value: p, label: p }))

  if (!isVisible) {
    return null
  }

  return (
    <div
      data-testid="create-job-panel"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      style={{
        padding: '1.25rem 1.5rem',
        borderBottom: '1px solid var(--border-primary)',
        // Use gradient background, same as main UI
        background: 'linear-gradient(180deg, rgba(26, 32, 44, 0.95) 0%, rgba(20, 24, 32, 0.95) 100%)',
        position: 'relative',
        transition: 'all 0.2s ease',
        ...(isDragOver && {
          backgroundColor: 'rgba(59, 130, 246, 0.08)',
          border: '2px dashed var(--button-primary-bg)',
        }),
      }}
    >
      {/* Header with Chevron Toggle */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '1rem',
        }}
      >
        <h2
          style={{
            margin: 0,
            fontSize: '0.9375rem',
            fontFamily: 'var(--font-sans)',
            fontWeight: 600,
            color: 'var(--text-primary)',
            letterSpacing: '-0.01em',
          }}
        >
          Sources
        </h2>
        
        {/* Chevron toggle to hide panel */}
        <button
          onClick={onToggleVisibility}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '1.75rem',
            height: '1.75rem',
            background: 'rgba(51, 65, 85, 0.3)',
            border: '1px solid var(--border-primary)',
            borderRadius: 'var(--radius-sm)',
            cursor: 'pointer',
            color: 'var(--text-muted)',
            fontSize: '0.75rem',
            transition: 'all 0.15s',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = 'rgba(71, 85, 105, 0.5)'
            e.currentTarget.style.borderColor = 'var(--border-hover)'
            e.currentTarget.style.color = 'var(--text-secondary)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'rgba(51, 65, 85, 0.3)'
            e.currentTarget.style.borderColor = 'var(--border-primary)'
            e.currentTarget.style.color = 'var(--text-muted)'
          }}
          title="Collapse Panel"
        >
          <span style={{ transform: 'rotate(180deg)', display: 'inline-block' }}>▼</span>
        </button>
      </div>

      {/* Drag & Drop Indicator */}
      {isDragOver && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'rgba(59, 130, 246, 0.1)',
            border: '2px dashed var(--button-primary-bg)',
            borderRadius: 'var(--radius)',
            zIndex: 10,
          }}
        >
          <div
            style={{
              fontSize: '1rem',
              fontWeight: 600,
              color: 'var(--button-primary-bg)',
              fontFamily: 'var(--font-sans)',
            }}
          >
            Drop files or folders here
          </div>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {/* File Selection */}
        <div>
          <label
            style={{
              display: 'block',
              fontSize: '0.75rem',
              fontWeight: 500,
              color: 'var(--text-secondary)',
              marginBottom: '0.375rem',
              fontFamily: 'var(--font-sans)',
              textTransform: 'uppercase',
              letterSpacing: '0.03em',
            }}
          >
            Source Files *
          </label>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
            {hasElectron ? (
              <Button
                variant="secondary"
                size="sm"
                onClick={onSelectFilesClick}
                disabled={loading}
              >
                Select Files...
              </Button>
            ) : (
              <>
                <input
                  type="file"
                  id="file-input-browser"
                  multiple
                  onChange={(e) => {
                    const files = e.target.files
                    if (files && files.length > 0) {
                      const paths: string[] = []
                      for (let i = 0; i < files.length; i++) {
                        // In browser, we use file name; Electron would give path
                        const file = files[i]
                        const path = (file as any).path || file.name
                        paths.push(path)
                      }
                      onFilesChange([...selectedFiles, ...paths])
                    }
                    // Reset input so same file can be selected again
                    e.target.value = ''
                  }}
                  disabled={loading}
                  style={{ display: 'none' }}
                />
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => document.getElementById('file-input-browser')?.click()}
                  disabled={loading}
                >
                  Select Files...
                </Button>
                {/* Manual path input for browser mode - allows entering full paths */}
                <input
                  type="text"
                  data-testid="file-path-input"
                  placeholder="Or enter file path..."
                  disabled={loading}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      const input = e.target as HTMLInputElement
                      const path = input.value.trim()
                      if (path) {
                        onFilesChange([...selectedFiles, path])
                        input.value = ''
                      }
                    }
                  }}
                  style={{
                    flex: 1,
                    minWidth: '200px',
                    padding: '0.375rem 0.75rem',
                    fontSize: '0.75rem',
                    fontFamily: 'var(--font-mono)',
                    backgroundColor: 'var(--input-bg)',
                    border: '1px solid var(--border-primary)',
                    borderRadius: 'var(--radius-sm)',
                    color: 'var(--text-primary)',
                    outline: 'none',
                  }}
                />
              </>
            )}
            <span
              style={{
                fontSize: '0.8125rem',
                color: selectedFiles.length > 0 ? 'var(--text-secondary)' : 'var(--text-muted)',
                fontFamily: 'var(--font-sans)',
              }}
            >
              {selectedFiles.length === 0
                ? 'No files selected — drag & drop or click to browse'
                : `${selectedFiles.length} file(s) selected`}
            </span>
          </div>
          
          {/* Selected Files List */}
          {selectedFiles.length > 0 && (
            <div
              style={{
                marginTop: '0.5rem',
                maxHeight: '100px',
                overflow: 'auto',
                padding: '0.5rem',
                backgroundColor: 'var(--card-bg)',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border-secondary)',
              }}
            >
              {selectedFiles.map((f, i) => (
                <div
                  key={i}
                  style={{
                    fontSize: '0.75rem',
                    fontFamily: 'var(--font-mono)',
                    color: 'var(--text-muted)',
                    padding: '0.125rem 0',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                  }}
                >
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {f}
                  </span>
                  <button
                    onClick={() => {
                      const newFiles = [...selectedFiles]
                      newFiles.splice(i, 1)
                      onFilesChange(newFiles)
                    }}
                    style={{
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      color: 'var(--text-dim)',
                      fontSize: '0.875rem',
                      padding: '0 0.25rem',
                    }}
                    title="Remove"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Preset Selection */}
        <div>
          <label
            style={{
              display: 'block',
              fontSize: '0.75rem',
              fontWeight: 500,
              color: 'var(--text-secondary)',
              marginBottom: '0.375rem',
              fontFamily: 'var(--font-sans)',
              textTransform: 'uppercase',
              letterSpacing: '0.03em',
            }}
          >
            Preset *
          </label>
          <Select
            data-testid="preset-select"
            value={selectedPresetId}
            onChange={onPresetChange}
            options={presetOptions}
            placeholder="Select a preset..."
            disabled={loading || presets.length === 0}
            fullWidth
          />
          
          {presetError && (
            <div
              style={{
                marginTop: '0.5rem',
                padding: '0.5rem',
                fontSize: '0.75rem',
                color: 'var(--status-failed-fg)',
                backgroundColor: 'rgba(239, 68, 68, 0.1)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                borderRadius: 'var(--radius-sm)',
                fontFamily: 'var(--font-sans)',
              }}
            >
              <strong>Error:</strong> {presetError}
              {backendUrl && (
                <>
                  <br />
                  <small>Check that backend is running at {backendUrl}</small>
                </>
              )}
            </div>
          )}
          
          {!presetError && presets.length === 0 && (
            <div
              style={{
                marginTop: '0.5rem',
                padding: '0.5rem',
                fontSize: '0.75rem',
                color: 'var(--text-muted)',
                backgroundColor: 'var(--card-bg)',
                border: '1px solid var(--border-secondary)',
                borderRadius: 'var(--radius-sm)',
                fontFamily: 'var(--font-sans)',
              }}
            >
              No presets available. Loading...
            </div>
          )}
        </div>

        {/* Proxy v1: Engine Selection - FFmpeg only */}
        <div>
          <label
            style={{
              display: 'block',
              fontSize: '0.75rem',
              fontWeight: 500,
              color: 'var(--text-secondary)',
              marginBottom: '0.375rem',
              fontFamily: 'var(--font-sans)',
              textTransform: 'uppercase',
              letterSpacing: '0.03em',
            }}
          >
            Execution Engine
          </label>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            {/* Proxy v1: Only show available engines (FFmpeg) */}
            {engines.filter(e => e.available).map(engine => (
              <button
                key={engine.type}
                onClick={() => onEngineChange?.(engine.type)}
                disabled={loading}
                style={{
                  flex: 1,
                  padding: '0.625rem 1rem',
                  border: selectedEngine === engine.type
                    ? '2px solid var(--button-primary-bg)'
                    : '1px solid var(--border-primary)',
                  borderRadius: 'var(--radius-sm)',
                  backgroundColor: selectedEngine === engine.type
                    ? 'rgba(59, 130, 246, 0.1)'
                    : 'var(--card-bg)',
                  color: selectedEngine === engine.type
                      ? 'var(--button-primary-bg)'
                      : 'var(--text-secondary)',
                  cursor: 'pointer',
                  fontSize: '0.8125rem',
                  fontFamily: 'var(--font-sans)',
                  fontWeight: selectedEngine === engine.type ? 600 : 400,
                  transition: 'all 0.15s',
                }}
              >
                {engine.name}
              </button>
            ))}
          </div>
        </div>

        {/* Output Directory */}
        <div>
          <label
            style={{
              display: 'block',
              fontSize: '0.75rem',
              fontWeight: 500,
              color: 'var(--text-secondary)',
              marginBottom: '0.375rem',
              fontFamily: 'var(--font-sans)',
              textTransform: 'uppercase',
              letterSpacing: '0.03em',
            }}
          >
            Output Directory *
          </label>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
            {hasElectron ? (
              <Button
                variant="secondary"
                size="sm"
                onClick={onSelectFolderClick}
                disabled={loading}
              >
                Select Folder...
              </Button>
            ) : (
              <input
                type="text"
                value={outputDirectory}
                onChange={(e) => onOutputDirectoryChange(e.target.value)}
                placeholder="/path/to/output/directory"
                disabled={loading}
                style={{
                  flex: 1,
                  padding: '0.5rem 0.75rem',
                  fontSize: '0.8125rem',
                  fontFamily: 'var(--font-mono)',
                  backgroundColor: 'var(--input-bg)',
                  border: '1px solid var(--border-primary)',
                  borderRadius: 'var(--radius-sm)',
                  color: 'var(--text-primary)',
                  outline: 'none',
                }}
              />
            )}
            
            {pathFavorites.length > 0 && (
              <Select
                value=""
                onChange={(val) => val && onOutputDirectoryChange(val)}
                options={favoriteOptions}
                placeholder="Favorites..."
                disabled={loading}
                size="sm"
              />
            )}
          </div>
          
          {outputDirectory && (
            <div
              style={{
                marginTop: '0.5rem',
                display: 'flex',
                gap: '0.5rem',
                alignItems: 'center',
              }}
            >
              <code
                style={{
                  flex: 1,
                  fontSize: '0.75rem',
                  fontFamily: 'var(--font-mono)',
                  color: 'var(--text-secondary)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {outputDirectory}
              </code>
              {!pathFavorites.includes(outputDirectory) && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onAddFavorite(outputDirectory)}
                  style={{ fontSize: '0.6875rem' }}
                >
                  Add to Favorites
                </Button>
              )}
            </div>
          )}
        </div>

        {/* Favorites Management - Collapsible Utility Section (Phase 19) */}
        {pathFavorites.length > 0 && (
          <details style={{ marginTop: '0.5rem' }}>
            <summary
              style={{
                display: 'flex',
                alignItems: 'center',
                fontSize: '0.75rem',
                fontWeight: 500,
                color: 'var(--text-muted)',
                cursor: 'pointer',
                fontFamily: 'var(--font-sans)',
                padding: '0.25rem 0',
                listStyle: 'none',
              }}
            >
              <span style={{ marginRight: '0.5rem', fontSize: '0.625rem' }}>▶</span>
              Saved Paths ({pathFavorites.length})
            </summary>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', paddingLeft: '1rem', marginTop: '0.25rem' }}>
              {pathFavorites.map((path, i) => (
                <div
                  key={i}
                  style={{
                    display: 'flex',
                    gap: '0.5rem',
                    alignItems: 'center',
                    padding: '0.125rem 0',
                  }}
                >
                  <button
                    onClick={() => onOutputDirectoryChange(path)}
                    style={{
                      flex: 1,
                      fontSize: '0.6875rem',
                      fontFamily: 'var(--font-mono)',
                      color: 'var(--text-muted)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      background: 'none',
                      border: 'none',
                      textAlign: 'left',
                      cursor: 'pointer',
                      padding: 0,
                    }}
                    title={`Use: ${path}`}
                  >
                    {path}
                  </button>
                  <button
                    onClick={() => onRemoveFavorite(path)}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'var(--text-dim)',
                      cursor: 'pointer',
                      fontSize: '0.75rem',
                      padding: '0 0.25rem',
                    }}
                    title="Remove"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          </details>
        )}

        {/* Action Buttons */}
        <div
          style={{
            paddingTop: '0.75rem',
            borderTop: '1px solid var(--border-secondary)',
            display: 'flex',
            gap: '0.5rem',
          }}
        >
          <Button
            data-testid="add-to-queue-button"
            variant="primary"
            size="md"
            onClick={onCreateJob}
            disabled={!canCreate}
            loading={loading}
          >
            + Add to Queue
          </Button>
          <Button
            variant="secondary"
            size="md"
            onClick={onClear}
            disabled={loading}
          >
            Clear
          </Button>
        </div>

        <div
          style={{
            marginTop: '0.75rem',
            fontSize: '0.6875rem',
            color: 'var(--text-dim)',
            fontFamily: 'var(--font-sans)',
            fontStyle: 'italic',
          }}
        >
          Drag & drop files or select manually. Jobs render in queue order.
        </div>
      </div>
    </div>
  )
}

export default CreateJobPanel
