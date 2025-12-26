import { useState } from 'react'

/**
 * QueueFilterBar - Global filter bar for job queue.
 * 
 * Phase 16: Provides:
 * - Status filter toggles (All, Running, Queued, Completed, Failed, Skipped, Cancelled)
 * - Text search for filename/path
 * - Date filter (Today, Yesterday, Last 7 Days, All Time)
 */

interface QueueFilterBarProps {
  // Status filters
  activeStatusFilters: Set<string>
  onToggleStatusFilter: (status: string) => void
  onClearStatusFilters: () => void
  
  // Search
  searchQuery: string
  onSearchChange: (query: string) => void
  
  // Date filter
  dateFilter: 'all' | 'today' | 'yesterday' | 'week'
  onDateFilterChange: (filter: 'all' | 'today' | 'yesterday' | 'week') => void
  
  // Stats for filter badges
  statusCounts: {
    running: number
    queued: number
    completed: number
    failed: number
    skipped: number
    cancelled: number
    pending: number
  }
  
  // Phase 4B: Expand/Collapse All controls
  onExpandAll?: () => void
  onCollapseAll?: () => void
}

const STATUS_FILTERS = [
  { key: 'all', label: 'All', color: 'var(--text-secondary)' },
  { key: 'running', label: 'Running', color: 'var(--status-running-fg)' },
  { key: 'queued', label: 'Queued', color: 'var(--status-queued-fg)' },
  { key: 'pending', label: 'Pending', color: 'var(--status-pending-fg)' },
  { key: 'completed', label: 'Completed', color: 'var(--status-completed-fg)' },
  { key: 'failed', label: 'Failed', color: 'var(--status-failed-fg)' },
  { key: 'skipped', label: 'Skipped', color: 'var(--status-skipped-fg)' },
  { key: 'cancelled', label: 'Cancelled', color: 'var(--status-cancelled-fg)' },
] as const

const DATE_FILTERS = [
  { key: 'all', label: 'All Time' },
  { key: 'today', label: 'Today' },
  { key: 'yesterday', label: 'Yesterday' },
  { key: 'week', label: 'Last 7 Days' },
] as const

