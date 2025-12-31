/**
 * BurnInSelector — Burn-In Preset Selection Component
 *
 * A dropdown selector for burn-in presets with:
 * - Preset type badges (INDUSTRY / USER / DERIVED)
 * - Immutability indicators for industry presets
 * - Provenance tooltip for derived presets
 * - Grouping by preset type
 *
 * Schema Enforcement:
 * - Industry presets show lock icon and cannot be modified
 * - User presets show user icon and allow mutable field editing
 * - Derived presets show branch icon with parent reference
 *
 * ⚠️ ANTI-FEATURES (explicitly NOT implemented):
 * - Drag positioning
 * - Freeform text
 * - Per-job overrides
 */

import { useState, useRef, useEffect, useMemo } from 'react'

// ============================================================================
// TYPES
// ============================================================================

export type PresetType = 'industry' | 'user' | 'derived'

export interface BurnInPreset {
  id: string
  fields: string[]
  position: string
  text_opacity: number
  background_enabled: boolean
  background_opacity: number | null
  font_scale: string
  preset_type: PresetType
  derived_from?: string
  derived_at?: string
  locked_fields_modified?: string[]
}

export interface PresetBadgeInfo {
  label: string
  color: 'blue' | 'green' | 'orange'
  tooltip: string
  icon: 'lock' | 'user' | 'git-branch'
}

interface BurnInSelectorProps {
  presets: BurnInPreset[]
  selectedPresetId: string | null
  onSelectPreset: (id: string | null) => void
  disabled?: boolean
}

// ============================================================================
// BADGE CONFIGURATION
// ============================================================================

const BADGE_CONFIG: Record<PresetType, Omit<PresetBadgeInfo, 'tooltip'>> = {
  industry: {
    label: 'INDUSTRY',
    color: 'blue',
    icon: 'lock',
  },
  user: {
    label: 'USER',
    color: 'green',
    icon: 'user',
  },
  derived: {
    label: 'DERIVED',
    color: 'orange',
    icon: 'git-branch',
  },
}

const BADGE_COLORS: Record<PresetBadgeInfo['color'], { bg: string; text: string; border: string }> = {
  blue: {
    bg: 'rgba(59, 130, 246, 0.15)',
    text: 'rgb(96, 165, 250)',
    border: 'rgba(59, 130, 246, 0.3)',
  },
  green: {
    bg: 'rgba(34, 197, 94, 0.15)',
    text: 'rgb(74, 222, 128)',
    border: 'rgba(34, 197, 94, 0.3)',
  },
  orange: {
    bg: 'rgba(249, 115, 22, 0.15)',
    text: 'rgb(251, 146, 60)',
    border: 'rgba(249, 115, 22, 0.3)',
  },
}

// ============================================================================
// ICONS
// ============================================================================

function LockIcon({ size = 12 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="currentColor"
      aria-hidden="true"
    >
      <path
        fillRule="evenodd"
        d="M4 4a4 4 0 0 1 8 0v2h.25c.966 0 1.75.784 1.75 1.75v5.5A1.75 1.75 0 0 1 12.25 15h-8.5A1.75 1.75 0 0 1 2 13.25v-5.5C2 6.784 2.784 6 3.75 6H4V4Zm8.5 3.75a.25.25 0 0 0-.25-.25h-8.5a.25.25 0 0 0-.25.25v5.5c0 .138.112.25.25.25h8.5a.25.25 0 0 0 .25-.25v-5.5ZM10.5 6V4a2.5 2.5 0 1 0-5 0v2h5Z"
      />
    </svg>
  )
}

function UserIcon({ size = 12 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M10.561 8.073a6.005 6.005 0 0 1 3.432 5.142.75.75 0 1 1-1.498.07 4.5 4.5 0 0 0-8.99 0 .75.75 0 0 1-1.498-.07 6.004 6.004 0 0 1 3.432-5.142 3.999 3.999 0 1 1 5.123 0ZM10.5 5a2.5 2.5 0 1 0-5 0 2.5 2.5 0 0 0 5 0Z" />
    </svg>
  )
}

