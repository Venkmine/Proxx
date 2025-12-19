/**
 * Proxx UI Components
 * 
 * Reusable component library for the Proxx Operator Control interface.
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

// Electron components
export { TitleBar } from './TitleBar'
