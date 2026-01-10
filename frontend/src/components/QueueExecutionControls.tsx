/**
 * Queue Execution Controls - Phase 9A + UI QC
 * 
 * Explicit execution control buttons for the job queue.
 * 
 * PHASE 9A HARD CONSTRAINTS:
 * - Jobs MUST NOT auto-execute on creation
 * - Execution requires explicit user click
 * - Controls are always visible (never hover-only)
 * - State is reflected accurately in button states
 * 
 * UI QC REQUIREMENTS (PHASE 10):
 * - Primary "RUN" button MUST be visible at all times
 * - "RUN" is the ONLY way jobs transition to RUNNING
 * - Button clearly changes state when queue is running
 * - No job may execute before RUN is clicked
 * 
 * This component provides:
 * - Global queue controls: RUN (primary), Pause Queue, Stop Queue
 * - Per-job controls: Start, Pause, Cancel (managed via callbacks)
 */

import React from 'react'
import './QueueExecutionControls.css'

// ============================================
// Types
// ============================================

export type QueueExecutionState = 'idle' | 'running' | 'paused'

export interface QueueExecutionControlsProps {
  /** Current state of the queue execution */
  queueState: QueueExecutionState
  
  /** Number of jobs in QUEUED state (waiting to execute) */
  queuedJobCount: number
  
  /** Number of jobs currently RUNNING */
  runningJobCount: number
  
  /** Number of jobs selected for batch operations */
  selectedJobCount: number
  
  /** Called when user clicks RUN/Start Queue */
  onStartQueue: () => void
  
  /** Called when user clicks Pause Queue */
  onPauseQueue: () => void
  
  /** Called when user clicks Stop Queue (cancels all running) */
  onStopQueue: () => void
  
  /** Called when user clicks Start Selected (batch) */
  onStartSelected?: () => void
  
  /** Called when user clicks Cancel Selected (batch) */
  onCancelSelected?: () => void
  
  /** Whether the controls are disabled (e.g., during state transition) */
  disabled?: boolean
}

// ============================================
// Component
// ============================================

