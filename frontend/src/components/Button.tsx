import React from 'react'

/**
 * Button component with visual hierarchy:
 * - primary: filled gradient, high-contrast, main actions
 * - secondary: subtle gradient, supporting actions
 * - destructive: red, isolated, rare (cancel, delete)
 * - ghost: minimal, inline actions
 * 
 * Phase 16: Resolve-inspired rounded corners, subtle gradients, proper hover states.
 */

export type ButtonVariant = 'primary' | 'secondary' | 'destructive' | 'ghost' | 'warning' | 'success'
export type ButtonSize = 'sm' | 'md' | 'lg'

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  loading?: boolean
  fullWidth?: boolean
  children: React.ReactNode
}

const variantStyles: Record<ButtonVariant, React.CSSProperties> = {
  primary: {
    background: 'linear-gradient(180deg, #3b82f6 0%, #2563eb 100%)',
    color: '#ffffff',
    border: '1px solid rgba(96, 165, 250, 0.4)',
    boxShadow: '0 2px 8px rgba(59, 130, 246, 0.3), inset 0 1px 0 rgba(255,255,255,0.15)',
  },
  secondary: {
    background: 'linear-gradient(180deg, rgba(51, 65, 85, 0.4) 0%, rgba(30, 41, 59, 0.6) 100%)',
    color: 'var(--text-secondary)',
    border: '1px solid var(--border-primary)',
    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.05)',
  },
  destructive: {
    background: 'linear-gradient(180deg, rgba(127, 29, 29, 0.3) 0%, rgba(69, 10, 10, 0.4) 100%)',
    color: '#f87171',
    border: '1px solid rgba(248, 113, 113, 0.4)',
    boxShadow: 'none',
  },
  warning: {
    background: 'linear-gradient(180deg, #f97316 0%, #ea580c 100%)',
    color: '#ffffff',
    border: '1px solid rgba(251, 146, 60, 0.4)',
    boxShadow: '0 2px 8px rgba(249, 115, 22, 0.3), inset 0 1px 0 rgba(255,255,255,0.15)',
  },
  success: {
    background: 'linear-gradient(180deg, #10b981 0%, #059669 100%)',
    color: '#ffffff',
    border: '1px solid rgba(52, 211, 153, 0.4)',
    boxShadow: '0 2px 8px rgba(16, 185, 129, 0.3), inset 0 1px 0 rgba(255,255,255,0.15)',
  },
  ghost: {
    background: 'transparent',
    color: 'var(--text-secondary)',
    border: '1px solid transparent',
    boxShadow: 'none',
  },
}

const sizeStyles: Record<ButtonSize, React.CSSProperties> = {
  sm: {
    padding: '0.3125rem 0.625rem',
    fontSize: '0.75rem',
    borderRadius: 'var(--radius-sm)',
  },
  md: {
    padding: '0.5rem 1rem',
    fontSize: '0.8125rem',
    borderRadius: 'var(--radius)',
  },
  lg: {
    padding: '0.625rem 1.5rem',
    fontSize: '0.875rem',
    borderRadius: 'var(--radius-lg)',
  },
}

export function Button({
  variant = 'secondary',
  size = 'md',
  loading = false,
  fullWidth = false,
  disabled,
  children,
  style,
  onMouseEnter,
  onMouseLeave,
  ...props
}: ButtonProps) {
  const isDisabled = disabled || loading
  
  const baseStyle: React.CSSProperties = {
    fontFamily: 'var(--font-sans)',
    fontWeight: 600,
    letterSpacing: '-0.01em',
    cursor: isDisabled ? 'not-allowed' : 'pointer',
    transition: 'all 0.15s ease',
    opacity: isDisabled ? 0.5 : 1,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '0.5rem',
    width: fullWidth ? '100%' : 'auto',
    ...variantStyles[variant],
    ...sizeStyles[size],
    ...style,
  }

  const handleMouseEnter = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (isDisabled) return
    const el = e.currentTarget
    
    switch (variant) {
      case 'primary':
        el.style.background = 'linear-gradient(180deg, #60a5fa 0%, #3b82f6 100%)'
        el.style.transform = 'translateY(-1px)'
        el.style.boxShadow = '0 4px 16px rgba(59, 130, 246, 0.4), inset 0 1px 0 rgba(255,255,255,0.2)'
        break
      case 'secondary':
        el.style.background = 'linear-gradient(180deg, rgba(71, 85, 105, 0.4) 0%, rgba(51, 65, 85, 0.6) 100%)'
        el.style.borderColor = 'var(--border-hover)'
        el.style.color = 'var(--text-primary)'
        break
      case 'destructive':
        el.style.background = 'linear-gradient(180deg, rgba(153, 27, 27, 0.4) 0%, rgba(127, 29, 29, 0.5) 100%)'
        el.style.borderColor = 'rgba(248, 113, 113, 0.6)'
        el.style.color = '#fca5a5'
        break
      case 'warning':
        el.style.background = 'linear-gradient(180deg, #fb923c 0%, #f97316 100%)'
        el.style.transform = 'translateY(-1px)'
        el.style.boxShadow = '0 4px 16px rgba(249, 115, 22, 0.4), inset 0 1px 0 rgba(255,255,255,0.2)'
        break
      case 'success':
        el.style.background = 'linear-gradient(180deg, #34d399 0%, #10b981 100%)'
        el.style.transform = 'translateY(-1px)'
        el.style.boxShadow = '0 4px 16px rgba(16, 185, 129, 0.4), inset 0 1px 0 rgba(255,255,255,0.2)'
        break
      case 'ghost':
        el.style.background = 'rgba(51, 65, 85, 0.3)'
        el.style.color = 'var(--text-primary)'
        break
    }
    
    onMouseEnter?.(e)
  }

  const handleMouseLeave = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (isDisabled) return
    const el = e.currentTarget
    const vs = variantStyles[variant]
    
    el.style.background = vs.background as string
    el.style.transform = 'translateY(0)'
    el.style.boxShadow = vs.boxShadow as string || 'none'
    el.style.borderColor = (vs.border as string)?.split(' ')[2] || ''
    el.style.color = vs.color as string
    
    onMouseLeave?.(e)
  }

  return (
    <button
      style={baseStyle}
      disabled={isDisabled}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      {...props}
    >
      {loading && (
        <span style={{ 
          width: '1em', 
          height: '1em', 
          border: '2px solid currentColor',
          borderTopColor: 'transparent',
          borderRadius: '50%',
          animation: 'spin 0.6s linear infinite'
        }} />
      )}
      {children}
    </button>
  )
}

export default Button
