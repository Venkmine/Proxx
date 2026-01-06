/**
 * Awaire Proxy UI Components
 * 
 * RATIONALE:
 * Forge is a deterministic proxy engine, not a media browser.
 * Component exports reflect the state-driven, deterministic UI model.
 */

// Core UI primitives
export { Button } from './Button'
export type { ButtonVariant, ButtonSize } from './Button'

export { Select } from './Select'

export { StatusBadge } from './StatusBadge'
export type { StatusType } from './StatusBadge'

export { StatBox } from './StatBox'

// Phase E: Queue UX improvements
export { ContextMenu } from './ContextMenu'
export type { ContextMenuItem } from './ContextMenu'

// Domain components
export { ClipRow } from './ClipRow'
export { JobGroup } from './JobGroup'
export { CreateJobPanel } from './CreateJobPanel'

// ============================================================================
// SOURCE SELECTION (OS-Native, State-Driven)
// ============================================================================
// These components implement the SourceSelectionState model.
// All behavior derives from the state enum, not ad-hoc boolean flags.

export { SourceSelectionPanel } from './SourceSelectionPanel'
export { NativeSourceSelector } from './NativeSourceSelector'
export { SourceList } from './SourceList'
export { SourceMetadataPanel } from './SourceMetadataPanel'
export { PreflightErrorBanner } from './PreflightErrorBanner'
export { OutputTab } from './OutputTab'
export type { OutputTabProps } from './OutputTab'

// ============================================================================
// PREFLIGHT VALIDATION
// ============================================================================
// Preflight is the ONLY transition from SELECTED_UNVALIDATED to READY.

export { PreflightSummary, canSubmitWithPreflight, getBlockingFailures } from './PreflightSummary'
export type { PreflightCheck, PreflightStatus, PreflightSummaryProps } from './PreflightSummary'
export { JobSubmitButton } from './JobSubmitButton'
export type { JobSummary, JobSubmitButtonProps } from './JobSubmitButton'

// Phase 17: Deliver Control Panel (replaces modal settings)
export { DeliverControlPanel } from './DeliverControlPanel'
export type { 
  DeliverSettings, 
  VideoSettings, 
  AudioSettings, 
  FileSettings, 
  MetadataSettings, 
  OverlaySettings, 
  TextOverlay,
  SelectionContext 
} from './DeliverControlPanel'

// Alpha: Preset Management
export { PresetManager } from './PresetManager'
export { PresetSelector } from './PresetSelector'
export type { Preset } from '../hooks/usePresets'

// Alpha: Naming Template Builder
export { TokenPalette } from './TokenPalette'

// Alpha: Text Burn-In Panel (legacy watermark)
export { TextBurnInPanel } from './TextBurnInPanel'

// Burn-In Preset Schema Enforcement
export { BurnInSelector } from './BurnInSelector'
export type { BurnInPreset, PresetType, PresetBadgeInfo } from './BurnInSelector'
export { BurnInEditor } from './BurnInEditor'

// Phase 23: Unified Visual Preview Modal
export { VisualPreviewModal } from './VisualPreviewModal'

// Phase 24: 4-Region Persistent Workspace Layout
export { WorkspaceLayout } from './WorkspaceLayout'
export { VisualPreviewWorkspace } from './VisualPreviewWorkspace'
export { CenterBottomPanel } from './CenterBottomPanel'

// Alpha: Preview & Processing Feedback
export { PreviewPanel } from './PreviewPanel'
export { JobProgressBar } from './JobProgressBar'
export type { JobProgress, JobStatus } from './JobProgressBar'

// Alpha: UX Cleanup — Volumes and Colour
export { VolumesPanel } from './VolumesPanel'
export type { Volume } from './VolumesPanel'
export { ColourPanel } from './ColourPanel'
export type { ColourSettings } from './ColourPanel'

// Attach Proxies Guidance (read-only info panel)
export { AttachProxiesInfoPanel } from './AttachProxiesInfoPanel'

// License Status (read-only observability)
export { LicenseStatusReadOnly } from './LicenseStatusReadOnly'

// Electron components
export { TitleBar } from './TitleBar'
