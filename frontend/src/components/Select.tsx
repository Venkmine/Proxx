import React, { useState } from 'react'

/**
 * Select/Dropdown component - visually distinct from buttons.
 * 
 * Phase 16 Design Requirements:
 * - DO NOT span full window width
 * - Fixed max width (420–480px)
 * - Strong visual affordance for arrow
 * - Subtle gradient background
 * - Clear focus ring
 */

interface SelectOption {
  value: string
  label: string
}

interface SelectProps {
  value: string
  onChange: (value: string) => void
  options: SelectOption[]
  placeholder?: string
  disabled?: boolean
  fullWidth?: boolean
  size?: 'sm' | 'md'
  style?: React.CSSProperties
  'data-testid'?: string
}

export function Select({
  value,
  onChange,
  options,
  placeholder = 'Select...',
  disabled = false,
  fullWidth = false,
  size = 'md',
  style,
  'data-testid': testId,
}: SelectProps) {
  const [isFocused, setIsFocused] = useState(false)
  const [isHovered, setIsHovered] = useState(false)
  
  const sizeStyles = {
    sm: {
      padding: '0.375rem 2.25rem 0.375rem 0.75rem',
      fontSize: '0.75rem',
    },
    md: {
      padding: '0.5rem 2.75rem 0.5rem 1rem',
      fontSize: '0.8125rem',
    },
  }

  const baseStyle: React.CSSProperties = {
    fontFamily: 'var(--font-sans)',
    fontWeight: 500,
    letterSpacing: '-0.01em',
    // Gradient background instead of flat
    background: isHovered 
      ? 'linear-gradient(180deg, rgba(51, 65, 85, 0.5) 0%, rgba(30, 41, 59, 0.7) 100%)'
      : 'linear-gradient(180deg, rgba(30, 41, 59, 0.4) 0%, rgba(20, 22, 26, 0.6) 100%)',
    color: value ? 'var(--text-primary)' : 'var(--text-muted)',
    border: isFocused 
      ? '1px solid var(--button-primary-bg)' 
      : '1px solid var(--border-primary)',
    borderRadius: 'var(--radius)',
    cursor: disabled ? 'not-allowed' : 'pointer',
    transition: 'all 0.15s ease',
    opacity: disabled ? 0.5 : 1,
    // Constrain width
    width: fullWidth ? '100%' : 'auto',
    maxWidth: '480px',
    appearance: 'none',
    WebkitAppearance: 'none',
    MozAppearance: 'none',
    // Prominent dropdown arrow
    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")`,
    backgroundRepeat: 'no-repeat',
    backgroundPosition: 'right 0.875rem center',
    boxShadow: isFocused 
      ? '0 0 0 3px rgba(59, 130, 246, 0.15), inset 0 1px 0 rgba(255,255,255,0.05)' 
      : 'inset 0 1px 0 rgba(255,255,255,0.05)',
    outline: 'none',
    ...sizeStyles[size],
    ...style,
  }

  return (
    <select
      data-testid={testId}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      style={baseStyle}
      onFocus={() => setIsFocused(true)}
      onBlur={() => setIsFocused(false)}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <option value="" disabled style={{ color: 'var(--text-muted)' }}>
        {placeholder}
      </option>
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  )
}

export default Select
