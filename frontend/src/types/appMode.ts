/**
 * AppMode — Explicit App-Wide State Machine
 * 
 * ============================================================================
 * DESIGN PHILOSOPHY
 * ============================================================================
 * This type represents the core app state machine. AppMode is derived centrally
 * in App.tsx and passed down to all components that need it. Components MUST NOT
 * recompute or infer app mode from their own logic.
 * 
 * DERIVATION RULES (single source of truth in App.tsx):
 * - idle: No sources selected
 * - configuring: Sources selected AND preflight invalid
 * - ready: Preflight valid AND no active jobs
 * - running: At least one active job
 * - completed: Last job finished AND no active jobs
 * 
 * USAGE PRINCIPLES:
 * - AppMode drives conditional rendering and styling
 * - Components receive appMode as a prop — never derive it locally
 * - UI behavior branches ONLY on this explicit state
 * - No scattered logic for determining "what mode are we in"
 * ============================================================================
 */

/**
 * Explicit app-wide state machine.
 * 
 * States:
 * - idle: No sources selected, neutral/welcoming state
 * - configuring: Sources selected but preflight is invalid
 * - ready: Preflight valid, ready to submit/run
 * - running: At least one job is currently executing
 * - completed: Last job finished, no active jobs
 */
export type AppMode =
  | 'idle'
  | 'configuring'
  | 'ready'
  | 'running'
  | 'completed'

/**
 * Derive AppMode from app state.
 * This function is the SINGLE SOURCE OF TRUTH for app mode derivation.
 * 
 * @param hasSourcesSelected - Whether any source files are selected
 * @param isPreflightValid - Whether all preflight checks pass (no blocking failures)
 * @param hasActiveJobs - Whether any job is currently running
 * @param hasCompletedJobs - Whether any job has completed (terminal state)
 */
export function deriveAppMode(
  hasSourcesSelected: boolean,
  isPreflightValid: boolean,
  hasActiveJobs: boolean,
  hasCompletedJobs: boolean
): AppMode {
  // Priority 1: If any job is running, we're in running mode
  if (hasActiveJobs) {
    return 'running'
  }
  
  // Priority 2: If no sources selected, we're idle
  if (!hasSourcesSelected) {
    // If we have completed jobs and no sources, show completed state
    if (hasCompletedJobs) {
      return 'completed'
    }
    return 'idle'
  }
  
  // Priority 3: Sources selected but preflight invalid = configuring
  if (!isPreflightValid) {
    return 'configuring'
  }
  
  // Priority 4: Preflight valid = ready
  return 'ready'
}

/**
 * Check if app mode is in a pre-job state (configuring sources/settings).
 */
export function isPreJobMode(mode: AppMode): boolean {
  return mode === 'idle' || mode === 'configuring' || mode === 'ready'
}

/**
 * Check if app mode is in an active job state.
 */
export function isJobActiveMode(mode: AppMode): boolean {
  return mode === 'running'
}

/**
 * Check if app mode is in a terminal state (job finished).
 */
export function isTerminalMode(mode: AppMode): boolean {
  return mode === 'completed'
}
