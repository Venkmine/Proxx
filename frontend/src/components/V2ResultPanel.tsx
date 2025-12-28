/**
 * V2ResultPanel — Display V2 JobExecutionResult
 * 
 * V2 Step 3: UI as JobSpec Compiler (Thin Client)
 * 
 * This panel displays the result of a V2 execution:
 * - During execution: "Encoding..." (no progress/ETA)
 * - After completion: Clip status + output path + failure reason
 * 
 * Honesty invariants:
 * - No fake progress percentages
 * - No ETAs
 * - Just honest status
 */

import React from 'react'
import { useV2ModeStore, V2ClipResult } from '../stores/v2ModeStore'
import { Button } from './Button'

interface V2ResultPanelProps {
  onClose?: () => void
}

export function V2ResultPanel({ onClose }: V2ResultPanelProps) {
  const { 
    v2ExecutionStatus, 
    v2LastResult, 
    v2Error,
    clearV2Result 
  } = useV2ModeStore()
  
  // Don't render if idle
  if (v2ExecutionStatus === 'idle') {
    return null
  }
  
  const handleDismiss = () => {
    clearV2Result()
    onClose?.()
  }
  
  // Encoding state — just show spinner
  if (v2ExecutionStatus === 'encoding') {
    return (
      <div style={panelStyles}>
        <div style={headerStyles}>
          <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
            V2 Execution
          </span>
          <span style={badgeStyles('encoding')}>ENCODING</span>
        </div>
        
        <div style={encodingContentStyles}>
          <div style={spinnerStyles} />
          <span style={{ color: 'var(--text-secondary)', marginLeft: '0.75rem' }}>
            Encoding...
          </span>
        </div>
        
        <div style={footerNoteStyles}>
          <span style={{ color: 'var(--text-tertiary)', fontSize: '0.75rem' }}>
            V2 execution is synchronous. Please wait for completion.
          </span>
        </div>
      </div>
    )
  }
  
  // Error state
  if (v2Error) {
    return (
      <div style={panelStyles}>
        <div style={headerStyles}>
          <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
            V2 Execution
          </span>
          <span style={badgeStyles('failed')}>FAILED</span>
        </div>
        
        <div style={errorContentStyles}>
          <span style={{ color: '#f87171', fontWeight: 500 }}>Error</span>
          <span style={{ color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
            {v2Error}
          </span>
        </div>
        
        <div style={footerStyles}>
          <Button variant="secondary" size="sm" onClick={handleDismiss}>
            Dismiss
          </Button>
        </div>
      </div>
    )
  }
  
  // Result state (completed or failed)
  if (!v2LastResult) {
    return null
  }
  
  const { job_id, final_status, clips, duration_seconds, completed_clips, failed_clips } = v2LastResult
  
  return (
    <div style={panelStyles}>
      <div style={headerStyles}>
        <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
          V2 Result: {job_id}
        </span>
        <span style={badgeStyles(final_status.toLowerCase() as 'completed' | 'failed' | 'partial')}>
          {final_status}
        </span>
      </div>
      
      <div style={summaryStyles}>
        <span style={{ color: 'var(--text-secondary)' }}>
          {completed_clips} completed, {failed_clips} failed
          {duration_seconds ? ` • ${duration_seconds.toFixed(1)}s total` : ''}
        </span>
      </div>
      
      <div style={clipListStyles}>
        {clips.map((clip, index) => (
          <ClipResultRow key={index} clip={clip} index={index} />
        ))}
      </div>
      
      <div style={footerStyles}>
        <Button variant="secondary" size="sm" onClick={handleDismiss}>
          Dismiss
        </Button>
      </div>
    </div>
  )
}

// ============================================================================
// Clip Result Row
// ============================================================================

interface ClipResultRowProps {
  clip: V2ClipResult
  index: number
}

function ClipResultRow({ clip, index }: ClipResultRowProps) {
  const sourceName = clip.source_path.split('/').pop() || clip.source_path
  const outputName = clip.resolved_output_path.split('/').pop() || clip.resolved_output_path
  const isCompleted = clip.status === 'COMPLETED'
  
  return (
    <div style={clipRowStyles}>
      <div style={clipIndexStyles}>{String(index + 1).padStart(2, '0')}</div>
      
      <div style={clipInfoStyles}>
        <div style={clipSourceStyles}>
          {sourceName}
        </div>
        
        {isCompleted ? (
          <div style={clipOutputStyles}>
            → {outputName}
            {clip.output_size_bytes && (
              <span style={{ marginLeft: '0.5rem', color: 'var(--text-tertiary)' }}>
                ({(clip.output_size_bytes / (1024 * 1024)).toFixed(1)} MB)
              </span>
            )}
          </div>
        ) : (
          <div style={clipFailureStyles}>
            {clip.failure_reason || 'Unknown failure'}
          </div>
        )}
      </div>
      
      <div style={clipStatusStyles(isCompleted)}>
        {isCompleted ? '✓' : '✗'}
      </div>
    </div>
  )
}

// ============================================================================
// Styles
// ============================================================================

const panelStyles: React.CSSProperties = {
  background: 'var(--surface-secondary)',
  border: '1px solid var(--border-primary)',
  borderRadius: 'var(--radius-lg)',
  padding: '1rem',
  margin: '0.5rem 0',
  boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
}

const headerStyles: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  marginBottom: '0.75rem',
}

const badgeStyles = (status: 'encoding' | 'completed' | 'failed' | 'partial'): React.CSSProperties => {
  const colors = {
    encoding: { bg: 'rgba(59, 130, 246, 0.2)', text: '#3b82f6' },
    completed: { bg: 'rgba(16, 185, 129, 0.2)', text: '#10b981' },
    failed: { bg: 'rgba(239, 68, 68, 0.2)', text: '#ef4444' },
    partial: { bg: 'rgba(245, 158, 11, 0.2)', text: '#f59e0b' },
  }
  const { bg, text } = colors[status]
  
  return {
    background: bg,
    color: text,
    padding: '0.125rem 0.5rem',
    borderRadius: 'var(--radius-sm)',
    fontSize: '0.6875rem',
    fontWeight: 600,
    letterSpacing: '0.05em',
  }
}

const encodingContentStyles: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  padding: '1.5rem',
  justifyContent: 'center',
}

