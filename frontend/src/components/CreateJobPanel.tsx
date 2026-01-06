// Alpha scope defined in docs/ALPHA_REALITY.md.
// Do not add features that contradict it without updating that file first.

/**
 * CreateJobPanel - Hardened Job Creation UX with Preflight Enforcement.
 * 
 * ⚠️ VERIFY GUARD:
 * Any change to this component requires Playwright coverage.
 * Tests: qa/verify/ui/proxy/create_job.spec.ts
 *        qa/verify/ui/proxy/validation_errors.spec.ts
 * Run: make verify-ui before committing changes.
 * 
 * LAYOUT (STRICT VERTICAL ORDER):
 * 1. SOURCE - Input paths, file discovery summary
 * 2. PROCESSING (collapsed by default) - Profile, burn-in, LUT, engine
 * 3. PREFLIGHT SUMMARY (mandatory, always visible)
 * 
 * NOTE: Output/Delivery configuration is in the CENTER BOTTOM PANEL (Delivery tab),
 * not in the left panel. This panel is SOURCES ONLY.
 * 
 * SUBMIT RULES:
 * - If ANY ❌ exists: Submit button is HIDDEN
 * - If only ⚠ exists: Submit allowed, warnings visible
 * - On submit: Show immutable job summary, require explicit confirmation
 * 
 * DESIGN PRINCIPLES:
 * - Users must know EXACTLY what will happen before submit
 * - All failures must surface BEFORE job creation
 * - No hidden defaults
 * - No optimistic submission
 * - No modal popups for validation
 * - All errors are inline and persistent
 */

import { useState, useMemo } from 'react'
import { Button } from './Button'
import { Select } from './Select'
import { PreflightSummary, type PreflightCheck } from './PreflightSummary'
import { JobSubmitButton, type JobSummary } from './JobSubmitButton'
import type { WorkspaceMode } from '../stores/workspaceModeStore'
import type { DeliverSettings } from './DeliverControlPanel'
import type { AppMode } from '../types/appMode'

// =============================================================================
// Path Validation
// =============================================================================

function isAbsolutePath(path: string): boolean {
  return path.startsWith('/') || /^[a-zA-Z]:[\\/]/.test(path)
}

// =============================================================================
// Types
// =============================================================================

interface EngineInfo {
  type: string
  name: string
  available: boolean
}

interface ProxyProfileInfo {
  id: string
  name: string
  description?: string
  engine: 'ffmpeg' | 'resolve'
}

interface BurnInRecipeInfo {
  id: string
  name: string
}

interface LutInfo {
  id: string
  name: string
  path: string
}

interface FileDiscoverySummary {
  totalFiles: number
  rawCount: number
  nonRawCount: number
  imageSequenceCount: number
  mixedSources: boolean
}

// Legacy preset type for backward compatibility
interface SettingsPresetInfo {
  id: string
  name: string
  description?: string
  scope?: 'user' | 'workspace'
  fingerprint: string
  settings_snapshot?: DeliverSettings
}

interface CreateJobPanelProps {
  isVisible: boolean
  onToggleVisibility: () => void
  
  // File selection
  selectedFiles: string[]
  onFilesChange: (files: string[]) => void
  onSelectFilesClick: () => void
  onFilesDropped?: (paths: string[]) => void
  
  // File discovery (computed externally for display)
  fileDiscovery?: FileDiscoverySummary
  
  // Engine info
  engines?: EngineInfo[]
  selectedEngine?: string
  onEngineChange?: (engine: string) => void
  
  // Proxy profiles
  proxyProfiles?: ProxyProfileInfo[]
  selectedProxyProfileId?: string | null
  onProxyProfileChange?: (profileId: string | null) => void
  
  // Burn-in recipes
  burnInRecipes?: BurnInRecipeInfo[]
  selectedBurnInRecipeId?: string | null
  onBurnInRecipeChange?: (recipeId: string | null) => void
  
  // LUTs
  luts?: LutInfo[]
  selectedLutId?: string | null
  onLutChange?: (lutId: string | null) => void
  
