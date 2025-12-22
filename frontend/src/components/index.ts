/**
 * Awaire Proxy UI Components
 * 
 * Reusable component library for the Awaire Proxy Operator Control interface.
 * Implements operator-first design inspired by DaVinci Resolve's Render Queue.
 */

// Core UI primitives
export { Button } from './Button'
export type { ButtonVariant, ButtonSize } from './Button'

export { Select } from './Select'

export { StatusBadge } from './StatusBadge'
export type { StatusType } from './StatusBadge'

export { StatBox } from './StatBox'

// Domain components
export { ClipRow } from './ClipRow'
export { JobGroup } from './JobGroup'
export { CreateJobPanel } from './CreateJobPanel'

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

// Alpha: Watermark & Burn-In Panels
export { TextBurnInPanel } from './TextBurnInPanel'
export { ImageOverlayPanel } from './ImageOverlayPanel'

// Phase 23: Unified Visual Preview Modal
export { VisualPreviewModal } from './VisualPreviewModal'

// Phase 24: 4-Region Persistent Workspace Layout
export { WorkspaceLayout } from './WorkspaceLayout'
export { VisualPreviewWorkspace } from './VisualPreviewWorkspace'

// Alpha: Preview & Processing Feedback
export { PreviewPanel } from './PreviewPanel'
export { JobProgressBar } from './JobProgressBar'
export type { JobProgress, JobStatus } from './JobProgressBar'

// Alpha: UX Cleanup — Volumes and Colour
export { VolumesPanel } from './VolumesPanel'
export type { Volume } from './VolumesPanel'
export { ColourPanel } from './ColourPanel'
export type { ColourSettings } from './ColourPanel'

// Electron components
export { TitleBar } from './TitleBar'
