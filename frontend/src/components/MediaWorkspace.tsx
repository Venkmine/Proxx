/**
 * MediaWorkspace — Tabbed Left Sidebar for Browse/Loaded Media
 * 
 * PHASE: OS-NATIVE SOURCE SELECTION
 * - Replaced DirectoryNavigator with OS-native file picker
 * - No recursive filesystem traversal
 * - No custom directory tree
 * - Eliminates UI hangs on /Volumes and network mounts
 * 
 * RATIONALE:
 * - macOS system volumes are not safely enumerable
 * - Native dialogs are the only correct solution
 * - Matches industry-standard NLE behavior (Premiere, Resolve, etc.)
 * 
 * Structure:
 * - Browse: OS-native file/folder selection (NativeSourceSelector)
 * - Loaded Media: Current job sources (CreateJobPanel)
 * 
 * Enforces proper scrolling with flex layout:
 * - Container: display: flex, flex-direction: column, min-height: 0
 * - Active tab content: flex: 1, overflow-y: auto
 * 
 * NO nested scroll traps. NO fixed heights.
 */

import { useState } from 'react'
import { CreateJobPanel } from './CreateJobPanel'
import { NativeSourceSelector } from './NativeSourceSelector'
import { SourceMetadataPanel } from './SourceMetadataPanel'
import type { WorkspaceMode } from '../stores/workspaceModeStore'
import type { DeliverSettings } from './DeliverControlPanel'
import { SourceSelectionState } from '../stores/sourceSelectionStore'

type MediaTab = 'loaded' | 'browse'

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
  onCreateJobFromFiles: (paths: string[]) => Promise<void>
  onCreateJobFromFolder: (path: string) => Promise<void>
  onClear: () => void
  
  // State
  loading: boolean
  hasElectron: boolean
  backendUrl: string
  workspaceMode: WorkspaceMode
  
  // Preview source
  previewSourcePath?: string
  
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
  folderFavorites,
  onAddFolderFavorite,
  onRemoveFolderFavorite,
  onCreateJob,
  onCreateJobFromFiles,
  onCreateJobFromFolder,
  onClear,
  loading,
  hasElectron,
  backendUrl,
  workspaceMode,
  previewSourcePath,
  v2JobSpecSubmitted = false,
}: MediaWorkspaceProps) {
  const [activeTab, setActiveTab] = useState<MediaTab>('loaded')

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
      {/* Tab Header */}
      <div
        style={{
          display: 'flex',
          borderBottom: '1px solid var(--border-primary)',
          backgroundColor: 'var(--bg-secondary)',
        }}
      >
        <button
          onClick={() => setActiveTab('loaded')}
          style={{
            flex: 1,
            padding: '8px 12px',
            border: 'none',
            backgroundColor: activeTab === 'loaded' ? 'var(--bg-primary)' : 'transparent',
            color: activeTab === 'loaded' ? 'var(--text-primary)' : 'var(--text-secondary)',
            cursor: 'pointer',
            fontWeight: activeTab === 'loaded' ? 600 : 400,
            fontSize: '13px',
            borderBottom: activeTab === 'loaded' ? '2px solid var(--accent-primary)' : 'none',
            transition: 'all 0.15s ease',
          }}
        >
          Loaded Media
        </button>
        <button
          onClick={() => setActiveTab('browse')}
          style={{
            flex: 1,
            padding: '8px 12px',
            border: 'none',
            backgroundColor: activeTab === 'browse' ? 'var(--bg-primary)' : 'transparent',
            color: activeTab === 'browse' ? 'var(--text-primary)' : 'var(--text-secondary)',
            cursor: 'pointer',
            fontWeight: activeTab === 'browse' ? 600 : 400,
            fontSize: '13px',
            borderBottom: activeTab === 'browse' ? '2px solid var(--accent-primary)' : 'none',
            transition: 'all 0.15s ease',
          }}
        >
          Browse
        </button>
      </div>

      {/* Tab Content — Always scrollable */}
      <div
        style={{
          flex: 1,
          minHeight: 0,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {activeTab === 'loaded' && (
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
              // V2 Thin Client: Lock inputs when JobSpec is submitted
              v2JobSpecSubmitted={v2JobSpecSubmitted}
            />
          </div>
        )}

        {activeTab === 'browse' && (
          <div
            style={{
              flex: 1,
              minHeight: 0,
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <NativeSourceSelector
              onFilesSelected={async (paths) => {
                // Add files to current selection
                await onCreateJobFromFiles(paths)
              }}
              onFolderSelected={async (path) => {
                // Create job from folder
                await onCreateJobFromFolder(path)
              }}
              backendUrl={backendUrl}
              recentPaths={pathFavorites}
              favorites={folderFavorites}
              onAddFavorite={onAddFolderFavorite}
              onRemoveFavorite={onRemoveFolderFavorite}
              hasElectron={hasElectron}
            />
          </div>
        )}
      </div>

      {/* Metadata Panel — Always visible below tabs */}
      <SourceMetadataPanel
        selectionState={selectedFiles.length > 0 ? SourceSelectionState.SELECTED_UNVALIDATED : SourceSelectionState.EMPTY}
        preflightMetadata={null}
      />
    </div>
  )
}