  // Favorites (kept for future use if needed)
  pathFavorites?: string[]
  onAddFavorite?: (path: string) => void
  onRemoveFavorite?: (path: string) => void
  
  // Actions
  onCreateJob: () => void
  onClear: () => void
  
  // State
  loading?: boolean
  hasElectron?: boolean
  workspaceMode?: WorkspaceMode
  
  // Preflight data (computed externally)
  preflightChecks?: PreflightCheck[]
  preflightLoading?: boolean
  
  // App mode for preflight rendering
  appMode?: AppMode
  
  // Submit intent tracking for error gating
  hasSubmitIntent?: boolean
  
  // V2 lock state
  v2JobSpecSubmitted?: boolean
  
  // DEPRECATED - kept for compatibility
  settingsPresets?: SettingsPresetInfo[]
  selectedSettingsPresetId?: string | null
  onSettingsPresetChange?: (presetId: string | null) => void
  backendUrl?: string
}

// =============================================================================
// Section Components
// =============================================================================

interface SectionProps {
  title: string
  children: React.ReactNode
  collapsed?: boolean
  onToggle?: () => void
  collapsible?: boolean
  testId?: string
  badge?: React.ReactNode
}

function Section({ title, children, collapsed = false, onToggle, collapsible = false, testId, badge }: SectionProps) {
  return (
    <div
      data-testid={testId}
      style={{
        borderBottom: '1px solid var(--border-secondary)',
        paddingBottom: '1rem',
        marginBottom: '1rem',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: collapsed ? 0 : '0.75rem',
          cursor: collapsible ? 'pointer' : 'default',
        }}
        onClick={collapsible ? onToggle : undefined}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          {collapsible && (
            <span
              style={{
                fontSize: '0.625rem',
                color: 'var(--text-muted)',
                transform: collapsed ? 'rotate(0deg)' : 'rotate(90deg)',
                transition: 'transform 0.15s',
              }}
            >
              ▶
            </span>
          )}
          <h3
            style={{
              margin: 0,
              fontSize: '0.8125rem',
              fontFamily: 'var(--font-sans)',
              fontWeight: 600,
              color: 'var(--text-primary)',
              letterSpacing: '-0.01em',
              textTransform: 'uppercase',
            }}
          >
            {title}
          </h3>
          {badge}
        </div>
      </div>
      {!collapsed && <div>{children}</div>}
    </div>
  )
}

// =============================================================================
// Main Component
// =============================================================================