export function QueueFilterBar({
  activeStatusFilters,
  onToggleStatusFilter,
  onClearStatusFilters,
  searchQuery,
  onSearchChange,
  dateFilter,
  onDateFilterChange,
  statusCounts,
  onExpandAll,
  onCollapseAll,
}: QueueFilterBarProps) {
  const [isSearchFocused, setIsSearchFocused] = useState(false)
  
  const getCount = (key: string): number => {
    if (key === 'all') {
      return Object.values(statusCounts).reduce((a, b) => a + b, 0)
    }
    return statusCounts[key as keyof typeof statusCounts] || 0
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '0.75rem',
        padding: '0.75rem 1rem',
        background: 'linear-gradient(180deg, rgba(30, 41, 59, 0.4) 0%, rgba(20, 22, 26, 0.6) 100%)',
        borderBottom: '1px solid var(--border-primary)',
        borderRadius: 'var(--radius) var(--radius) 0 0',
      }}
    >
      {/* Status Filters Row */}
      <div
        style={{
          display: 'flex',
          gap: '0.375rem',
          flexWrap: 'wrap',
          alignItems: 'center',
        }}
      >
        <span
          style={{
            fontSize: '0.6875rem',
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            color: 'var(--text-dim)',
            marginRight: '0.5rem',
          }}
        >
          Filter
        </span>
        
        {STATUS_FILTERS.map(({ key, label, color }) => {
          const isActive = key === 'all' 
            ? activeStatusFilters.size === 0 
            : activeStatusFilters.has(key.toUpperCase())
          const count = getCount(key)
          
          return (
            <button
              key={key}
              data-testid={`filter-btn-${key}`}
              onClick={() => {
                if (key === 'all') {
                  onClearStatusFilters()
                } else {
                  onToggleStatusFilter(key.toUpperCase())
                }
              }}
              style={
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.375rem',
                padding: '0.25rem 0.625rem',
                fontSize: '0.6875rem',
                fontWeight: 600,
                fontFamily: 'var(--font-sans)',
                textTransform: 'uppercase',
                letterSpacing: '0.02em',
                background: isActive 
                  ? `linear-gradient(180deg, ${color}22 0%, ${color}11 100%)` 
                  : 'transparent',
                color: isActive ? color : 'var(--text-muted)',
                border: isActive 
                  ? `1px solid ${color}44` 
                  : '1px solid transparent',
                borderRadius: 'var(--radius-sm)',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              {label}
              {count > 0 && (
                <span
                  style={{
                    fontSize: '0.625rem',
                    fontFamily: 'var(--font-mono)',
                    opacity: 0.7,
                  }}
                >
                  {count}
                </span>
              )}
            </button>
          )
        })}
        
        {/* Phase 9F: Single expand/collapse toggle — no contradicting buttons */}
        {(onExpandAll || onCollapseAll) && (
          <div style={{ marginLeft: 'auto', display: 'flex', gap: '0.25rem' }}>
            <button
              onClick={onExpandAll}
              title="Expand all job groups"
              style={{
                padding: '0.25rem 0.5rem',
                fontSize: '0.6875rem',
                fontWeight: 500,
                fontFamily: 'var(--font-sans)',
                background: 'rgba(255,255,255,0.05)',
                color: 'var(--text-muted)',
                border: '1px solid var(--border-secondary)',
                borderRadius: 'var(--radius-sm)',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              ⊞
            </button>
            <button
              onClick={onCollapseAll}
              title="Collapse all job groups"
              style={{
                padding: '0.25rem 0.5rem',
                fontSize: '0.6875rem',
                fontWeight: 500,
                fontFamily: 'var(--font-sans)',
                background: 'rgba(255,255,255,0.05)',
                color: 'var(--text-muted)',
                border: '1px solid var(--border-secondary)',
                borderRadius: 'var(--radius-sm)',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              ⊟
            </button>
          </div>
        )}
      </div>
      
      {/* Search and Date Filter Row */}
      <div
        style={{
          display: 'flex',
          gap: '0.75rem',
          alignItems: 'center',
        }}
      >
        {/* Search Input */}
        <div
          style={{
            flex: 1,
            maxWidth: '320px',
            position: 'relative',
          }}
        >
          <input
            type="text"
            placeholder="Search files..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            onFocus={() => setIsSearchFocused(true)}
            onBlur={() => setIsSearchFocused(false)}
            style={{
              width: '100%',
              padding: '0.375rem 0.75rem 0.375rem 2rem',
              fontSize: '0.8125rem',
              fontFamily: 'var(--font-sans)',
              background: 'rgba(0, 0, 0, 0.2)',
              border: isSearchFocused 
                ? '1px solid var(--button-primary-bg)' 
                : '1px solid var(--border-primary)',
              borderRadius: 'var(--radius)',
              color: 'var(--text-primary)',
              outline: 'none',
              transition: 'all 0.15s ease',
            }}
          />
          <span
            style={{
              position: 'absolute',
              left: '0.625rem',
              top: '50%',
              transform: 'translateY(-50%)',
              fontSize: '0.875rem',
              color: 'var(--text-muted)',
              pointerEvents: 'none',
            }}
          >
            🔍
          </span>
          {searchQuery && (
            <button
              onClick={() => onSearchChange('')}
              style={{
                position: 'absolute',
                right: '0.5rem',
                top: '50%',
                transform: 'translateY(-50%)',
                background: 'none',
                border: 'none',
                color: 'var(--text-muted)',
                cursor: 'pointer',
                fontSize: '0.75rem',
                padding: '0.125rem',
              }}
            >
              ✕
            </button>
          )}
        </div>
        
        {/* Date Filter */}
        <div
          style={{
            display: 'flex',
            gap: '0.25rem',
          }}
        >
          {DATE_FILTERS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => onDateFilterChange(key as typeof dateFilter)}
              style={{
                padding: '0.25rem 0.5rem',
                fontSize: '0.6875rem',
                fontWeight: 500,
                fontFamily: 'var(--font-sans)',
                background: dateFilter === key 
                  ? 'rgba(59, 130, 246, 0.15)' 
                  : 'transparent',
                color: dateFilter === key 
                  ? 'var(--button-primary-bg)' 
                  : 'var(--text-muted)',
                border: dateFilter === key 
                  ? '1px solid rgba(59, 130, 246, 0.3)' 
                  : '1px solid transparent',
                borderRadius: 'var(--radius-sm)',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

export default QueueFilterBar
