/**
 * ContextMenu — Simple right-click context menu for Queue items
 * 
 * Phase E: Queue UX improvements
 * Provides: Reveal in Finder, Copy Output Path, Copy Job ID
 */

import { useState, useEffect, useRef, ReactNode } from 'react'

export interface ContextMenuItem {
  label: string
  onClick: () => void
  disabled?: boolean
  icon?: string
}

interface ContextMenuProps {
  /** Child element that triggers the menu on right-click */
  children: ReactNode
  /** Menu items to display */
  items: ContextMenuItem[]
  /** Additional test ID */
  testId?: string
}

export function ContextMenu({ children, items, testId }: ContextMenuProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [position, setPosition] = useState({ x: 0, y: 0 })
  const menuRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen])

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    
    // Position the menu at the cursor
    setPosition({ x: e.clientX, y: e.clientY })
    setIsOpen(true)
  }

  const handleItemClick = (item: ContextMenuItem) => {
    if (!item.disabled) {
      item.onClick()
      setIsOpen(false)
    }
  }

  return (
    <>
      <div 
        ref={triggerRef} 
        onContextMenu={handleContextMenu}
        data-testid={testId}
      >
        {children}
      </div>

      {isOpen && (
        <div
          ref={menuRef}
          data-testid="context-menu"
          style={{
            position: 'fixed',
            top: `${position.y}px`,
            left: `${position.x}px`,
            zIndex: 9999,
            minWidth: '180px',
            backgroundColor: 'rgba(30, 35, 45, 0.98)',
            border: '1px solid var(--border-primary)',
            borderRadius: 'var(--radius-sm)',
            boxShadow: '0 4px 16px rgba(0, 0, 0, 0.3)',
            padding: '0.25rem 0',
            backdropFilter: 'blur(8px)',
          }}
        >
          {items.map((item, index) => (
            <button
              key={index}
              onClick={() => handleItemClick(item)}
              disabled={item.disabled}
              data-testid={`context-menu-item-${index}`}
              style={{
                width: '100%',
                padding: '0.5rem 0.75rem',
                fontSize: '0.75rem',
                fontFamily: 'var(--font-sans)',
                color: item.disabled ? 'var(--text-dim)' : 'var(--text-primary)',
                background: 'transparent',
                border: 'none',
                textAlign: 'left',
                cursor: item.disabled ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                transition: 'background 0.1s',
              }}
              onMouseEnter={(e) => {
                if (!item.disabled) {
                  e.currentTarget.style.backgroundColor = 'rgba(59, 130, 246, 0.15)'
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'transparent'
              }}
            >
              {item.icon && <span>{item.icon}</span>}
              <span>{item.label}</span>
            </button>
          ))}
        </div>
      )}
    </>
  )
}
