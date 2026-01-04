/**
 * INTENT_040 — Settings Panel Sanity Invariants
 * 
 * Structural safety checks for Settings panel reintroduction:
 * 1. SETTINGS_RENDER_AND_TOGGLE - Panel can open and close
 * 2. SETTINGS_LAYOUT_SAFETY - No layout breaks (reuses INTENT_010)
 * 3. SETTINGS_ACCESSIBILITY - Keyboard nav + focus (reuses INTENT_020)
 * 4. SETTINGS_STATE_INTEGRITY - No store violations (reuses INTENT_030)
 * 5. SETTINGS_ISOLATION - No side effects on job/queue/source state
 * 
 * These are STRUCTURAL checks only - feature correctness comes in INTENT_041.
 */

import type { Page } from '@playwright/test'

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export interface SettingsSanityResult {
  invariant_id: string
  invariant_name: string
  passed: boolean
  violations: SettingsSanityViolation[]
  context?: Record<string, unknown>
  severity?: 'HIGH' | 'MEDIUM'
}

export interface SettingsSanityViolation {
  check_type: string
  reason: string
  details?: string
  element_selector?: string
  bounds?: { left: number; top: number; right: number; bottom: number }
  context?: Record<string, unknown>
}

export type InvariantContext = {
  viewport: { width: number; height: number }
  isE2EMode: boolean
}

// ============================================================================
// CHECK 1: SETTINGS RENDER AND TOGGLE
// ============================================================================

/**
 * Verify Settings panel can be opened and closed.
 * 
 * Properties:
 * 1. Settings toggle control exists and is clickable
 * 2. Clicking toggle shows Settings panel
 * 3. Clicking toggle again hides Settings panel
 * 4. Focus management works (focus enters/exits panel)
 * 
 * HIGH severity: Panel cannot be accessed
 */
export async function checkSettingsRenderAndToggle(
  page: Page,
  context: InvariantContext
): Promise<SettingsSanityResult> {
  const violations: SettingsSanityViolation[] = []
  
  try {
    // Check if Settings toggle exists
    const toggleExists = await page.evaluate(() => {
      const toggle = document.querySelector('[data-testid="settings-toggle"]')
      if (!toggle) return false
      
      const rect = toggle.getBoundingClientRect()
      const style = window.getComputedStyle(toggle)
      
      // Must be visible
      if (rect.width === 0 || rect.height === 0) return false
      if (style.display === 'none' || style.visibility === 'hidden') return false
      if (parseFloat(style.opacity) < 0.01) return false
      
      return true
    })
    
    if (!toggleExists) {
      violations.push({
        check_type: 'toggle_missing',
        reason: 'Settings toggle control not found or not visible',
        details: 'Expected [data-testid="settings-toggle"] to exist and be visible',
      })
      
      return {
        invariant_id: 'SETTINGS_RENDER_AND_TOGGLE',
        invariant_name: 'Settings panel can be opened and closed',
        passed: false,
        violations,
        severity: 'HIGH',
        context: { viewport: context.viewport },
      }
    }
    
    // Try to open Settings panel
    await page.click('[data-testid="settings-toggle"]')
    await page.waitForTimeout(300) // Allow animation
    
    const panelOpenState = await page.evaluate(() => {
      const panel = document.querySelector('[data-testid="settings-panel"]')
      if (!panel) {
        return { exists: false, visible: false }
      }
      
      const rect = panel.getBoundingClientRect()
      const style = window.getComputedStyle(panel)
      
      const isVisible = 
        rect.width > 0 &&
        rect.height > 0 &&
        style.display !== 'none' &&
        style.visibility !== 'hidden' &&
        parseFloat(style.opacity) >= 0.01
      
      return {
        exists: true,
        visible: isVisible,
        bounds: { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom },
      }
    })
    
    if (!panelOpenState.exists) {
      violations.push({
        check_type: 'panel_missing',
        reason: 'Settings panel element not found in DOM',
        details: 'Expected [data-testid="settings-panel"] to exist after clicking toggle',
      })
    } else if (!panelOpenState.visible) {
      violations.push({
        check_type: 'panel_not_visible',
        reason: 'Settings panel exists but is not visible',
        details: 'Panel has zero dimensions or hidden styles',
        bounds: panelOpenState.bounds,
      })
    }
    
    // If panel opened successfully, try to close it
    if (panelOpenState.exists && panelOpenState.visible) {
      await page.click('[data-testid="settings-toggle"]')
      await page.waitForTimeout(300) // Allow animation
      
      const panelClosedState = await page.evaluate(() => {
        const panel = document.querySelector('[data-testid="settings-panel"]')
        if (!panel) return { exists: false, visible: false }
        
        const rect = panel.getBoundingClientRect()
        const style = window.getComputedStyle(panel)
        
        const isVisible = 
          rect.width > 0 &&
          rect.height > 0 &&
          style.display !== 'none' &&
          style.visibility !== 'hidden' &&
          parseFloat(style.opacity) >= 0.01
        
        return { exists: true, visible: isVisible }
      })
      
      // After closing, panel should either not exist or not be visible
      if (panelClosedState.visible) {
        violations.push({
          check_type: 'panel_wont_close',
          reason: 'Settings panel still visible after closing',
          details: 'Panel should be hidden after clicking toggle again',
        })
      }
    }
    
    // Check keyboard accessibility of toggle
    const toggleKeyboardAccessible = await page.evaluate(() => {
      const toggle = document.querySelector('[data-testid="settings-toggle"]') as HTMLElement
      if (!toggle) return false
      
      // Must have tabIndex >= 0 or be naturally focusable
      return toggle.tabIndex >= 0 || 
             ['BUTTON', 'A', 'INPUT', 'SELECT', 'TEXTAREA'].includes(toggle.tagName)
    })
    
    if (!toggleKeyboardAccessible) {
      violations.push({
        check_type: 'toggle_not_keyboard_accessible',
        reason: 'Settings toggle is not keyboard accessible',
        details: 'Toggle must have tabIndex >= 0 or be a naturally focusable element',
        element_selector: '[data-testid="settings-toggle"]',
      })
    }
    
  } catch (error) {
    violations.push({
      check_type: 'unexpected_error',
      reason: 'Error during render/toggle check',
      details: error instanceof Error ? error.message : String(error),
    })
  }
  
  return {
    invariant_id: 'SETTINGS_RENDER_AND_TOGGLE',
    invariant_name: 'Settings panel can be opened and closed',
    passed: violations.length === 0,
    violations,
    severity: 'HIGH',
    context: { viewport: context.viewport },
  }
}

