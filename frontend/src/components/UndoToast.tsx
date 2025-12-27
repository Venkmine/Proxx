import { useEffect, useState } from 'react'
import { Button } from './Button'

/**
 * UndoToast — Floating toast for undoable actions (Phase 19)
 * 
 * Appears bottom-left when a destructive action is taken.
 * Shows countdown timer. Undo immediately restores state.
 * Memory-only — no persistence across refresh.
 */

export interface UndoAction {
  id: string
  message: string
  onUndo: () => void
  timestamp: number
}

interface UndoToastProps {
  action: UndoAction | null
  onDismiss: () => void
  duration?: number // ms before auto-dismiss, default 5000
}

export function UndoToast({ action, onDismiss, duration = 5000 }: UndoToastProps) {
  const [timeLeft, setTimeLeft] = useState<number>(duration)
  const [isExiting, setIsExiting] = useState(false)

  useEffect(() => {
    if (!action) return

    // Reset timer when new action comes in
    setTimeLeft(duration)
    setIsExiting(false)

    const startTime = Date.now()
    const interval = setInterval(() => {
      const elapsed = Date.now() - startTime
      const remaining = Math.max(0, duration - elapsed)
      setTimeLeft(remaining)
      
      if (remaining <= 0) {
        clearInterval(interval)
        setIsExiting(true)
        setTimeout(onDismiss, 200)
      }
    }, 100)

    return () => clearInterval(interval)
  }, [action?.id, duration, onDismiss])

  if (!action) return null

  const handleUndo = () => {
    action.onUndo()
    onDismiss()
  }

  const seconds = Math.ceil(timeLeft / 1000)

  return (
    <div
      style={{
        position: 'fixed',
        // STRUCTURAL FIX: Move toast to bottom-right to avoid overlapping left sidebar and controls
        bottom: '1.5rem',
        right: '1.5rem',
        zIndex: 1100,  // Above z-index 1000 controls
        display: 'flex',
        alignItems: 'center',
        gap: '0.75rem',
        padding: '0.75rem 1rem',
        backgroundColor: 'var(--bg-elevated)',
        border: '1px solid var(--border-primary)',
        borderRadius: 'var(--radius)',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
        opacity: isExiting ? 0 : 1,
        transform: isExiting ? 'translateY(10px)' : 'translateY(0)',
        transition: 'opacity 0.2s, transform 0.2s',
      }}
    >
      <span style={{
        fontSize: '0.875rem',
        color: 'var(--text-primary)',
        fontFamily: 'var(--font-sans)',
      }}>
        {action.message}
      </span>
      
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <span style={{
          fontSize: '0.75rem',
          color: 'var(--text-muted)',
          fontFamily: 'var(--font-mono)',
          minWidth: '1.5rem',
          textAlign: 'right',
        }}>
          {seconds}s
        </span>
        
        <Button
          variant="primary"
          size="sm"
          onClick={handleUndo}
          style={{ fontWeight: 600 }}
        >
          Undo
        </Button>
        
        <button
          onClick={onDismiss}
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--text-muted)',
            cursor: 'pointer',
            fontSize: '1rem',
            padding: '0.25rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          title="Dismiss"
        >
          ×
        </button>
      </div>
    </div>
  )
}

/**
 * useUndoStack — Memory-only undo/redo stack (Phase 19)
 * 
 * Supports Cmd+Z (undo) and Cmd+Shift+Z (redo).
 * All destructive actions should be pushed here.
 */

interface UndoEntry {
  id: string
  message: string
  doAction: () => Promise<void> | void
  undoAction: () => Promise<void> | void
  done: boolean
}

export function useUndoStack() {
  const [stack, setStack] = useState<UndoEntry[]>([])
  const [pointer, setPointer] = useState<number>(-1) // Points to last executed action
  const [currentToast, setCurrentToast] = useState<UndoAction | null>(null)

  const push = (entry: Omit<UndoEntry, 'id' | 'done'>) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`
    const newEntry: UndoEntry = { ...entry, id, done: true }
    
    // Truncate any undone actions when new action is pushed
    const newStack = [...stack.slice(0, pointer + 1), newEntry]
    setStack(newStack)
    setPointer(newStack.length - 1)
    
    // Show toast
    setCurrentToast({
      id,
      message: entry.message,
      onUndo: () => undo(),
      timestamp: Date.now(),
    })
  }

  const undo = async () => {
    if (pointer < 0) return false
    
    const entry = stack[pointer]
    if (!entry || !entry.done) return false
    
    try {
      await entry.undoAction()
      setStack(prev => {
        const updated = [...prev]
        updated[pointer] = { ...entry, done: false }
        return updated
      })
      setPointer(prev => prev - 1)
      setCurrentToast(null)
      return true
    } catch (err) {
      console.error('Undo failed:', err)
      return false
    }
  }

  const redo = async () => {
    const nextPointer = pointer + 1
    if (nextPointer >= stack.length) return false
    
    const entry = stack[nextPointer]
    if (!entry || entry.done) return false
    
    try {
      await entry.doAction()
      setStack(prev => {
        const updated = [...prev]
        updated[nextPointer] = { ...entry, done: true }
        return updated
      })
      setPointer(nextPointer)
      return true
    } catch (err) {
      console.error('Redo failed:', err)
      return false
    }
  }

  const clearToast = () => setCurrentToast(null)

  const canUndo = pointer >= 0 && stack[pointer]?.done
  const canRedo = pointer + 1 < stack.length && !stack[pointer + 1]?.done

  return {
    push,
    undo,
    redo,
    canUndo,
    canRedo,
    currentToast,
    clearToast,
  }
}

export default UndoToast
