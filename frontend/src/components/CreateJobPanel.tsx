// Alpha scope defined in docs/ALPHA_REALITY.md.
// Do not add features that contradict it without updating that file first.

import { useState } from 'react'
import { Button } from './Button'
import { Select } from './Select'
import { ExplicitDropZone } from './ExplicitDropZone'
import { FEATURE_FLAGS } from '../config/featureFlags'
import type { WorkspaceMode } from '../stores/workspaceModeStore'
import { PresetSummary, getPresetDescriptionLine } from './PresetSummary'
import type { DeliverSettings } from './DeliverControlPanel'

/**
 * CreateJobPanel component - Sources panel (Phase 3: UX Clarity).
 * 
 * ⚠️ VERIFY GUARD:
 * Any change to this component requires Playwright coverage.
 * Tests: qa/verify/ui/proxy/create_job.spec.ts
 *        qa/verify/ui/proxy/validation_errors.spec.ts
 * Run: make verify-ui before committing changes.
 * 
 * Phase 3 improvements:
 * - Clearer labels: "Add to Queue" becomes explicit job creation
 * - Immediate feedback when job is created
 * - File selection paths unchanged (working ingestion pipeline preserved)
 * - Drag & drop unchanged (working ingestion pipeline preserved)
 * 
 * Architecture:
 * - File selection (Electron: file picker, Browser: manual path entry)
 * - Output directory (required)
 * - Engine selection (FFmpeg only)
 * - "Add to Queue" triggers useIngestion.ingest() → job appears in queue
 * 
 * LAYOUT RULE: This component receives space from App.tsx.
 * It MUST NOT set its own max-width or decide its visibility.
 * WorkspaceMode controls layout authority.
 */

// ALPHA BLOCKER FIX: absolute source paths required for job creation
// Validates that a path is absolute (contains '/' or starts with drive letter on Windows)
function isAbsolutePath(path: string): boolean {
  // Unix-style absolute paths start with /
  // Windows-style absolute paths start with C:\\ or similar
  return path.startsWith('/') || /^[a-zA-Z]:[\\/]/.test(path)
}

// Phase 16: Engine info
interface EngineInfo {
  type: string
  name: string
  available: boolean
}

// Phase 7B: Preset scope type
type PresetScope = 'user' | 'workspace'

// Phase 6: Settings preset info (Phase 7A: extended for summary preview, Phase 7B: added scope)
interface SettingsPresetInfo {
  id: string
  name: string
  description?: string
  scope?: PresetScope  // Phase 7B: user or workspace
  fingerprint: string
  /** Phase 7A: Optional settings snapshot for summary preview */
  settings_snapshot?: DeliverSettings
}

interface CreateJobPanelProps {
  isVisible: boolean
  onToggleVisibility: () => void
  
  // File selection
  selectedFiles: string[]
  onFilesChange: (files: string[]) => void
  onSelectFilesClick: () => void
  
  // Phase 4C: Explicit drop zone
  onFilesDropped?: (paths: string[]) => void
  
  // Phase 16: Engine selection
  engines?: EngineInfo[]
  selectedEngine?: string
  onEngineChange?: (engine: string) => void
  
  // Phase 6: Settings preset selection
  settingsPresets?: SettingsPresetInfo[]
  selectedSettingsPresetId?: string | null
  onSettingsPresetChange?: (presetId: string | null) => void
  
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
  
  // WorkspaceMode — controls layout behaviour (passed from App.tsx)
  workspaceMode?: WorkspaceMode
  
  // Phase 4A: Directory navigator toggle
  showDirectoryNavigator?: boolean
  onToggleDirectoryNavigator?: () => void
}

