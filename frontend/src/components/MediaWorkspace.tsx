/**
 * MediaWorkspace — Unified Left Sidebar for Source Selection
 * 
 * UX TRUTHFULNESS PASS:
 * - Removed misleading Browse tab (was just another path to OS dialogs)
 * - Single-purpose panel: Source selection via OS-native dialogs
 * - Shows selected sources, preflight summary, and Create Job
 * 
 * RATIONALE:
 * - macOS system volumes are not safely enumerable
 * - Native dialogs are the only correct solution
 * - Matches industry-standard NLE behavior (Premiere, Resolve, etc.)
 * 
 * Structure:
 * - Source selection buttons (Files / Folder via OS dialogs)
 * - Selected sources list
 * - Preflight summary
 * - Create Job button
 * 
 * NO nested scroll traps. NO fixed heights.
 */

import { CreateJobPanel } from './CreateJobPanel'
import { SourceMetadataPanel } from './SourceMetadataPanel'
import { OutputTab } from './OutputTab'
import type { WorkspaceMode } from '../stores/workspaceModeStore'
import type { DeliverSettings } from './DeliverControlPanel'
import { SourceSelectionState } from '../stores/sourceSelectionStore'
import type { AppMode } from '../types/appMode'

// Phase 16: Engine info
interface EngineInfo {
  type: string
  name: string
  available: boolean
}

// Phase 7B: Preset scope type
type PresetScope = 'user' | 'workspace'

// Phase 6: Settings preset info
interface SettingsPresetInfo {
  id: string
  name: string
  description?: string
  scope?: PresetScope
  fingerprint: string
  settings_snapshot?: DeliverSettings
}

interface MediaWorkspaceProps {
  // File selection
  selectedFiles: string[]
  onFilesChange: (files: string[]) => void
  onSelectFilesClick: () => void
  
  // Engine selection
  engines: EngineInfo[]
  selectedEngine: string
  onEngineChange: (engine: string) => void
  
  // Settings preset selection
  settingsPresets: SettingsPresetInfo[]
  selectedSettingsPresetId: string | null
  onSettingsPresetChange: (presetId: string | null) => void
  
  // Output directory
  outputDirectory: string
  onOutputDirectoryChange: (dir: string) => void
  onSelectFolderClick: () => void
  
  // Favorites
  pathFavorites: string[]
  onAddFavorite: (path: string) => void
  onRemoveFavorite: (path: string) => void
  
  folderFavorites: string[]
  onAddFolderFavorite: (path: string) => void
  onRemoveFolderFavorite: (path: string) => void
  
  // Actions
  onCreateJob: () => void
  onClear: () => void
  
  // State
  loading: boolean
  hasElectron: boolean
  workspaceMode: WorkspaceMode
  appMode?: AppMode
  
  // Submit intent tracking for error gating
  hasSubmitIntent?: boolean
  
  // V2 Thin Client: Lock inputs when JobSpec is submitted
  v2JobSpecSubmitted?: boolean
}

export function MediaWorkspace({
  selectedFiles,
  onFilesChange,
  onSelectFilesClick,
  engines,
  selectedEngine,
  onEngineChange,
  settingsPresets,
  selectedSettingsPresetId,
  onSettingsPresetChange,
  outputDirectory,
  onOutputDirectoryChange,
  onSelectFolderClick,
  pathFavorites,
  onAddFavorite,
  onRemoveFavorite,
  onCreateJob,
  onClear,
  loading,
  hasElectron,
  workspaceMode,
  appMode = 'idle',
  hasSubmitIntent = false,
  v2JobSpecSubmitted = false,
}: MediaWorkspaceProps) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        minHeight: 0, // Enable flex shrinking for proper scrolling
        overflow: 'hidden',
      }}
    >
      {/* Panel Header — Sources */}
      <div
        style={{
          padding: '0.75rem 1rem',
          borderBottom: '1px solid var(--border-primary)',
          backgroundColor: 'var(--bg-secondary)',
        }}
      >
        <h2
          style={{
            margin: 0,
            fontSize: '0.8125rem',
            fontWeight: 600,
            color: 'var(--text-primary)',
            textTransform: 'uppercase',
            letterSpacing: '0.02em',
          }}
        >
          Sources
        </h2>
      </div>

      {/* Content — CreateJobPanel */}
      <div
        style={{
          flex: 1,
          minHeight: 0,
          overflow: 'auto',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <CreateJobPanel
          isVisible={true}
          onToggleVisibility={() => {}}
          selectedFiles={selectedFiles}
          onFilesChange={onFilesChange}
          onSelectFilesClick={onSelectFilesClick}
          engines={engines}
          selectedEngine={selectedEngine}
          onEngineChange={onEngineChange}
          settingsPresets={settingsPresets}
          selectedSettingsPresetId={selectedSettingsPresetId}
          onSettingsPresetChange={onSettingsPresetChange}
          outputDirectory={outputDirectory}
          onOutputDirectoryChange={onOutputDirectoryChange}
          onSelectFolderClick={onSelectFolderClick}
          pathFavorites={pathFavorites}
          onAddFavorite={onAddFavorite}
          onRemoveFavorite={onRemoveFavorite}
          onCreateJob={onCreateJob}
          onClear={onClear}
          loading={loading}
          hasElectron={hasElectron}
          workspaceMode={workspaceMode}
          appMode={appMode}
          hasSubmitIntent={hasSubmitIntent}
          // V2 Thin Client: Lock inputs when JobSpec is submitted
          v2JobSpecSubmitted={v2JobSpecSubmitted}
        />
      </div>

      {/* Output Tab — Output configuration (skeleton only) */}
      <OutputTab />

      {/* Metadata Panel — Always visible below content */}
      <SourceMetadataPanel
        selectionState={selectedFiles.length > 0 ? SourceSelectionState.SELECTED_UNVALIDATED : SourceSelectionState.EMPTY}
        preflightMetadata={null}
      />
    </div>
  )
}