const spinnerStyles: React.CSSProperties = {
  width: '1.25rem',
  height: '1.25rem',
  border: '2px solid var(--border-secondary)',
  borderTopColor: '#3b82f6',
  borderRadius: '50%',
  animation: 'spin 0.8s linear infinite',
}

const footerNoteStyles: React.CSSProperties = {
  textAlign: 'center',
  paddingTop: '0.5rem',
}

const errorContentStyles: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  padding: '0.75rem',
  background: 'rgba(239, 68, 68, 0.1)',
  borderRadius: 'var(--radius)',
  marginBottom: '0.75rem',
}

const summaryStyles: React.CSSProperties = {
  marginBottom: '0.75rem',
  paddingBottom: '0.75rem',
  borderBottom: '1px solid var(--border-primary)',
}

const clipListStyles: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '0.5rem',
  maxHeight: '200px',
  overflowY: 'auto',
}

const clipRowStyles: React.CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  padding: '0.5rem',
  background: 'var(--surface-tertiary)',
  borderRadius: 'var(--radius)',
  gap: '0.75rem',
}

const clipIndexStyles: React.CSSProperties = {
  color: 'var(--text-tertiary)',
  fontFamily: 'var(--font-mono)',
  fontSize: '0.75rem',
  minWidth: '1.5rem',
}

const clipInfoStyles: React.CSSProperties = {
  flex: 1,
  minWidth: 0,
}

const clipSourceStyles: React.CSSProperties = {
  color: 'var(--text-primary)',
  fontSize: '0.8125rem',
  fontWeight: 500,
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
}

const clipOutputStyles: React.CSSProperties = {
  color: 'var(--text-secondary)',
  fontSize: '0.75rem',
  marginTop: '0.125rem',
}

const clipFailureStyles: React.CSSProperties = {
  color: '#f87171',
  fontSize: '0.75rem',
  marginTop: '0.125rem',
}

const clipStatusStyles = (isCompleted: boolean): React.CSSProperties => ({
  color: isCompleted ? '#10b981' : '#ef4444',
  fontWeight: 600,
  fontSize: '0.875rem',
})

const footerStyles: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'flex-end',
  marginTop: '0.75rem',
  paddingTop: '0.75rem',
  borderTop: '1px solid var(--border-primary)',
}