export function CreateJobPanel({
  isVisible,
  onToggleVisibility,
  selectedFiles,
  onFilesChange,
  onSelectFilesClick,
  onFilesDropped,
  engines = [],
  selectedEngine = 'ffmpeg',
  onEngineChange,
  settingsPresets = [],
  selectedSettingsPresetId = null,
  onSettingsPresetChange,
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
  backendUrl: _backendUrl = '',
  workspaceMode = 'configure',
  showDirectoryNavigator = false,
  onToggleDirectoryNavigator,
}: CreateJobPanelProps) {
  // Web mode: show prompt when files dropped without absolute paths
  const [droppedFileNames, setDroppedFileNames] = useState<string[]>([])
  const [showPathPrompt, setShowPathPrompt] = useState(false)
  const [pathPromptValue, setPathPromptValue] = useState('')
  // Phase 6: Preset preview collapsed state
  const [showPresetPreview, setShowPresetPreview] = useState(false)
  // Phase 7A: Raw JSON toggle (collapsed by default)
  const [showRawSnapshot, setShowRawSnapshot] = useState(false)
  
  // Design mode guard: Add to Queue is blocked in design mode
  const isDesignMode = workspaceMode === 'design'

  // Phase 6: Get selected preset for preview
  const selectedPreset = settingsPresets.find(p => p.id === selectedSettingsPresetId)

  // Phase 9F: Explicit validation with human-readable reasons
  const getCreateJobValidation = (): { canCreate: boolean; reason: string } => {
    if (loading) {
      return { canCreate: false, reason: 'Processing...' }
    }
    if (isDesignMode) {
      return { canCreate: false, reason: 'Exit Design mode to create jobs' }
    }
    if (selectedFiles.length === 0) {
      return { canCreate: false, reason: 'Select at least one source file' }
    }
    if (!outputDirectory) {
      return { canCreate: false, reason: 'Set an output directory' }
    }
    // Validate paths are absolute
    const invalidPaths = selectedFiles.filter(p => !isAbsolutePath(p))
    if (invalidPaths.length > 0) {
      return { canCreate: false, reason: `Invalid path: ${invalidPaths[0]} (must be absolute)` }
    }
    return { canCreate: true, reason: 'Ready to create job' }
  }
  
  const validation = getCreateJobValidation()
  const canCreate = validation.canCreate
  const favoriteOptions = pathFavorites.map(p => ({ value: p, label: p }))

  if (!isVisible) {
    return null
  }

  // Handler for path prompt confirmation
  const handlePathPromptConfirm = () => {
    const path = pathPromptValue.trim()
    if (path && isAbsolutePath(path)) {
      onFilesChange([...selectedFiles, path])
      setShowPathPrompt(false)
      setDroppedFileNames([])
      setPathPromptValue('')
    }
  }

  return (
    <div
      data-testid="create-job-panel"
      style={{
        padding: '1.25rem 1.5rem',
        borderBottom: '1px solid var(--border-primary)',
        // Use gradient background, same as main UI
        background: 'linear-gradient(180deg, rgba(26, 32, 44, 0.95) 0%, rgba(20, 24, 32, 0.95) 100%)',
        position: 'relative',
        transition: 'all 0.2s ease',
        // Ensure content doesn't shrink and remains scrollable
        flexShrink: 0,
      }}
    >
      {/* Path Prompt Dialog for Web Mode */}
      {showPathPrompt && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.7)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
        }}>
          <div style={{
            background: 'var(--card-bg-solid, #1a202c)',
            borderRadius: 'var(--radius-lg)',
            padding: '1.5rem',
            maxWidth: '500px',
            width: '90%',
            border: '1px solid var(--border-primary)',
          }}>
            <h3 style={{ margin: '0 0 1rem', color: 'var(--text-primary)', fontSize: '1rem' }}>
              Enter Full File Path
            </h3>
            <p style={{ margin: '0 0 0.75rem', color: 'var(--text-secondary)', fontSize: '0.8125rem' }}>
              File detected: <strong style={{ color: 'var(--text-primary)' }}>{droppedFileNames[0]}</strong>
              {droppedFileNames.length > 1 && ` (+${droppedFileNames.length - 1} more)`}
            </p>
            <p style={{ margin: '0 0 0.75rem', color: 'var(--text-muted)', fontSize: '0.75rem' }}>
              Web browsers cannot access file paths. Please enter the full absolute path:
            </p>
            <input
              type="text"
              value={pathPromptValue}
              onChange={(e) => setPathPromptValue(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handlePathPromptConfirm()}
              autoFocus
              style={{
                width: '100%',
                padding: '0.625rem 0.75rem',
                fontSize: '0.8125rem',
                fontFamily: 'var(--font-mono)',
                backgroundColor: 'var(--input-bg)',
                border: '1px solid var(--border-primary)',
                borderRadius: 'var(--radius-sm)',
                color: 'var(--text-primary)',
                marginBottom: '1rem',
              }}
            />
            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => { setShowPathPrompt(false); setDroppedFileNames([]); }}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={handlePathPromptConfirm}
              >
                Add File
              </Button>
            </div>
          </div>
        </div>
      )}

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
        
        <div style={{ display: 'flex', gap: '0.375rem' }}>
          {/* Phase 4A: Browse Folders toggle button */}
          {onToggleDirectoryNavigator && (
            <button
              onClick={onToggleDirectoryNavigator}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.25rem',
                padding: '0.25rem 0.5rem',
                background: showDirectoryNavigator 
                  ? 'rgba(59, 130, 246, 0.15)' 
                  : 'rgba(51, 65, 85, 0.3)',
                border: showDirectoryNavigator
                  ? '1px solid var(--button-primary-bg)'
                  : '1px solid var(--border-primary)',
                borderRadius: 'var(--radius-sm)',
                cursor: 'pointer',
                color: showDirectoryNavigator 
                  ? 'var(--button-primary-bg)' 
                  : 'var(--text-muted)',
                fontSize: '0.6875rem',
                fontWeight: 500,
                transition: 'all 0.15s',
              }}
              onMouseEnter={(e) => {
                if (!showDirectoryNavigator) {
                  e.currentTarget.style.backgroundColor = 'rgba(71, 85, 105, 0.5)'
                  e.currentTarget.style.borderColor = 'var(--border-hover)'
                  e.currentTarget.style.color = 'var(--text-secondary)'
                }
              }}
              onMouseLeave={(e) => {
                if (!showDirectoryNavigator) {
                  e.currentTarget.style.backgroundColor = 'rgba(51, 65, 85, 0.3)'
                  e.currentTarget.style.borderColor = 'var(--border-primary)'
                  e.currentTarget.style.color = 'var(--text-muted)'
                }
              }}
              title={showDirectoryNavigator ? 'Hide directory browser' : 'Browse folders'}
            >
              <span style={{ fontSize: '0.75rem' }}>📁</span>
              Browse
            </button>
          )}
          
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
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {/* Phase 4C: Explicit Drop Zone */}
        {FEATURE_FLAGS.EXPLICIT_DROP_ZONE_ENABLED && onFilesDropped && (
          <ExplicitDropZone
            onFilesDropped={onFilesDropped}
            disabled={loading || isDesignMode}
          />
        )}

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
              /* Manual path input for browser mode - allows entering full paths */
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                <input
                  type="text"
                  data-testid="file-path-input"
                  placeholder="Paste absolute path here: /Users/yourname/path/to/video.mp4"
                  disabled={loading}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      const input = e.target as HTMLInputElement
                      const path = input.value.trim()
                      if (path) {
                        console.log('[CreateJobPanel] Adding path:', path)
                        onFilesChange([...selectedFiles, path])
                        input.value = ''
                      }
                    }
                  }}
                  style={{
                    width: '100%',
                    padding: '0.5rem 0.75rem',
                    fontSize: '0.8125rem',
                    fontFamily: 'var(--font-mono)',
                    backgroundColor: 'var(--input-bg)',
                    border: '2px solid var(--border-primary)',
                    borderRadius: 'var(--radius-sm)',
                    color: 'var(--text-primary)',
                    outline: 'none',
                  }}
                />
                <span style={{ fontSize: '0.6875rem', color: 'var(--text-secondary)', fontStyle: 'italic' }}>
                  Press Enter to add file. Example: ~/test_media/test_input.mp4
                </span>
              </div>
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

        {/* Phase 6/7A: Settings Preset Selector with enhanced clarity */}
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
            Preset Snapshot
          </label>
          <Select
            value={selectedSettingsPresetId || ''}
            onChange={(val) => onSettingsPresetChange?.(val || null)}
            options={[
              { value: '', label: 'No preset (manual)' },
              ...settingsPresets.map(p => ({ 
                value: p.id, 
                // Phase 7A: Show descriptive secondary text with codec, overlays, etc.
                label: p.name + (p.settings_snapshot 
                  ? ` · ${getPresetDescriptionLine(p.settings_snapshot)}`
                  : (p.description ? ` — ${p.description}` : '')
                )
              }))
            ]}
            disabled={loading || isDesignMode}
            size="sm"
          />
          {/* Phase 7A: Badge when preset is selected */}
          {selectedSettingsPresetId && (
            <div
              style={{
                display: 'inline-block',
                marginTop: '0.375rem',
                padding: '0.125rem 0.375rem',
                fontSize: '0.5625rem',
                fontFamily: 'var(--font-sans)',
                color: 'var(--text-muted)',
                backgroundColor: 'rgba(59, 130, 246, 0.15)',
                border: '1px solid rgba(59, 130, 246, 0.3)',
                borderRadius: 'var(--radius-sm)',
                textTransform: 'uppercase',
                letterSpacing: '0.03em',
              }}
            >
              Applied to new jobs only
            </div>
          )}
          {/* Phase 7A: Informational label with consistent terminology */}
          <div
            style={{
              fontSize: '0.625rem',
              color: 'var(--text-dim)',
              fontFamily: 'var(--font-sans)',
              fontStyle: 'italic',
              marginTop: '0.25rem',
            }}
          >
            {selectedSettingsPresetId 
              ? 'Preset snapshot is copied at job creation. Does not affect existing jobs.'
              : 'Job will use current settings from the Deliver panel.'
            }
          </div>
          {/* Phase 7A: Preset preview with grouped summary + raw JSON toggle */}
          {selectedPreset && (
            <div style={{ marginTop: '0.375rem' }}>
              <button
                onClick={() => setShowPresetPreview(!showPresetPreview)}
                style={{
                  background: 'rgba(255, 255, 255, 0.05)',
                  border: '1px solid var(--border-secondary)',
                  borderRadius: 'var(--radius-sm)',
                  color: 'var(--text-muted)',
                  padding: '0.25rem 0.5rem',
                  fontSize: '0.625rem',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.25rem',
                }}
              >
                <span style={{ transform: showPresetPreview ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.15s' }}>▶</span>
                {showPresetPreview ? 'Hide Preset Preview' : 'Show Preset Preview'}
              </button>
              {showPresetPreview && (
                <div style={{ marginTop: '0.25rem' }}>
                  {/* Phase 7A: Grouped summary view (if settings available) */}
                  {selectedPreset.settings_snapshot ? (
                    <PresetSummary settings={selectedPreset.settings_snapshot} />
                  ) : (
                    /* Fallback: basic info if no settings snapshot */
                    <div
                      style={{
                        padding: '0.5rem',
                        backgroundColor: 'rgba(0, 0, 0, 0.15)',
                        borderRadius: 'var(--radius-sm)',
                        fontSize: '0.625rem',
                        fontFamily: 'var(--font-mono)',
                        color: 'var(--text-secondary)',
                      }}
                    >
                      <div><strong>Name:</strong> {selectedPreset.name}</div>
                      {selectedPreset.description && <div><strong>Description:</strong> {selectedPreset.description}</div>}
                      <div><strong>Fingerprint:</strong> {selectedPreset.fingerprint.slice(0, 16)}...</div>
                    </div>
                  )}
                  {/* Phase 7A: Raw JSON toggle (collapsed by default) */}
                  {selectedPreset.settings_snapshot && (
                    <div style={{ marginTop: '0.375rem' }}>
                      <button
                        onClick={() => setShowRawSnapshot(!showRawSnapshot)}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: 'var(--text-dim)',
                          padding: '0.125rem 0',
                          fontSize: '0.5625rem',
                          cursor: 'pointer',
                          textDecoration: 'underline',
                        }}
                      >
                        {showRawSnapshot ? 'Hide raw snapshot' : 'View raw snapshot'}
                      </button>
                      {showRawSnapshot && (
                        <pre
                          style={{
                            margin: 0,
                            marginTop: '0.25rem',
                            padding: '0.5rem',
                            backgroundColor: 'rgba(0, 0, 0, 0.2)',
                            borderRadius: 'var(--radius-sm)',
                            fontSize: '0.5625rem',
                            fontFamily: 'var(--font-mono)',
                            color: 'var(--text-muted)',
                            lineHeight: 1.4,
                            overflow: 'auto',
                            maxHeight: '150px',
                            whiteSpace: 'pre-wrap',
                            wordBreak: 'break-all',
                          }}
                        >
                          {JSON.stringify(selectedPreset.settings_snapshot, null, 2)}
                        </pre>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Alpha: Engine Selection - FFmpeg only */}
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
            {/* Alpha: Only show available engines (FFmpeg) */}
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
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <input
              type="text"
              value={outputDirectory}
              onChange={(e) => onOutputDirectoryChange(e.target.value)}
              placeholder="/Users/yourname/Desktop/OUTPUT"
              disabled={loading}
              title="Paste output directory path or click Browse..."
              style={{
                flex: 1,
                padding: '0.375rem 0.5rem',
                fontSize: '0.75rem',
                fontFamily: 'var(--font-mono)',
                backgroundColor: 'var(--input-bg)',
                border: '1px solid var(--border-primary)',
                borderRadius: 'var(--radius-sm)',
                color: 'var(--text-primary)',
                outline: 'none',
              }}
            />
            {hasElectron && (
              <Button
                variant="secondary"
                size="sm"
                onClick={onSelectFolderClick}
                disabled={loading}
                style={{ whiteSpace: 'nowrap' }}
              >
                Browse...
              </Button>
            )}
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginTop: '0.375rem' }}>
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
            {outputDirectory && !pathFavorites.includes(outputDirectory) && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onAddFavorite(outputDirectory)}
                style={{ fontSize: '0.6875rem' }}
              >
                ★ Favorite
              </Button>
            )}
          </div>
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
            flexDirection: 'column',
            gap: '0.5rem',
          }}
        >
          {/* Design mode guard message */}
          {isDesignMode && (
            <div
              style={{
                fontSize: '0.75rem',
                color: 'var(--text-muted)',
                fontFamily: 'var(--font-sans)',
                fontStyle: 'italic',
                padding: '0.5rem',
                background: 'rgba(251, 191, 36, 0.1)',
                border: '1px solid rgba(251, 191, 36, 0.3)',
                borderRadius: 'var(--radius-sm)',
              }}
            >
              Exit design mode to queue jobs
            </div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <Button
                data-testid="add-to-queue-button"
                variant="primary"
                size="md"
                onClick={onCreateJob}
                disabled={!canCreate}
                loading={loading}
                title={validation.reason}
              >
                + Create Job
              </Button>
              <Button
                variant="secondary"
                size="md"
                onClick={onClear}
                disabled={loading}
                title="Clear selected files and output directory"
              >
                Clear
              </Button>
            </div>
            {/* Phase 9F: Show explicit feedback with reason */}
            <div
              style={{
                fontSize: '0.6875rem',
                color: canCreate ? 'var(--text-dim)' : 'var(--status-warning-fg, #f59e0b)',
                fontFamily: 'var(--font-sans)',
                fontStyle: 'italic',
              }}
            >
              {validation.reason}
            </div>
          </div>
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
          {hasElectron 
            ? 'Use Select Files, Browse folders, or drop media above'
            : 'Enter file paths above, use Browse folders, then click "Create Job"'
          }
        </div>
      </div>
    </div>
  )
}

export default CreateJobPanel
