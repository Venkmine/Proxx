/**
 * executionTypes.ts
 * 
 * Type definitions for the QC execution engine.
 * These types represent the state transitions during dry-run execution.
 * 
 * DESIGN INTENT:
 * - Deterministic state machine for validation and simulation
 * - No actual FFmpeg or Resolve invocation
 * - UI treats these states as real execution flow
 */

/**
 * Job execution states during QC dry-run
 * 
 * PENDING     → Initial queued state
 * VALIDATING  → Performing real validation checks
 * READY       → Validation passed, ready to simulate
 * BLOCKED     → Validation failed, cannot proceed
 * DRY_RUNNING → Simulating execution with deterministic delays
 * COMPLETE    → Simulation finished successfully
 */
export type JobState =
  | 'PENDING'
  | 'VALIDATING'
  | 'READY'
  | 'BLOCKED'
  | 'DRY_RUNNING'
  | 'COMPLETE'

/**
 * Event emitted during job execution
 * 
 * Used to update UI state in real-time as the QC engine
 * progresses through validation and simulation phases.
 */
export interface ExecutionEvent {
  /** Unique job identifier */
  jobId: string
  /** Current state of the job */
  state: JobState
  /** Optional message for BLOCKED state or progress updates */
  message?: string
}
