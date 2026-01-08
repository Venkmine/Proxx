/**
 * ⚠️ E2E GLOBAL TEARDOWN ⚠️
 * 
 * Cleanly shuts down the backend server if it was started by globalSetup.
 * 
 * DETERMINISTIC LIFECYCLE:
 * - globalSetup starts backend if not running
 * - globalTeardown stops backend if we started it
 * - One backend per test run, no terminal hacks
 */

import { execSync } from 'node:child_process'

async function globalTeardown() {
  console.log('\n╔════════════════════════════════════════════════════════════════╗')
  console.log('║  🧹 E2E GLOBAL TEARDOWN                                         ║')
  console.log('╚════════════════════════════════════════════════════════════════╝\n')
  
  // Check if we started the backend
  const backendManaged = process.env.__BACKEND_MANAGED__ === 'true'
  const backendPid = process.env.__BACKEND_PID__
  
  if (!backendManaged) {
    console.log('[TEARDOWN] Backend was already running before tests - not stopping')
    return
  }
  
  if (!backendPid) {
    console.log('[TEARDOWN] No backend PID stored - nothing to clean up')
    return
  }
  
  console.log(`[TEARDOWN] Stopping backend (PID: ${backendPid})...`)
  
  try {
    // Send SIGTERM to the backend process
    process.kill(Number(backendPid), 'SIGTERM')
    
    // Wait a moment for graceful shutdown
    await new Promise(resolve => setTimeout(resolve, 1000))
    
    // Check if still running, force kill if necessary
    try {
      process.kill(Number(backendPid), 0) // Check if process exists
      // Still running, force kill
      console.log('[TEARDOWN] Backend still running, sending SIGKILL...')
      process.kill(Number(backendPid), 'SIGKILL')
    } catch {
      // Process already stopped - good
    }
    
    console.log('✓ Backend stopped')
  } catch (error) {
    console.warn(`[TEARDOWN] Could not stop backend: ${error}`)
  }
  
  // Also clean up any orphaned processes on port 8085
  try {
    execSync('lsof -ti :8085 | xargs kill -9 2>/dev/null || true', { stdio: 'ignore' })
  } catch {
    // Ignore errors - port may already be free
  }
  
  console.log('[TEARDOWN] Cleanup complete\n')
}

export default globalTeardown
