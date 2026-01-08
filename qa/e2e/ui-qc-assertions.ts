/**
 * ⚠️ UI QC ASSERTIONS ⚠️
 * 
 * Utility functions to enforce the "Buttons Must Do Something" contract.
 * 
 * Every clickable control in the Queue / Execution flow must:
 * - Cause a visible UI change OR
 * - Trigger a backend request OR
 * - Cause a state transition
 * 
 * If a button click produces no observable effect, the test fails.
 * 
 * This prevents:
 * - Dead buttons
 * - Placeholder UI
 * - "Wired later" lies
 */

import { Page, expect } from '@playwright/test'
import path from 'node:path'
import fs from 'node:fs'

export interface ButtonEffectResult {
  buttonTestId: string
  buttonText: string | null
  clicked: boolean
  effectObserved: boolean
  effectType: 'ui_change' | 'backend_request' | 'state_transition' | 'none'
  details: string
  screenshotPath?: string
}

/**
 * Captures the current UI state for comparison
 */
async function captureUIState(page: Page): Promise<{
  innerHTML: string
  visibleText: string
  buttonStates: Record<string, boolean>
  inputValues: Record<string, string>
  progressBars: number[]
  errorBanners: string[]
}> {
  return page.evaluate(() => {
    const buttons: Record<string, boolean> = {}
    document.querySelectorAll('button').forEach((btn, i) => {
      const id = btn.getAttribute('data-testid') || `button-${i}`
      buttons[id] = btn.disabled
    })
    
    const inputs: Record<string, string> = {}
    document.querySelectorAll('input').forEach((input, i) => {
      const id = input.getAttribute('data-testid') || `input-${i}`
      inputs[id] = input.value
    })
    
    const progressBars = Array.from(
      document.querySelectorAll('[role="progressbar"], .progress-bar')
    ).map(el => parseFloat(el.getAttribute('aria-valuenow') || '0'))
    
    const errorBanners = Array.from(
      document.querySelectorAll('[data-testid="error-banner"], .error, [role="alert"]')
    ).map(el => el.textContent || '')
    
    return {
      innerHTML: document.body.innerHTML.slice(0, 10000), // Limit size
      visibleText: document.body.innerText.slice(0, 10000),
      buttonStates: buttons,
      inputValues: inputs,
      progressBars,
      errorBanners,
    }
  })
}

/**
 * Detects if UI state changed between two captures
 */
function detectUIChange(
  before: ReturnType<typeof captureUIState> extends Promise<infer T> ? T : never,
  after: ReturnType<typeof captureUIState> extends Promise<infer T> ? T : never
): { changed: boolean; details: string } {
  const changes: string[] = []
  
  // Check button state changes
  for (const [id, wasDis] of Object.entries(before.buttonStates)) {
    const isDis = after.buttonStates[id]
    if (wasDis !== isDis) {
      changes.push(`Button ${id} disabled: ${wasDis} → ${isDis}`)
    }
  }
  
  // Check input value changes
  for (const [id, wasVal] of Object.entries(before.inputValues)) {
    const isVal = after.inputValues[id]
    if (wasVal !== isVal) {
      changes.push(`Input ${id} value changed`)
    }
  }
  
  // Check progress bar changes
  if (JSON.stringify(before.progressBars) !== JSON.stringify(after.progressBars)) {
    changes.push('Progress bar value changed')
  }
  
  // Check error banner changes
  if (JSON.stringify(before.errorBanners) !== JSON.stringify(after.errorBanners)) {
    changes.push('Error banner changed')
  }
  
  // Check visible text changes (significant changes only)
  if (before.visibleText !== after.visibleText) {
    changes.push('Visible text content changed')
  }
  
  return {
    changed: changes.length > 0,
    details: changes.join('; ') || 'No changes detected',
  }
}

/**
 * Asserts that clicking a button produces an observable effect.
 * 
 * @param page - Playwright page
 * @param buttonSelector - Selector for the button (data-testid preferred)
 * @param options - Configuration options
 * @returns Result of the assertion
 */
