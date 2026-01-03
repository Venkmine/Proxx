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