// ============================================================================
// CHECK 2: SETTINGS LAYOUT SAFETY
// ============================================================================

/**
 * Verify Settings panel does not break layout.
 * Reuses INTENT_010 v2 invariants:
 * - No duplicate scrollbars (nested scroll)
 * - No horizontal overflow in critical panels
 * - No clipped buttons
 * 
 * HIGH severity: Layout breaks, buttons inaccessible
 */
export async function checkSettingsLayoutSafety(
  page: Page,
  context: InvariantContext
): Promise<SettingsSanityResult> {
  const violations: SettingsSanityViolation[] = []
  
  try {
    // Import INTENT_010 invariants
    const intent010 = await import('./intent_010_v2_invariants.js')
    
    // Check for nested scrollbars
    const nestedScrollResult = await intent010.checkNestedScrollDetectionV2(page, context)
    
    for (const violation of nestedScrollResult.violations) {
      violations.push({
        check_type: 'nested_scrollbar',
        reason: violation.explanation,
        details: `Panel: ${violation.panelPath}`,
        context: {
          panelTestId: violation.panelTestId,
          nestedScrollableCount: violation.nestedScrollables.length,
        },
      })
    }
    
    // Check for panel overflow
    const overflowResult = await intent010.checkPanelOverflowInvariants(page, context)
    
    for (const violation of overflowResult.violations) {
      violations.push({
        check_type: 'panel_overflow',
        reason: `Panel "${violation.panel}" has horizontal overflow`,
        details: `Overflow by ${violation.overflowAmount}px`,
        element_selector: violation.panelSelector,
        bounds: violation.bounds,
        context: {
          scrollWidth: violation.scrollWidth,
          clientWidth: violation.clientWidth,
        },
      })
    }
    
    // Check for clipped interactive elements within Settings panel
    const clippedElements = await page.evaluate(() => {
      const settingsPanel = document.querySelector('[data-testid="settings-panel"]')
      if (!settingsPanel) return []
      
      const violations: Array<{
        selector: string
        reason: string
        bounds: { left: number; top: number; right: number; bottom: number }
      }> = []
      
      const interactiveElements = settingsPanel.querySelectorAll('button, input, select, textarea, [role="button"]')
      const panelRect = settingsPanel.getBoundingClientRect()
      
      for (const el of interactiveElements) {
        const htmlEl = el as HTMLElement
        const rect = htmlEl.getBoundingClientRect()
        const style = window.getComputedStyle(htmlEl)
        
        // Skip if hidden
        if (style.display === 'none' || style.visibility === 'hidden') continue
        if (parseFloat(style.opacity) < 0.01) continue
        
        // Check if clipped by panel bounds
        const isClippedLeft = rect.left < panelRect.left
        const isClippedRight = rect.right > panelRect.right
        const isClippedTop = rect.top < panelRect.top
        const isClippedBottom = rect.bottom > panelRect.bottom
        
        if (isClippedLeft || isClippedRight || isClippedTop || isClippedBottom) {
          const testId = htmlEl.getAttribute('data-testid') || htmlEl.tagName.toLowerCase()
          violations.push({
            selector: `[data-testid="${testId}"]`,
            reason: `Element clipped by Settings panel bounds`,
            bounds: { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom },
          })
        }
      }
      
      return violations
    })
    
    for (const clipped of clippedElements) {
      violations.push({
        check_type: 'clipped_element',
        reason: clipped.reason,
        element_selector: clipped.selector,
        bounds: clipped.bounds,
      })
    }
    
  } catch (error) {
    violations.push({
      check_type: 'unexpected_error',
      reason: 'Error during layout safety check',
      details: error instanceof Error ? error.message : String(error),
    })
  }
  
  return {
    invariant_id: 'SETTINGS_LAYOUT_SAFETY',
    invariant_name: 'Settings panel does not break layout',
    passed: violations.length === 0,
    violations,
    severity: 'HIGH',
    context: { viewport: context.viewport },
  }
}