function GitBranchIcon({ size = 12 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M9.5 3.25a2.25 2.25 0 1 1 3 2.122V6A2.5 2.5 0 0 1 10 8.5H6a1 1 0 0 0-1 1v1.128a2.251 2.251 0 1 1-1.5 0V5.372a2.25 2.25 0 1 1 1.5 0v1.836A2.493 2.493 0 0 1 6 7h4a1 1 0 0 0 1-1v-.628A2.25 2.25 0 0 1 9.5 3.25Zm-6 0a.75.75 0 1 0 1.5 0 .75.75 0 0 0-1.5 0Zm8.25-.75a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5ZM4.25 12a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Z" />
    </svg>
  )
}

function ChevronDownIcon({ size = 16 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="currentColor"
      aria-hidden="true"
    >
      <path
        fillRule="evenodd"
        d="M4.22 6.22a.75.75 0 0 1 1.06 0L8 8.94l2.72-2.72a.75.75 0 1 1 1.06 1.06l-3.25 3.25a.75.75 0 0 1-1.06 0L4.22 7.28a.75.75 0 0 1 0-1.06Z"
      />
    </svg>
  )
}

// ============================================================================
// HELPER COMPONENTS
// ============================================================================

function PresetBadge({ preset }: { preset: BurnInPreset }) {
  const config = BADGE_CONFIG[preset.preset_type]
  const colors = BADGE_COLORS[config.color]

  const getTooltip = () => {
    switch (preset.preset_type) {
      case 'industry':
        return 'Industry standard preset — cannot be modified'
      case 'user':
        return 'User-created preset — mutable fields can be edited'
      case 'derived':
        return `Derived from: ${preset.derived_from}`
      default:
        return ''
    }
  }

  const IconComponent = {
    lock: LockIcon,
    user: UserIcon,
    'git-branch': GitBranchIcon,
  }[config.icon]

  return (
    <span
      data-testid={`preset-badge-${preset.id}`}
      title={getTooltip()}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.25rem',
        padding: '0.125rem 0.375rem',
        fontSize: '0.625rem',
        fontWeight: 600,
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
        backgroundColor: colors.bg,
        color: colors.text,
        border: `1px solid ${colors.border}`,
        borderRadius: '0.25rem',
        whiteSpace: 'nowrap',
      }}
    >
      <IconComponent size={10} />
      {config.label}
    </span>
  )
}

