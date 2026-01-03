/**
 * Backend Controller for QC Runs
 * 
 * Manages forge.py backend lifecycle during intent-driven QC:
 * - Starts backend explicitly
 * - Verifies health endpoint
 * - Tracks PID for clean shutdown
 * - Shuts down after QC completes
 * 
 * CRITICAL: Backend is a hard dependency for intent-driven workflows.
 * If backend cannot start or respond, QC exits BLOCKED_PRECONDITION.
 */

import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const projectRoot = path.resolve(__dirname, '../..')

// Backend configuration
const BACKEND_HOST = '127.0.0.1'
const BACKEND_PORT = 8085
const HEALTH_ENDPOINT = `http://${BACKEND_HOST}:${BACKEND_PORT}/health`
const HEALTH_TIMEOUT_MS = 30000 // 30 seconds
const HEALTH_CHECK_INTERVAL_MS = 500 // Check every 500ms

let backendProcess = null
let backendPid = null

/**
 * Start forge.py backend process.
 * 
 * Returns:
 * - pid: Process ID
 * - started_at: ISO timestamp
 */
export async function startBackend() {
  console.log('🚀 Starting backend (forge.py)...')
  console.log(`   Target: ${BACKEND_HOST}:${BACKEND_PORT}`)
  
  // Check if backend is already running
  const alreadyRunning = await checkBackendRunning()
  if (alreadyRunning) {
    console.log('⚠️  Backend already running, using existing process')
    return {
      pid: null,
      started_at: new Date().toISOString(),
      already_running: true,
    }
  }
  
  // Determine Python executable
  const pythonExec = process.env.PYTHON || 'python3'
  const forgePath = path.join(projectRoot, 'forge.py')
  
  if (!fs.existsSync(forgePath)) {
    throw new Error(`forge.py not found at ${forgePath}`)
  }
  
  // Start backend process
  const startTime = Date.now()
  backendProcess = spawn(pythonExec, [forgePath], {
    cwd: projectRoot,
    env: {
      ...process.env,
      PYTHONUNBUFFERED: '1', // Disable Python output buffering
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  
  backendPid = backendProcess.pid
  
  // Capture output for diagnostics
  let stdout = ''
  let stderr = ''
  
  backendProcess.stdout.on('data', (data) => {
    const text = data.toString()
    stdout += text
    // Echo important lines
    if (text.includes('Uvicorn running') || text.includes('Application startup')) {
      process.stdout.write(`   [backend] ${text}`)
    }
  })
  
  backendProcess.stderr.on('data', (data) => {
    stderr += data.toString()
  })
  
  backendProcess.on('error', (err) => {
    console.error(`❌ Backend process error: ${err.message}`)
  })
  
  backendProcess.on('exit', (code, signal) => {
    if (code !== 0 && code !== null) {
      console.log(`⚠️  Backend exited with code ${code}`)
    }
    backendProcess = null
    backendPid = null
  })
  
  console.log(`   PID: ${backendPid}`)
  console.log(`   Started at: ${new Date().toISOString()}`)
  
  // Give backend a moment to start
  await new Promise(resolve => setTimeout(resolve, 2000))
  
  return {
    pid: backendPid,
    started_at: new Date().toISOString(),
    already_running: false,
    startup_time_ms: Date.now() - startTime,
  }
}

/**
 * Check if backend is already running by testing health endpoint.
 */
async function checkBackendRunning() {
  try {
    const response = await fetch(HEALTH_ENDPOINT, {
      signal: AbortSignal.timeout(2000),
    })
    return response.ok
  } catch {
    return false
  }
}

/**
 * Wait for backend health endpoint to respond.
 * 
 * Polls health endpoint until it responds or timeout is reached.
 * FAIL HARD if timeout is exceeded.
 * 
 * Returns:
 * - healthy: true/false
 * - latency_ms: Time to first successful health check
 * - health_response: Response body from health endpoint
 */
export async function waitForHealthy() {
  console.log('🏥 Waiting for backend health check...')
  console.log(`   Endpoint: ${HEALTH_ENDPOINT}`)
  console.log(`   Timeout: ${HEALTH_TIMEOUT_MS}ms`)
  
  const startTime = Date.now()
  const endTime = startTime + HEALTH_TIMEOUT_MS
  
  while (Date.now() < endTime) {
    try {
      const response = await fetch(HEALTH_ENDPOINT, {
        signal: AbortSignal.timeout(HEALTH_CHECK_INTERVAL_MS),
      })
      
      if (response.ok) {
        const latency = Date.now() - startTime
        let healthData = null
        
        try {
          healthData = await response.json()
        } catch {
          healthData = { status: 'ok' }
        }
        
        console.log(`✅ Backend healthy (${latency}ms)`)
        console.log(`   Status: ${healthData.status || 'ok'}`)
        
        return {
          healthy: true,
          latency_ms: latency,
          health_response: healthData,
        }
      }
    } catch (err) {
      // Ignore errors during polling
    }
    
    // Wait before next check
    await new Promise(resolve => setTimeout(resolve, HEALTH_CHECK_INTERVAL_MS))
  }
  
  // Timeout exceeded - FAIL HARD
  const elapsed = Date.now() - startTime
  console.error('')
  console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.error('❌ BACKEND HEALTH CHECK TIMEOUT')
  console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.error('')
  console.error(`Backend did not respond to health check within ${HEALTH_TIMEOUT_MS}ms`)
  console.error(`Elapsed: ${elapsed}ms`)
  console.error(`Endpoint: ${HEALTH_ENDPOINT}`)
  console.error('')
  console.error('Possible causes:')
  console.error('  - Backend failed to start')
  console.error('  - Port 8085 already in use')
  console.error('  - Python dependencies missing')
  console.error('  - Database connection failure')
  console.error('')
  console.error('Check backend logs above for errors.')
  console.error('')
  
  return {
    healthy: false,
    latency_ms: elapsed,
    error: 'Health check timeout',
  }
}

/**
 * Stop backend process cleanly.
 * 
 * Sends SIGTERM and waits for graceful shutdown.
 * If process doesn't exit within 5 seconds, sends SIGKILL.
 */
export async function stopBackend() {
  if (!backendProcess || !backendPid) {
    console.log('ℹ️  No backend process to stop')
    return {
      stopped: false,
      reason: 'No process running',
    }
  }
  
  console.log(`🛑 Stopping backend (PID: ${backendPid})...`)
  
  try {
    // Send SIGTERM for graceful shutdown
    backendProcess.kill('SIGTERM')
    
    // Wait up to 5 seconds for process to exit
    const exitPromise = new Promise((resolve) => {
      backendProcess.once('exit', () => resolve(true))
    })
    
    const timeoutPromise = new Promise((resolve) => {
      setTimeout(() => resolve(false), 5000)
    })
    
    const exited = await Promise.race([exitPromise, timeoutPromise])
    
    if (!exited) {
      console.log('⚠️  Process did not exit gracefully, sending SIGKILL')
      backendProcess.kill('SIGKILL')
      await new Promise(resolve => setTimeout(resolve, 1000))
    }
    
    console.log('✅ Backend stopped')
    
    backendProcess = null
    backendPid = null
    
    return {
      stopped: true,
      graceful: exited,
    }
  } catch (err) {
    console.error(`❌ Error stopping backend: ${err.message}`)
    return {
      stopped: false,
      error: err.message,
    }
  }
}

/**
 * Get backend status.
 */
export function getBackendStatus() {
  return {
    running: backendProcess !== null,
    pid: backendPid,
  }
}

/**
 * Cleanup handler for process exit.
 * Ensures backend is stopped when QC script exits.
 */
export function setupCleanupHandler() {
  const cleanup = async () => {
    if (backendProcess) {
      console.log('\n🧹 Cleaning up backend process...')
      await stopBackend()
    }
  }
  
  process.on('SIGINT', async () => {
    await cleanup()
    process.exit(130)
  })
  
  process.on('SIGTERM', async () => {
    await cleanup()
    process.exit(143)
  })
  
  process.on('exit', () => {
    // Synchronous cleanup
    if (backendPid) {
      try {
        process.kill(backendPid, 'SIGTERM')
      } catch {
        // Ignore errors
      }
    }
  })
}