export function CreateJobPanel({
  isVisible,
  onToggleVisibility,
  selectedFiles,
  onFilesChange,
  onSelectFilesClick,
  onFilesDropped,
  fileDiscovery,
  engines = [],
  selectedEngine = 'ffmpeg',
  onEngineChange,
  proxyProfiles = [],
  selectedProxyProfileId = null,
  onProxyProfileChange,
  burnInRecipes = [],
  selectedBurnInRecipeId = null,
  onBurnInRecipeChange,
  luts = [],
  selectedLutId = null,
  onLutChange,
  pathFavorites,
  onAddFavorite,
  onRemoveFavorite,
  onCreateJob,
  onClear,
  loading = false,
  hasElectron = false,
  workspaceMode = 'configure',
  preflightChecks = [],
  preflightLoading = false,
  appMode = 'idle',
  hasSubmitIntent = false,
  v2JobSpecSubmitted = false,
}: CreateJobPanelProps) {
  // Web mode path prompt
  const [droppedFileNames, setDroppedFileNames] = useState<string[]>([])
  const [showPathPrompt, setShowPathPrompt] = useState(false)
  const [pathPromptValue, setPathPromptValue] = useState('')
  
  // Output directory validation removed - now handled in Delivery panel (center bottom)

  const isDesignMode = workspaceMode === 'design'

  // Compute preflight checks if not provided externally
  const computedPreflightChecks = useMemo<PreflightCheck[]>(() => {
    if (preflightChecks.length > 0) return preflightChecks

    const checks: PreflightCheck[] = []

    // Source validation
    if (selectedFiles.length === 0) {
      checks.push({
        id: 'sources-required',
        label: 'Source Files',
        status: 'fail',
        message: 'At least one source file is required',
      })
    } else {
      const invalidPaths = selectedFiles.filter(p => !isAbsolutePath(p))
      if (invalidPaths.length > 0) {
        checks.push({
          id: 'sources-absolute',
          label: 'Source Paths',
          status: 'fail',
          message: `${invalidPaths.length} path(s) are not absolute`,
          detail: invalidPaths[0],
        })
      } else {
        checks.push({
          id: 'sources-valid',
          label: 'Source Files',
          status: 'pass',
          message: `${selectedFiles.length} file(s) selected`,
        })
      }
    }

    // Mixed source warning
    if (fileDiscovery?.mixedSources) {
      checks.push({
        id: 'sources-mixed',
        label: 'Mixed Source Types',
        status: 'warning',
        message: `Job contains ${fileDiscovery.rawCount} RAW + ${fileDiscovery.nonRawCount} non-RAW files`,
      })
    }

    // Output validation removed - now handled in Delivery panel (center bottom)

    // Engine availability
    const selectedEngineInfo = engines.find(e => e.type === selectedEngine)
    if (!selectedEngineInfo) {
      checks.push({
        id: 'engine-selected',
        label: 'Execution Engine',
        status: 'fail',
        message: 'No execution engine selected',
      })
    } else if (!selectedEngineInfo.available) {
      checks.push({
        id: 'engine-available',
        label: 'Execution Engine',
        status: 'fail',
        message: `${selectedEngineInfo.name} is not available`,
      })
    } else {
      checks.push({
        id: 'engine-valid',
        label: 'Execution Engine',
        status: 'pass',
        message: selectedEngineInfo.name,
      })
    }

    // Design mode check
    if (isDesignMode) {
      checks.push({
        id: 'design-mode',
        label: 'Workspace Mode',
        status: 'fail',
        message: 'Cannot create jobs in Design mode',
      })
    }

    // V2 lock check
    if (v2JobSpecSubmitted) {
      checks.push({
        id: 'v2-locked',
        label: 'V2 Execution',
        status: 'fail',
        message: 'V2 execution in progress — inputs locked',
      })
    }

    return checks
  }, [
    selectedFiles,
    engines,
    selectedEngine,
    fileDiscovery,
    isDesignMode,
    v2JobSpecSubmitted,
    preflightChecks,
  ])

  // Build job summary for confirmation
  const jobSummary: JobSummary = useMemo(() => {
    const profile = proxyProfiles.find(p => p.id === selectedProxyProfileId)
    const burnIn = burnInRecipes.find(r => r.id === selectedBurnInRecipeId)
    const lut = luts.find(l => l.id === selectedLutId)
    const engine = engines.find(e => e.type === selectedEngine)

    return {
      sourceCount: selectedFiles.length,
      sourcePaths: selectedFiles,
      outputDirectory: '(see Delivery panel)',
      proxyProfile: profile?.name || selectedProxyProfileId || 'Default',
      engine: engine?.name || selectedEngine || 'FFmpeg',
      burnInRecipe: burnIn?.name,
      lut: lut?.name,
    }
  }, [
    selectedFiles,
    proxyProfiles,
    selectedProxyProfileId,
    burnInRecipes,
    selectedBurnInRecipeId,
    luts,
    selectedLutId,
    engines,
    selectedEngine,
  ])

  // Handler for path prompt confirmation
  const handlePathPromptConfirm = () => {
    const path = pathPromptValue.trim()
    if (path && isAbsolutePath(path)) {
      onFilesChange([path])
      setShowPathPrompt(false)
      setDroppedFileNames([])
      setPathPromptValue('')
    }
  }

  if (!isVisible) {
    return null
  }

  return (
    <div
      data-testid="create-job-panel"
      data-has-sources={selectedFiles.length > 0}
      style={{
        padding: '1.25rem 1.5rem',
        borderBottom: '1px solid var(--border-primary)',
        background: 'linear-gradient(180deg, rgba(26, 32, 44, 0.95) 0%, rgba(20, 24, 32, 0.95) 100%)',
        position: 'relative',
        flexShrink: 0,
        maxHeight: '80vh',
        overflowY: 'auto',
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
                onClick={() => { setShowPathPrompt(false); setDroppedFileNames([]) }}
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

      {/* Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '1rem',
          paddingBottom: '0.75rem',
          borderBottom: '1px solid var(--border-secondary)',
        }}
      >
        <h2
          style={{
            margin: 0,
            fontSize: '1rem',
            fontFamily: 'var(--font-sans)',
            fontWeight: 600,
            color: 'var(--text-primary)',
            letterSpacing: '-0.01em',
          }}
        >
          Create Job
        </h2>
        
        <div style={{ display: 'flex', gap: '0.375rem' }}>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClear}
            disabled={loading}
            title="Clear all fields"
          >
            Clear
          </Button>
        </div>
      </div>

      {/* ================================================================= */}
      {/* SECTION 1: SOURCE */}
      {/* ================================================================= */}
      <Section 
        title="Source" 
        testId="section-source"
        badge={
          selectedFiles.length > 0 ? (
            <span
              style={{
                fontSize: '0.625rem',
                fontFamily: 'var(--font-mono)',
                color: 'var(--text-muted)',
                background: 'rgba(59, 130, 246, 0.1)',
                padding: '0.125rem 0.375rem',
                borderRadius: 'var(--radius-sm)',
              }}
            >
              {selectedFiles.length} file{selectedFiles.length > 1 ? 's' : ''}
            </span>
          ) : undefined
        }
      >
        {/* File Input */}
        <div style={{ marginBottom: '0.75rem' }}>
          <label
            style={{
              display: 'block',
              fontSize: '0.6875rem',
              fontWeight: 500,
              color: 'var(--text-muted)',
              marginBottom: '0.25rem',
              fontFamily: 'var(--font-sans)',
              textTransform: 'uppercase',
              letterSpacing: '0.03em',
            }}
          >
            Input Path(s) *
          </label>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            {hasElectron ? (
              <Button
                variant="secondary"
                size="sm"
                data-testid="select-files-button"
                onClick={async () => {
                  console.log('[SELECT FILES CLICKED]')
                  console.log('[CreateJobPanel] About to call onSelectFilesClick')
                  try {
                    await onSelectFilesClick()
                    console.log('[CreateJobPanel] onSelectFilesClick returned')
                  } catch (err) {
                    console.error('[CreateJobPanel] Error calling onSelectFilesClick:', err)
                  }
                }}
                disabled={loading}
              >
                Select Files...
              </Button>
            ) : (
              <input
                type="text"
                data-testid="file-path-input"
                placeholder="/Users/yourname/path/to/video.mp4"
                disabled={loading}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    const input = e.target as HTMLInputElement
                    const path = input.value.trim()
                    if (path) {
                      onFilesChange([path])
                      input.value = ''
                    }
                  }
                }}
                style={{
                  flex: 1,
                  padding: '0.5rem 0.75rem',
                  fontSize: '0.75rem',
                  fontFamily: 'var(--font-mono)',
                  backgroundColor: 'var(--input-bg)',
                  border: '1px solid var(--border-primary)',
                  borderRadius: 'var(--radius-sm)',
                  color: 'var(--text-primary)',
                  outline: 'none',
                }}
              />
            )}
          </div>
        </div>

        {/* Selected Files List */}
        {selectedFiles.length > 0 && (
          <div
            data-testid="source-list"
            data-source-count={selectedFiles.length}
            style={{
              maxHeight: '80px',
              overflow: 'auto',
              padding: '0.5rem',
              backgroundColor: 'rgba(0, 0, 0, 0.15)',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border-secondary)',
              marginBottom: '0.75rem',
            }}
          >
            {/* Indicator for QC state detection */}
            <div data-testid="sources-loaded-indicator" style={{ position: 'absolute', width: 0, height: 0, opacity: 0, pointerEvents: 'none' }} />
            {selectedFiles.map((f, i) => (
              <div
                key={i}
                style={{
                  fontSize: '0.6875rem',
                  fontFamily: 'var(--font-mono)',
                  color: 'var(--text-secondary)',
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

        {/* File Discovery Summary */}
        {fileDiscovery && (
          <div
            data-testid="file-discovery-summary"
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(4, 1fr)',
              gap: '0.5rem',
              padding: '0.5rem',
              background: 'rgba(0, 0, 0, 0.1)',
              borderRadius: 'var(--radius-sm)',
            }}
          >
            <DiscoveryStat label="Total" value={fileDiscovery.totalFiles} />
            <DiscoveryStat label="RAW" value={fileDiscovery.rawCount} highlight={fileDiscovery.rawCount > 0} />
            <DiscoveryStat label="Non-RAW" value={fileDiscovery.nonRawCount} />
            <DiscoveryStat label="Sequences" value={fileDiscovery.imageSequenceCount} />
          </div>
        )}

        {/* Mixed Source Warning */}
        {fileDiscovery?.mixedSources && (
          <div
            style={{
              marginTop: '0.5rem',
              padding: '0.375rem 0.5rem',
              background: 'rgba(245, 158, 11, 0.1)',
              border: '1px solid rgba(245, 158, 11, 0.3)',
              borderRadius: 'var(--radius-sm)',
              fontSize: '0.625rem',
              fontFamily: 'var(--font-sans)',
              color: 'var(--status-warning-fg, #f59e0b)',
            }}
          >
            ⚠ Mixed RAW + non-RAW sources detected
          </div>
        )}
      </Section>

      {/* ================================================================= */}
      {/* SECTION 2: ENGINE (read-only display) */}
      {/* Processing settings (codec/container/audio) are in Settings panel */}
      {/* Output/Delivery configuration is in the CENTER BOTTOM PANEL */}
      {/* ================================================================= */}
      <Section
        title="Execution Engine"
        testId="engine-section"
      >
        <div
          style={{
            padding: '0.5rem 0.75rem',
            background: 'rgba(0, 0, 0, 0.15)',
            borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--border-secondary)',
          }}
        >
          <div
            style={{
              fontSize: '0.75rem',
              fontFamily: 'var(--font-sans)',
              color: 'var(--text-primary)',
              fontWeight: 500,
            }}
          >
            {engines.find(e => e.type === selectedEngine)?.name || selectedEngine || 'FFmpeg'}
          </div>
          <div
            style={{
              fontSize: '0.625rem',
              fontFamily: 'var(--font-sans)',
              color: 'var(--text-dim)',
              marginTop: '0.25rem',
            }}
          >
            Configure codec & container in Settings \u2192
          </div>
        </div>
      </Section>

      {/* ================================================================= */}
      {/* SECTION 4: PREFLIGHT SUMMARY (mandatory, always visible) */}
      {/* Rendering is gated by appMode — no red errors on initial launch */}
      {/* ================================================================= */}
      
      <PreflightSummary 
        checks={computedPreflightChecks} 
        loading={preflightLoading}
        appMode={appMode}
        hasSubmitIntent={hasSubmitIntent}
      />

      {/* ================================================================= */}
      {/* SUBMIT BUTTON — REMOVED */}
      {/* Create Job authority unified to right panel (Queue area) */}
      {/* ================================================================= */}
    </div>
  )
}

// =============================================================================
// Helper Components
// =============================================================================

interface DiscoveryStatProps {
  label: string
  value: number
  highlight?: boolean
}

function DiscoveryStat({ label, value, highlight = false }: DiscoveryStatProps) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div
        style={{
          fontSize: '1rem',
          fontFamily: 'var(--font-mono)',
          fontWeight: 600,
          color: highlight ? 'var(--button-primary-bg)' : 'var(--text-primary)',
        }}
      >
        {value}
      </div>
      <div
        style={{
          fontSize: '0.5625rem',
          fontFamily: 'var(--font-sans)',
          color: 'var(--text-muted)',
          textTransform: 'uppercase',
          letterSpacing: '0.03em',
        }}
      >
        {label}
      </div>
    </div>
  )
}

export default CreateJobPanel
