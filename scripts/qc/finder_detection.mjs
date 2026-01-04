/**
 * Finder Dialog Detection
 * 
 * Detects when macOS Finder or native file dialogs become frontmost
 * during QC automation, which indicates the automation has lost control.
 * 
 * This is a diagnostic utility to prove whether QC continues after
 * Finder appears.
 */

import { execSync } from 'node:child_process'

/**
 * Check if Finder or a native file dialog is currently frontmost.
 * 
 * @returns {boolean} true if Finder or file dialog is frontmost
 */
export function isFinderFrontmost() {
  try {
    // Use AppleScript to check frontmost application
    const script = `
      tell application "System Events"
        set frontApp to name of first application process whose frontmost is true
        return frontApp
      end tell
    `
    
    const result = execSync(`osascript -e '${script}'`, { 
      encoding: 'utf-8',
      timeout: 2000 
    }).trim()
    
    // Check if Finder or any file dialog is frontmost
    const finderKeywords = ['Finder', 'NSOpenPanel', 'NSSavePanel', 'file dialog']
    const isFinder = finderKeywords.some(keyword => 
      result.toLowerCase().includes(keyword.toLowerCase())
    )
    
    if (isFinder) {
      console.log(`🚨 FINDER DETECTED: Frontmost app is "${result}"`)
    }
    
    return isFinder
  } catch (e) {
    // If detection fails, log but don't block
    console.warn(`   ⚠️  Finder detection failed: ${e.message}`)
    return false
  }
}

/**
 * Throw an error if Finder is detected.
 * This creates a hard stop in the automation.
 * 
 * @param {string} actionName - The action that was being executed
 * @throws {FinderDialogError}
 */
export function assertFinderNotOpen(actionName) {
  if (isFinderFrontmost()) {
    throw new FinderDialogError(actionName)
  }
}

/**
 * Custom error class for Finder detection
 */
export class FinderDialogError extends Error {
  constructor(actionName) {
    super(`Native Finder dialog opened during QC — automation invalid`)
    this.name = 'FinderDialogError'
    this.actionName = actionName
    this.timestamp = new Date().toISOString()
  }
}

/**
 * Global Finder guard that runs on an interval
 * 
 * This is the ROOT GUARD that monitors for Finder throughout QC execution.
 * If Finder opens at ANY point, QC is immediately aborted.
 */
export class FinderGuard {
  constructor() {
    this.intervalId = null
    this.isFinderDetected = false
    this.detectionCallback = null
  }

  /**
   * Start monitoring for Finder on an interval
   * 
   * @param {number} intervalMs - Check interval in milliseconds (default: 250ms)
   * @param {Function} onDetected - Callback when Finder is detected
   */
  start(intervalMs = 250, onDetected = null) {
    console.log(`🛡️  [FINDER GUARD] Starting Finder detection (interval: ${intervalMs}ms)`)
    
    this.detectionCallback = onDetected
    
    this.intervalId = setInterval(() => {
      if (isFinderFrontmost()) {
        this.isFinderDetected = true
        
        console.error('')
        console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
        console.error('  🚨 FINDER GUARD TRIGGERED — QC ABORTED')
        console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
        console.error('  Finder or native file dialog detected.')
        console.error('  QC cannot continue — automation has lost control.')
        console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
        console.error('')
        
        // Stop monitoring
        this.stop()
        
        // Call detection callback
        if (this.detectionCallback) {
          this.detectionCallback()
        }
      }
    }, intervalMs)
  }

  /**
   * Stop monitoring
   */
  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId)
      this.intervalId = null
      console.log('🛡️  [FINDER GUARD] Stopped')
    }
  }

  /**
   * Check if Finder has been detected
   */
  isDetected() {
    return this.isFinderDetected
  }

  /**
   * Assert that Finder has not been detected
   * 
   * @throws {FinderDialogError}
   */
  assertNotDetected(actionName = 'QC') {
    if (this.isFinderDetected) {
      throw new FinderDialogError(actionName)
    }
  }
}
