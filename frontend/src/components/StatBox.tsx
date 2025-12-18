import React from 'react'

/**
 * StatBox component for displaying aggregate counters.
 * Clickable for filtering, with visual active state.
 */

interface StatBoxProps {
  label: string
  value: number
  color: string
  isActive?: boolean
  onClick?: () => void
}

export function StatBox({ label, value, color, isActive = false, onClick }: StatBoxProps) {
  const [isHovered, setIsHovered] = React.useState(false)

  const style: React.CSSProperties = {
    padding: '0.625rem 0.75rem',
    border: isActive ? `2px solid ${color}` : '1px solid var(--border-primary)',
    borderRadius: 'var(--radius)',
    textAlign: 'center',
    backgroundColor: isActive ? 'rgba(59, 130, 246, 0.05)' : isHovered ? 'var(--card-bg-hover)' : 'var(--card-bg)',
    cursor: onClick ? 'pointer' : 'default',
    boxShadow: isActive ? `0 0 12px ${color}40` : 'none',
    transition: 'all 0.2s ease',
    userSelect: 'none',
    minWidth: '80px',
  }

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={style}
    >
      <div
        style={{
          fontSize: '1.25rem',
          fontWeight: 700,
          fontFamily: 'var(--font-sans)',
          color,
          marginBottom: '0.125rem',
          lineHeight: 1.2,
        }}
      >
        {value}
      </div>
      <div
        style={{
          fontSize: '0.6875rem',
          fontFamily: 'var(--font-sans)',
          fontWeight: isActive ? 600 : 500,
          color: isActive ? color : 'var(--text-muted)',
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
        }}
      >
        {label}
      </div>
    </div>
  )
}

export default StatBox