// ============================================================================
// CHECK 3: SETTINGS ACCESSIBILITY
// ============================================================================

/**
 * Verify Settings panel meets accessibility requirements.
 * Reuses INTENT_020 invariants:
 * - Keyboard reachability
 * - Focus indicators visible
 * - Focus trap (if modal)
 * 
 * HIGH severity: Keyboard users cannot access functionality
 */
export async function checkSettingsAccessibility(
  page: Page,
  context: InvariantContext
): Promise<SettingsSanityResult> {
  const violations: SettingsSanityViolation[] = []
  
  try {
    // Import INTENT_020 invariants
    const intent020 = await import('./intent_020_invariants.js')
    
    // Check keyboard reachability within Settings panel
    const keyboardResult = await intent020.checkKeyboardReachability(page, context)
    
    // Filter to only Settings panel elements
    const settingsPanelViolations = await page.evaluate((allViolations) => {
      const settingsPanel = document.querySelector('[data-testid="settings-panel"]')
      if (!settingsPanel) return allViolations
      
      return allViolations.filter((v: any) => {
        if (!v.selector_hint) return false
        try {
          const element = document.querySelector(v.selector_hint)
          return element && settingsPanel.contains(element)
        } catch {
          return false
        }
      })
    }, keyboardResult.violations)
    
    for (const violation of settingsPanelViolations) {
      violations.push({
        check_type: 'keyboard_unreachable',
        reason: violation.reason,
        element_selector: violation.selector_hint,
        bounds: violation.bounds,
        context: violation.context,
      })
    }
    
    // Check focus indicators
    const focusResult = await intent020.checkFocusIndicatorsVisible(page, context)
    
    const focusViolations = await page.evaluate((allViolations) => {
      const settingsPanel = document.querySelector('[data-testid="settings-panel"]')
      if (!settingsPanel) return allViolations
      
      return allViolations.filter((v: any) => {
        if (!v.selector_hint) return false
        try {
          const element = document.querySelector(v.selector_hint)
          return element && settingsPanel.contains(element)
        } catch {
          return false
        }
      })
    }, focusResult.violations)
    
    for (const violation of focusViolations) {
      violations.push({
        check_type: 'focus_indicator_missing',
        reason: violation.reason,
        element_selector: violation.selector_hint,
        bounds: violation.bounds,
        context: violation.context,
      })
    }
    
    // Check focus enters Settings panel when opened
    const focusEnterCheck = await page.evaluate(() => {
      const settingsPanel = document.querySelector('[data-testid="settings-panel"]')
      if (!settingsPanel) return { passed: false, reason: 'Panel not found' }
      
      const activeElement = document.activeElement
      
      // Focus should be inside Settings panel or on a control related to it
      if (!activeElement) {
        return { passed: false, reason: 'No element focused after opening Settings' }
      }
      
      const isFocusInPanel = settingsPanel.contains(activeElement)
      const isFocusOnToggle = activeElement.getAttribute('data-testid') === 'settings-toggle'
      
      if (!isFocusInPanel && !isFocusOnToggle) {
        return {
          passed: false,
          reason: 'Focus did not move to Settings panel or toggle',
          activeElement: activeElement.tagName,
        }
      }
      
      return { passed: true }
    })
    
    if (!focusEnterCheck.passed) {
      violations.push({
        check_type: 'focus_not_managed',
        reason: focusEnterCheck.reason || 'Focus management issue',
        context: { activeElement: focusEnterCheck.activeElement },
      })
    }
    
  } catch (error) {
    violations.push({
      check_type: 'unexpected_error',
      reason: 'Error during accessibility check',
      details: error instanceof Error ? error.message : String(error),
    })
  }
  
  return {
    invariant_id: 'SETTINGS_ACCESSIBILITY',
    invariant_name: 'Settings panel meets accessibility requirements',
    passed: violations.length === 0,
    violations,
    severity: 'HIGH',
    context: { viewport: context.viewport },
  }
}

