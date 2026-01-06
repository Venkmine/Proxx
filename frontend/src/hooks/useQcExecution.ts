/**
 * useQcExecution.ts
 * 
 * React hook for QC job execution
 * 
 * PURPOSE:
 * - Provide a clean interface for running QC jobs from React components
 * - Handle state updates and error handling
 * - Integrate seamlessly with existing queue state management
 * 
 * USAGE:
 * ```ts
 * const { runQcJob, isRunning } = useQcExecution({
 *   onStateChange: (jobId, state, message) => {
 *     // Update queue state
 *   }
 * })
 * 
 * // Trigger QC execution
 * await runQcJob(jobSpec)
 * ```
 */

import { useState, useCallback } from 'react'
import { runQcJobExecution, QC_STATE_TO_JOB_STATUS } from '../execution/qcIntegration'
import type { JobSpec } from '../utils/buildJobSpec'
import type { JobState } from '../execution/executionTypes'

export interface QcExecutionOptions {
  /** Callback when job state changes */
  onStateChange: (jobId: string, state: string, message?: string) => void
  /** Callback when execution completes */
  onComplete?: (jobId: string) => void
  /** Callback when execution is blocked */
  onBlocked?: (jobId: string, reasons: string) => void
  /** Callback when execution errors */
  onError?: (jobId: string, error: Error) => void
}

export interface QcExecutionHook {
  /** Execute a QC job */
  runQcJob: (jobSpec: JobSpec) => Promise<void>
  /** Whether a QC job is currently running */
  isRunning: boolean
  /** Current job ID being executed (null if none) */
  currentJobId: string | null
  /** Error from last execution (null if no error) */
  error: Error | null
}

/**
 * Hook for running QC job execution
 * 
 * Provides a clean interface for executing jobs via the QC engine
 * with automatic state management and error handling.
 */
export function useQcExecution(options: QcExecutionOptions): QcExecutionHook {
  const [isRunning, setIsRunning] = useState(false)
  const [currentJobId, setCurrentJobId] = useState<string | null>(null)
  const [error, setError] = useState<Error | null>(null)
  
  const runQcJob = useCallback(async (jobSpec: JobSpec) => {
    // Prevent concurrent executions
    if (isRunning) {
      throw new Error('QC execution already in progress')
    }
    
    setIsRunning(true)
    setCurrentJobId(jobSpec.job_id)
    setError(null)
    
    try {
      // Run QC execution with state callbacks
      await runQcJobExecution(jobSpec, (event) => {
        // Map QC state to job status
        const jobStatus = QC_STATE_TO_JOB_STATUS[event.state]
        
        // Notify state change
        options.onStateChange(event.jobId, jobStatus, event.message)
        
        // Handle terminal states
        if (event.state === 'COMPLETE' && options.onComplete) {
          options.onComplete(event.jobId)
        }
        
        if (event.state === 'BLOCKED' && options.onBlocked) {
          options.onBlocked(event.jobId, event.message || 'Validation failed')
        }
      })
    } catch (err) {
      const error = err instanceof Error ? err : new Error('QC execution failed')
      setError(error)
      
      if (options.onError) {
        options.onError(jobSpec.job_id, error)
      }
    } finally {
      setIsRunning(false)
      setCurrentJobId(null)
    }
  }, [isRunning, options])
  
  return {
    runQcJob,
    isRunning,
    currentJobId,
    error
  }
}
