/**
 * qcIntegration.ts
 * 
 * Integration layer between QC engine and queue state management
 * 
 * PURPOSE:
 * - Connect QC engine events to existing queue job state
 * - Provide a drop-in replacement for real job execution during QC
 * - Maintain state transitions that match production execution flow
 * 
 * USAGE:
 * Instead of calling backend `/control/jobs/{id}/start`, call:
 * 
 * ```ts
 * await runQcJobExecution(jobSpec, (event) => {
 *   // Update queue state based on event.state
 *   updateJobState(event.jobId, event.state)
 * })
 * ```
 * 
 * IMPORTANT:
 * This module is for QC/testing only. Production code should use
 * the real backend execution endpoints.
 */

import { runQcJob } from './qcEngine'
import type { JobSpec } from '../utils/buildJobSpec'
import type { ExecutionEvent } from './executionTypes'

/**
 * State mapping from QC engine states to backend job statuses
 * 
 * This ensures QC execution produces the same state transitions
 * that the UI expects from real backend execution.
 */
export const QC_STATE_TO_JOB_STATUS: Record<string, string> = {
  PENDING: 'PENDING',
  VALIDATING: 'VALIDATING',
  READY: 'READY',
  BLOCKED: 'BLOCKED',
  DRY_RUNNING: 'RUNNING',  // Map to RUNNING so UI shows progress
  COMPLETE: 'COMPLETED'
}

/**
 * Run QC job execution with queue state integration
 * 
 * This is the main entry point for QC execution. It wraps the
 * QC engine and provides state callbacks compatible with the
 * existing queue management system.
 * 
 * @param jobSpec - JobSpec to execute in QC mode
 * @param onStateChange - Callback for state changes (maps to queue updates)
 * @returns Promise that resolves when QC execution completes or blocks
 * 
 * @example
 * ```ts
 * // In App.tsx, replace startJob with:
 * await runQcJobExecution(queuedJobSpec, (event) => {
 *   // Update job status in queue
 *   setJobs(prev => prev.map(j => 
 *     j.id === event.jobId 
 *       ? { ...j, status: QC_STATE_TO_JOB_STATUS[event.state] }
 *       : j
 *   ))
 *   
 *   // Add status log entry
 *   if (event.message) {
 *     addStatusLogEntry({
 *       timestamp: Date.now(),
 *       message: event.message,
 *       level: event.state === 'BLOCKED' ? 'error' : 'info'
 *     })
 *   }
 * })
 * ```
 */
export async function runQcJobExecution(
  jobSpec: JobSpec,
  onStateChange: (event: ExecutionEvent) => void
): Promise<void> {
  // Delegate to QC engine with state change callback
  await runQcJob(jobSpec, (event) => {
    // Forward all events to the callback
    onStateChange(event)
  })
}

/**
 * Check if a job is suitable for QC execution
 * 
 * QC execution requires a JobSpec. Jobs that have been submitted
 * to the backend may not have their original JobSpec available.
 * 
 * @param jobId - Job ID to check
 * @param queuedJobSpec - Current queued JobSpec (if any)
 * @returns true if job can be executed via QC engine
 */
export function canRunQcExecution(
  jobId: string,
  queuedJobSpec: JobSpec | null
): boolean {
  return queuedJobSpec !== null && queuedJobSpec.job_id === jobId
}