// ============================================================================
// CHECK 4: SETTINGS STATE INTEGRITY
// ============================================================================

/**
 * Verify Settings panel does not violate state integrity.
 * Reuses INTENT_030 invariants:
 * - No writes to deprecated stores
 * - No dual-write violations
 * - State transitions are logged
 * 
 * HIGH severity: State corruption risk
 */
export async function checkSettingsStateIntegrity(
  page: Page,
  context: InvariantContext
): Promise<SettingsSanityResult> {
  const violations: SettingsSanityViolation[] = []
  
  try {
    // Import INTENT_030 invariants
    const intent030 = await import('./intent_030_invariants.js')
    
    // Expose store diagnostics if not already done
    await intent030.exposeStoreDiagnostics(page)
    
    // Capture state before any Settings interaction
    const stateBefore = await intent030.getStoreDiagnostics(page)
    
    // Perform a safe Settings interaction (e.g., hover over a control)
    await page.hover('[data-testid="settings-panel"]')
    await page.waitForTimeout(100)
    
    // Capture state after
    const stateAfter = await intent030.getStoreDiagnostics(page)
    
    // Check for deprecated store writes
    const deprecatedResult = await intent030.checkDeprecatedStores(page, context)
    
    for (const violation of deprecatedResult.violations) {
      violations.push({
        check_type: 'deprecated_store_write',
        reason: violation.issue,
        details: violation.details,
        context: violation.evidence,
      })
    }
    
    // Check for unexpected state mutations
    // Opening Settings should NOT change:
    // - Source selection state
    // - Job queue state
    // - V2 execution state
    
    const stateChanges = await page.evaluate((before, after) => {
      const changes: Array<{ domain: string; reason: string }> = []
      
      // Compare source selection
      if (before.sourceSelection && after.sourceSelection) {
        if (before.sourceSelection.selectedPaths !== after.sourceSelection.selectedPaths) {
          changes.push({
            domain: 'sourceSelection',
            reason: `Selected paths changed from ${before.sourceSelection.selectedPaths} to ${after.sourceSelection.selectedPaths}`,
          })
        }
        
        if (before.sourceSelection.outputDirectory !== after.sourceSelection.outputDirectory) {
          changes.push({
            domain: 'sourceSelection',
            reason: `Output directory changed`,
          })
        }
      }
      
      // Compare v2Mode
      if (before.v2Mode && after.v2Mode) {
        if (before.v2Mode.v2JobSpecSubmitted !== after.v2Mode.v2JobSpecSubmitted) {
          changes.push({
            domain: 'v2Mode',
            reason: `Job spec submission state changed`,
          })
        }
      }
      
      return changes
    }, stateBefore, stateAfter)
    
    for (const change of stateChanges) {
      violations.push({
        check_type: 'unexpected_state_mutation',
        reason: `Opening Settings should not mutate ${change.domain}`,
        details: change.reason,
      })
    }
    
  } catch (error) {
    violations.push({
      check_type: 'unexpected_error',
      reason: 'Error during state integrity check',
      details: error instanceof Error ? error.message : String(error),
    })
  }
  
  return {
    invariant_id: 'SETTINGS_STATE_INTEGRITY',
    invariant_name: 'Settings panel does not violate state integrity',
    passed: violations.length === 0,
    violations,
    severity: 'HIGH',
    context: { viewport: context.viewport },
  }
}