export function QueueExecutionControls({
  queueState,
  queuedJobCount,
  runningJobCount,
  selectedJobCount,
  onStartQueue,
  onPauseQueue,
  onStopQueue,
  onStartSelected,
  onCancelSelected,
  disabled = false,
}: QueueExecutionControlsProps) {
  const isIdle = queueState === 'idle'
  const isRunning = queueState === 'running'
  const isPaused = queueState === 'paused'
  
  const hasQueuedJobs = queuedJobCount > 0
  const hasRunningJobs = runningJobCount > 0
  const hasSelectedJobs = selectedJobCount > 0
  
  // Can start queue: must have queued jobs and not already running
  const canStartQueue = hasQueuedJobs && !isRunning && !disabled
  
  // Can pause queue: must be running
  const canPauseQueue = isRunning && !disabled
  
  // Can stop queue: must be running or paused
  const canStopQueue = (isRunning || isPaused) && !disabled
  
  // Can resume: must be paused
  const canResume = isPaused && hasQueuedJobs && !disabled
  
  return (
    <div className="queue-execution-controls" data-testid="queue-execution-controls">
      {/* PRIMARY RUN BUTTON — Always visible, always first */}
      {/* UI QC: This is THE primary action button for executing jobs */}
      <button
        type="button"
        className={`queue-btn queue-btn--run ${isRunning ? 'queue-btn--run-active' : ''}`}
        onClick={onStartQueue}
        disabled={(!canStartQueue && !canResume) || disabled}
        data-testid="btn-run-queue"
        title={
          isRunning 
            ? 'Queue is running...' 
            : isPaused 
              ? `Resume execution of ${queuedJobCount} queued job(s)`
              : hasQueuedJobs 
                ? `RUN ${queuedJobCount} queued job(s)` 
                : 'No jobs queued'
        }
      >
        {isRunning ? (
          <>
            <span className="queue-btn-icon queue-btn-icon--running">●</span>
            <span className="queue-btn-label">RUNNING…</span>
          </>
        ) : isPaused ? (
          <>
            <span className="queue-btn-icon">▶</span>
            <span className="queue-btn-label">RESUME</span>
          </>
        ) : (
          <>
            <span className="queue-btn-icon">▶</span>
            <span className="queue-btn-label">RUN{hasQueuedJobs ? ` (${queuedJobCount})` : ''}</span>
          </>
        )}
      </button>
      
      {/* Status indicator */}
      <div className="queue-status">
        <span className={`queue-status-indicator queue-status-indicator--${queueState}`} />
        <span className="queue-status-text">
          {isIdle && 'Queue Idle'}
          {isRunning && `Processing (${runningJobCount} running)`}
          {isPaused && 'Queue Paused'}
        </span>
        {hasQueuedJobs && !isRunning && (
          <span className="queue-count">{queuedJobCount} queued</span>
        )}
      </div>
      
      {/* Secondary queue controls */}
      <div className="queue-global-controls">
        {/* Pause Queue - only shown when running */}
        {isRunning && (
          <button
            type="button"
            className="queue-btn queue-btn--pause"
            onClick={onPauseQueue}
            disabled={!canPauseQueue}
            data-testid="btn-pause-queue"
            title="Pause queue (finish current job, don't start next)"
          >
            <span className="queue-btn-icon">⏸</span>
            <span className="queue-btn-label">Pause</span>
          </button>
        )}
        
        {/* Stop Queue - only shown when running or paused */}
        {(isRunning || isPaused) && (
          <button
            type="button"
            className="queue-btn queue-btn--stop"
            onClick={onStopQueue}
            disabled={!canStopQueue}
            data-testid="btn-stop-queue"
            title="Stop queue and cancel all running jobs"
          >
            <span className="queue-btn-icon">⏹</span>
            <span className="queue-btn-label">Stop</span>
          </button>
        )}
      </div>
      
      {/* Batch controls for selected jobs */}
      {hasSelectedJobs && (
        <div className="queue-batch-controls">
          <span className="batch-selection-count">{selectedJobCount} selected</span>
          
          {onStartSelected && (
            <button
              type="button"
              className="queue-btn queue-btn--batch-start"
              onClick={onStartSelected}
              disabled={disabled}
              data-testid="btn-start-selected"
              title="Start selected jobs"
            >
              Start Selected
            </button>
          )}
          
          {onCancelSelected && (
            <button
              type="button"
              className="queue-btn queue-btn--batch-cancel"
              onClick={onCancelSelected}
              disabled={disabled}
              data-testid="btn-cancel-selected"
              title="Cancel selected jobs"
            >
              Cancel Selected
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// ============================================
// Per-Job Controls (for use in job rows)
// ============================================

export type JobExecutionState = 'queued' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled' | 'blocked'

export interface JobRowControlsProps {
  jobId: string
  jobState: JobExecutionState
  onStart: (jobId: string) => void
  onPause: (jobId: string) => void
  onCancel: (jobId: string) => void
  disabled?: boolean
}

export function JobRowControls({
  jobId,
  jobState,
  onStart,
  onPause,
  onCancel,
  disabled = false,
}: JobRowControlsProps) {
  const isQueued = jobState === 'queued'
  const isRunning = jobState === 'running'
  const isPaused = jobState === 'paused'
  const isTerminal = ['completed', 'failed', 'cancelled'].includes(jobState)
  
  // Controls hidden for terminal states
  if (isTerminal) {
    return null
  }
  
  return (
    <div className="job-row-controls" data-testid={`job-controls-${jobId}`}>
      {/* Start button - only for queued jobs */}
      {isQueued && (
        <button
          type="button"
          className="job-btn job-btn--start"
          onClick={() => onStart(jobId)}
          disabled={disabled}
          data-testid={`btn-start-job-${jobId}`}
          title="Start this job now"
        >
          ▶
        </button>
      )}
      
      {/* Pause button - only for running jobs */}
      {isRunning && (
        <button
          type="button"
          className="job-btn job-btn--pause"
          onClick={() => onPause(jobId)}
          disabled={disabled}
          data-testid={`btn-pause-job-${jobId}`}
          title="Pause this job"
        >
          ⏸
        </button>
      )}
      
      {/* Resume button - only for paused jobs */}
      {isPaused && (
        <button
          type="button"
          className="job-btn job-btn--resume"
          onClick={() => onStart(jobId)}
          disabled={disabled}
          data-testid={`btn-resume-job-${jobId}`}
          title="Resume this job"
        >
          ▶
        </button>
      )}
      
      {/* Cancel button - for queued, running, or paused jobs */}
      {(isQueued || isRunning || isPaused) && (
        <button
          type="button"
          className="job-btn job-btn--cancel"
          onClick={() => onCancel(jobId)}
          disabled={disabled}
          data-testid={`btn-cancel-job-${jobId}`}
          title="Cancel this job"
        >
          ✕
        </button>
      )}
    </div>
  )
}

export default QueueExecutionControls