export async function assertButtonHasEffect(
  page: Page,
  buttonSelector: string,
  options: {
    timeout?: number
    expectBackendRequest?: boolean
    artifactsDir?: string
  } = {}
): Promise<ButtonEffectResult> {
  const { timeout = 5000, expectBackendRequest = false, artifactsDir } = options
  
  const button = page.locator(buttonSelector)
  const isVisible = await button.isVisible().catch(() => false)
  
  if (!isVisible) {
    return {
      buttonTestId: buttonSelector,
      buttonText: null,
      clicked: false,
      effectObserved: false,
      effectType: 'none',
      details: `Button not visible: ${buttonSelector}`,
    }
  }
  
  const buttonText = await button.textContent().catch(() => null)
  const isDisabled = await button.isDisabled().catch(() => true)
  
  if (isDisabled) {
    // Disabled buttons are allowed to have no effect
    return {
      buttonTestId: buttonSelector,
      buttonText,
      clicked: false,
      effectObserved: true, // Disabled state IS the effect
      effectType: 'state_transition',
      details: 'Button is disabled (expected - precondition not met)',
    }
  }
  
  // Capture state before click
  const stateBefore = await captureUIState(page)
  
  // Track network requests
  let backendRequestMade = false
  const requestHandler = (request: any) => {
    const url = request.url()
    if (url.includes('/control/') || url.includes('/monitor/') || url.includes('/api/')) {
      backendRequestMade = true
    }
  }
  page.on('request', requestHandler)
  
  // Click the button
  await button.click()
  
  // Wait for potential effects
  await page.waitForTimeout(Math.min(timeout, 2000))
  
  // Capture state after click
  const stateAfter = await captureUIState(page)
  
  // Remove request listener
  page.off('request', requestHandler)
  
  // Analyze changes
  const uiChange = detectUIChange(stateBefore, stateAfter)
  
  let effectType: ButtonEffectResult['effectType'] = 'none'
  let effectObserved = false
  let details = ''
  
  if (backendRequestMade) {
    effectType = 'backend_request'
    effectObserved = true
    details = 'Backend request triggered'
  } else if (uiChange.changed) {
    effectType = 'ui_change'
    effectObserved = true
    details = uiChange.details
  }
  
  // Capture screenshot if no effect observed
  let screenshotPath: string | undefined
  if (!effectObserved && artifactsDir) {
    const safeSelector = buttonSelector.replace(/[^a-zA-Z0-9]/g, '_')
    screenshotPath = path.join(artifactsDir, `dead_button_${safeSelector}.png`)
    await page.screenshot({ path: screenshotPath, fullPage: true })
  }
  
  return {
    buttonTestId: buttonSelector,
    buttonText,
    clicked: true,
    effectObserved,
    effectType,
    details: effectObserved ? details : `DEAD BUTTON: No observable effect from clicking ${buttonSelector}`,
    screenshotPath,
  }
}

/**
 * Validates all interactive elements in a panel produce effects when clicked.
 * 
 * @param page - Playwright page
 * @param panelSelector - Selector for the panel containing buttons
 * @param artifactsDir - Directory to save screenshots of dead buttons
 */
export async function validatePanelButtons(
  page: Page,
  panelSelector: string,
  artifactsDir: string
): Promise<{ passed: boolean; results: ButtonEffectResult[]; deadButtons: string[] }> {
  const results: ButtonEffectResult[] = []
  const deadButtons: string[] = []
  
  // Find all buttons in the panel
  const buttons = await page.locator(`${panelSelector} button[data-testid]`).all()
  
  for (const button of buttons) {
    const testId = await button.getAttribute('data-testid')
    if (!testId) continue
    
    const result = await assertButtonHasEffect(
      page,
      `[data-testid="${testId}"]`,
      { artifactsDir }
    )
    
    results.push(result)
    
    if (result.clicked && !result.effectObserved) {
      deadButtons.push(testId)
    }
  }
  
  return {
    passed: deadButtons.length === 0,
    results,
    deadButtons,
  }
}

/**
 * Asserts that a button exists AND is enabled before clicking it.
 * This is stricter than just checking visibility.
 */
export async function assertButtonClickable(
  page: Page,
  buttonSelector: string,
  context: string = ''
): Promise<void> {
  const button = page.locator(buttonSelector)
  
  // 1. Button must exist
  const count = await button.count()
  if (count === 0) {
    throw new Error(
      `BUTTON_NOT_FOUND: "${buttonSelector}" does not exist in DOM` +
      (context ? ` (context: ${context})` : '')
    )
  }
  
  // 2. Button must be visible
  const isVisible = await button.isVisible()
  if (!isVisible) {
    throw new Error(
      `BUTTON_NOT_VISIBLE: "${buttonSelector}" exists but is not visible` +
      (context ? ` (context: ${context})` : '')
    )
  }
  
  // 3. Button must be enabled
  const isDisabled = await button.isDisabled()
  if (isDisabled) {
    throw new Error(
      `BUTTON_DISABLED: "${buttonSelector}" exists and is visible but is disabled` +
      (context ? ` (context: ${context})` : '')
    )
  }
}

/**
 * Waits for a button to become enabled within a timeout.
 * Useful for buttons that become enabled after async operations.
 */
export async function waitForButtonEnabled(
  page: Page,
  buttonSelector: string,
  timeoutMs: number = 10000
): Promise<boolean> {
  const startTime = Date.now()
  
  while (Date.now() - startTime < timeoutMs) {
    const button = page.locator(buttonSelector)
    
    const isVisible = await button.isVisible().catch(() => false)
    if (!isVisible) {
      await page.waitForTimeout(200)
      continue
    }
    
    const isDisabled = await button.isDisabled().catch(() => true)
    if (!isDisabled) {
      return true // Button is enabled!
    }
    
    await page.waitForTimeout(200)
  }
  
  return false // Timeout - button never became enabled
}

/**
 * Validates state transitions are visible in the UI.
 * Ensures the UI reflects backend state changes.
 */
export async function assertStateTransitionVisible(
  page: Page,
  expectedState: string,
  stateIndicatorSelector: string = '[data-testid="job-status"]',
  timeoutMs: number = 10000
): Promise<void> {
  const startTime = Date.now()
  
  while (Date.now() - startTime < timeoutMs) {
    const indicator = page.locator(stateIndicatorSelector)
    const isVisible = await indicator.isVisible().catch(() => false)
    
    if (isVisible) {
      const text = await indicator.textContent().catch(() => '')
      if (text && text.toLowerCase().includes(expectedState.toLowerCase())) {
        return // State is visible!
      }
    }
    
    await page.waitForTimeout(200)
  }
  
  throw new Error(
    `STATE_NOT_VISIBLE: Expected state "${expectedState}" not visible in UI ` +
    `after ${timeoutMs}ms (selector: ${stateIndicatorSelector})`
  )
}