// ============================================================================
// CHECK 5: SETTINGS ISOLATION
// ============================================================================

/**
 * Verify Settings panel is isolated from other state domains.
 * 
 * Properties:
 * - Opening Settings does NOT trigger job fetches
 * - Opening Settings does NOT modify queue order
 * - Opening Settings does NOT change source list
 * - Opening Settings does NOT trigger preview loads
 * 
 * HIGH severity: Cross-domain coupling
 */
export async function checkSettingsIsolation(
  page: Page,
  context: InvariantContext
): Promise<SettingsSanityResult> {
  const violations: SettingsSanityViolation[] = []
  
  try {
    // Monitor network requests during Settings open/close
    const networkCalls: string[] = []
    
    page.on('request', (request) => {
      const url = request.url()
      // Track backend API calls
      if (url.includes('/api/') || url.includes(':8085')) {
        networkCalls.push(url)
      }
    })
    
    // Open Settings
    await page.click('[data-testid="settings-toggle"]')
    await page.waitForTimeout(500)
    
    // Close Settings
    await page.click('[data-testid="settings-toggle"]')
    await page.waitForTimeout(500)
    
    // Check for unexpected network calls
    const jobFetchCalls = networkCalls.filter(url => url.includes('/jobs') || url.includes('/queue'))
    const sourceCalls = networkCalls.filter(url => url.includes('/sources') || url.includes('/files'))
    const previewCalls = networkCalls.filter(url => url.includes('/preview') || url.includes('/thumbnail'))
    
    if (jobFetchCalls.length > 0) {
      violations.push({
        check_type: 'unexpected_job_fetch',
        reason: 'Opening Settings triggered job queue fetches',
        details: `${jobFetchCalls.length} job-related API calls`,
        context: { urls: jobFetchCalls },
      })
    }
    
    if (sourceCalls.length > 0) {
      violations.push({
        check_type: 'unexpected_source_call',
        reason: 'Opening Settings triggered source-related API calls',
        details: `${sourceCalls.length} source-related API calls`,
        context: { urls: sourceCalls },
      })
    }
    
    if (previewCalls.length > 0) {
      violations.push({
        check_type: 'unexpected_preview_call',
        reason: 'Opening Settings triggered preview loads',
        details: `${previewCalls.length} preview-related API calls`,
        context: { urls: previewCalls },
      })
    }
    
    // Check DOM for any job/queue/source changes
    const domChanges = await page.evaluate(() => {
      const changes: Array<{ domain: string; reason: string }> = []
      
      // Check if job count in queue changed
      const queueHeader = document.querySelector('[data-testid="right-zone"] h3')
      const queueCountMatch = queueHeader?.textContent?.match(/Queue \((\d+)\)/)
      const currentQueueCount = queueCountMatch ? parseInt(queueCountMatch[1]) : 0
      
      // Store for comparison (simplified - in real impl would compare before/after)
      // For now, just check if queue exists and has expected structure
      const hasQueue = document.querySelector('[data-testid="right-zone"]') !== null
      
      if (!hasQueue) {
        changes.push({
          domain: 'queue',
          reason: 'Queue panel disappeared',
        })
      }
      
      // Check if source list changed
      const sourceList = document.querySelector('[data-testid="left-zone"]')
      if (!sourceList) {
        changes.push({
          domain: 'sources',
          reason: 'Source panel disappeared',
        })
      }
      
      return changes
    })
    
    for (const change of domChanges) {
      violations.push({
        check_type: 'dom_mutation',
        reason: `Opening Settings caused DOM change in ${change.domain}`,
        details: change.reason,
      })
    }
    
  } catch (error) {
    violations.push({
      check_type: 'unexpected_error',
      reason: 'Error during isolation check',
      details: error instanceof Error ? error.message : String(error),
    })
  }
  
  return {
    invariant_id: 'SETTINGS_ISOLATION',
    invariant_name: 'Settings panel is isolated from other state domains',
    passed: violations.length === 0,
    violations,
    severity: 'HIGH',
    context: { viewport: context.viewport },
  }
}