function PositionBadge({ position }: { position: string }) {
  const positionLabels: Record<string, string> = {
    TL: 'Top Left',
    TR: 'Top Right',
    BL: 'Bottom Left',
    BR: 'Bottom Right',
    TC: 'Top Center',
    BC: 'Bottom Center',
  }

  return (
    <span
      style={{
        fontSize: '0.625rem',
        color: 'var(--text-muted)',
        textTransform: 'uppercase',
      }}
    >
      {positionLabels[position] || position}
    </span>
  )
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function BurnInSelector({
  presets,
  selectedPresetId,
  onSelectPreset,
  disabled = false,
}: BurnInSelectorProps) {
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Group presets by type for display
  const { industryPresets, userPresets, derivedPresets } = useMemo(() => {
    const industry: BurnInPreset[] = []
    const user: BurnInPreset[] = []
    const derived: BurnInPreset[] = []

    for (const preset of presets) {
      switch (preset.preset_type) {
        case 'industry':
          industry.push(preset)
          break
        case 'user':
          user.push(preset)
          break
        case 'derived':
          derived.push(preset)
          break
      }
    }

    return { industryPresets: industry, userPresets: user, derivedPresets: derived }
  }, [presets])

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen])

  // Get selected preset info
  const selectedPreset = presets.find((p) => p.id === selectedPresetId)
  const displayName = selectedPreset ? selectedPreset.id : 'No burn-in preset'

  const handleSelect = (id: string | null) => {
    onSelectPreset(id)
    setIsOpen(false)
  }

  const renderPresetOption = (preset: BurnInPreset) => (
    <button
      key={preset.id}
      data-testid={`burnin-preset-option-${preset.id}`}
      onClick={() => handleSelect(preset.id)}
      style={{
        width: '100%',
        padding: '0.5rem 0.75rem',
        textAlign: 'left',
        background: selectedPresetId === preset.id ? 'rgba(59, 130, 246, 0.1)' : 'transparent',
        border: 'none',
        color: selectedPresetId === preset.id ? 'var(--button-primary-bg)' : 'var(--text-secondary)',
        fontSize: '0.75rem',
        fontFamily: 'var(--font-sans)',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '0.5rem',
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span style={{ fontWeight: 500 }}>{preset.id}</span>
          <PresetBadge preset={preset} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <PositionBadge position={preset.position} />
          <span style={{ fontSize: '0.625rem', color: 'var(--text-muted)' }}>
            {preset.fields.join(', ')}
          </span>
        </div>
      </div>
      {preset.preset_type === 'industry' && (
        <LockIcon size={14} />
      )}
    </button>
  )

  const renderGroup = (title: string, groupPresets: BurnInPreset[]) => {
    if (groupPresets.length === 0) return null

    return (
      <div key={title}>
        <div
          style={{
            padding: '0.375rem 0.75rem',
            fontSize: '0.625rem',
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            color: 'var(--text-muted)',
            borderBottom: '1px solid var(--border-subtle)',
          }}
        >
          {title}
        </div>
        {groupPresets.map(renderPresetOption)}
      </div>
    )
  }

  return (
    <div
      ref={dropdownRef}
      style={{ position: 'relative', width: '100%' }}
      data-testid="burnin-selector"
    >
      {/* Trigger button */}
      <button
        data-testid="burnin-selector-trigger"
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        style={{
          width: '100%',
          padding: '0.5rem 0.75rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '0.5rem',
          background: 'var(--input-bg)',
          border: '1px solid var(--input-border)',
          borderRadius: '0.375rem',
          color: disabled ? 'var(--text-muted)' : 'var(--text-primary)',
          fontSize: '0.75rem',
          fontFamily: 'var(--font-sans)',
          cursor: disabled ? 'not-allowed' : 'pointer',
          opacity: disabled ? 0.5 : 1,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span>{displayName}</span>
          {selectedPreset && <PresetBadge preset={selectedPreset} />}
        </div>
        <ChevronDownIcon size={14} />
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div
          data-testid="burnin-selector-dropdown"
          style={{
            position: 'absolute',
            top: 'calc(100% + 0.25rem)',
            left: 0,
            right: 0,
            maxHeight: '20rem',
            overflowY: 'auto',
            background: 'var(--dropdown-bg)',
            border: '1px solid var(--dropdown-border)',
            borderRadius: '0.375rem',
            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
            zIndex: 50,
          }}
        >
          {/* No preset option */}
          <button
            data-testid="burnin-preset-option-none"
            onClick={() => handleSelect(null)}
            style={{
              width: '100%',
              padding: '0.5rem 0.75rem',
              textAlign: 'left',
              background: selectedPresetId === null ? 'rgba(59, 130, 246, 0.1)' : 'transparent',
              border: 'none',
              borderBottom: '1px solid var(--border-subtle)',
              color: selectedPresetId === null ? 'var(--button-primary-bg)' : 'var(--text-muted)',
              fontSize: '0.75rem',
              fontFamily: 'var(--font-sans)',
              fontStyle: 'italic',
              cursor: 'pointer',
            }}
          >
            No burn-in preset
          </button>

          {/* Grouped presets */}
          {renderGroup('Industry Presets', industryPresets)}
          {renderGroup('User Presets', userPresets)}
          {renderGroup('Derived Presets', derivedPresets)}
        </div>
      )}
    </div>
  )
}

export default BurnInSelector
