/**
 * INTENT_010 — Basic Usability & Layout Sanity
 * 
 * This intent validates ONLY static usability and layout issues:
 * - No duplicate scrollbars in left panel
 * - App window is resizable (unless explicitly locked)
 * - No buttons visually clipped at 1440x900
 * - No horizontal scrollbars in main panels
 * 
 * IMPORTANT:
 * - NO file selection
 * - NO backend calls
 * - NO job creation
 * - Pure DOM/layout inspection
 * 
 * DIAGNOSTICS:
 * - Emits structured failure payloads with actionable data
 * - Generates human-readable markdown report on failure
 * - Uses severity classification (HIGH / MEDIUM)
 * 
 * Run with:
 *   npx playwright test intent_010_usability.spec.ts
 */

import { test, expect } from './helpers'
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
  detectRegression,
  generateRegressionSection,
  isUpdateMode,
  type RegressionResult,
} from './intent_010_baseline'
import {
  runAllInvariants,
  generateInvariantSection,
  type InvariantResult,
  type InvariantContext,
} from './intent_010_invariants'
import {
  isHumanConfirmEnabled,
  requestConfirmation,
  createSession,
  finalizeSession,
  saveConfirmationSession,
  generateConfirmationSection,
  type ConfirmationSession,
  type HumanConfirmation,
} from './intent_010_human_confirm'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const projectRoot = path.resolve(__dirname, '../../../..')

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

interface BoundingBox {
  left: number
  top: number
  right: number
  bottom: number
  width: number
  height: number
}

interface FailurePayload {
  check_id: string
  check_name: string
  failing_selectors: string[]
  bounding_boxes: BoundingBox[]
  viewport: { width: number; height: number }
  screenshot_path: string
  raw_details: Record<string, unknown>
}

interface UsabilityCheck {
  name: string
  check_id: string
  passed: boolean
  reason?: string
  screenshot?: string
  failure_payload?: FailurePayload
}

type Severity = 'HIGH' | 'MEDIUM'

interface UsabilityResult {
  intent_id: string
  timestamp: string
  verdict: 'VERIFIED_OK' | 'VERIFIED_NOT_OK'
  severity?: Severity
  checks: UsabilityCheck[]
  failed_at?: string
  failure_payload?: FailurePayload
  report_path?: string
  regressions?: RegressionResult[]
  invariants?: InvariantResult[]
  human_confirmations?: ConfirmationSession
}

// ============================================================================
// PLAIN ENGLISH EXPLANATIONS
// ============================================================================

const FAILURE_EXPLANATIONS: Record<string, (payload: FailurePayload) => string> = {
  'duplicate_scrollbars': (payload) => {
    const count = (payload.raw_details.nested_count as number) || 0
    return `The left panel has ${count} nested scrollable areas. This creates a confusing "scroll within scroll" experience where users can accidentally scroll the wrong container. The panel should have only one scrollable area.`
  },
  'window_not_resizable': () => {
    return `The application window cannot be resized by the user. This prevents users from adjusting the workspace to fit their monitor or workflow. The window should allow horizontal and vertical resizing.`
  },
  'buttons_clipped': (payload) => {
    const clipped = payload.raw_details.clipped_buttons as Array<{ text: string; reason: string }>
    const buttonList = clipped.map(b => `"${b.text}"`).join(', ')
    return `${clipped.length} button(s) are cut off at the edges of the window: ${buttonList}. Users cannot see or click these buttons at 1440×900 resolution. The layout needs to account for standard screen sizes.`
  },
  'horizontal_scrollbars': (payload) => {
    const panels = payload.raw_details.panels_affected as string[]
    return `${panels.length} panel(s) have horizontal scrollbars: ${panels.join(', ')}. This indicates content is wider than its container, making the UI feel cramped and requiring awkward side-scrolling.`
  },
}

// ============================================================================
// MAIN TEST
// ============================================================================

test.describe('INTENT_010 — Basic Usability & Layout Sanity', () => {
  test('verify layout sanity at 1440x900', async ({ page, visualCollector, app }) => {
    const artifactDir = visualCollector.artifactDir
    const checks: UsabilityCheck[] = []
    const regressionResults: RegressionResult[] = []
    const confirmSession = isHumanConfirmEnabled() ? createSession() : null
    // Use object wrapper to avoid TypeScript narrowing issues
    const state = {
      firstFailure: null as UsabilityCheck | null,
      windowIsResizable: true,
      hasClippedButtons: false,
    }

    console.log('\n═══════════════════════════════════════════════════════════')
    console.log('  INTENT_010 — Basic Usability & Layout Sanity')
    console.log('═══════════════════════════════════════════════════════════')
    console.log(`  Artifact dir: ${artifactDir}`)
    if (isUpdateMode()) {
      console.log(`  ⚡ BASELINE UPDATE MODE: Will save current metrics as new baseline`)
    }
    if (isHumanConfirmEnabled()) {
      console.log(`  👤 HUMAN CONFIRM MODE: Will pause on failures for review`)
    }
    console.log('')

    // Get viewport size once for all checks
    const viewport = await page.evaluate(() => ({
      width: window.innerWidth,
      height: window.innerHeight,
    }))

    // Helper: capture screenshot with check name
    async function captureCheckScreenshot(checkName: string): Promise<string> {
      const filename = `check_${checkName.replace(/\s+/g, '_').toLowerCase()}.png`
      const screenshotPath = path.join(artifactDir, filename)
      await page.screenshot({ path: screenshotPath, fullPage: true })
      console.log(`   📸 Screenshot: ${filename}`)
      return screenshotPath
    }

    // Helper: record check result with optional failure payload
    function recordCheck(
      checkId: string,
      name: string, 
      passed: boolean, 
      reason?: string, 
      screenshot?: string,
      failurePayload?: FailurePayload
    ) {
      const check: UsabilityCheck = { 
        check_id: checkId,
        name, 
        passed, 
        reason, 
        screenshot,
        failure_payload: failurePayload,
      }
      checks.push(check)
      
      if (passed) {
        console.log(`   ✅ ${name}`)
      } else {
        console.log(`   ❌ ${name}`)
        if (reason) console.log(`      Reason: ${reason}`)
        if (!state.firstFailure) {
          state.firstFailure = check
        }
      }
    }

    // =========================================================================
    // CHECK 1: No duplicate scrollbars in left panel
    // =========================================================================
    console.log('\n🔍 Check 1: No duplicate scrollbars in left panel')
    
    try {
      const panelSelectors = [
        '[data-testid="left-panel"]',
        '[data-testid="source-panel"]',
        'aside',
        '.left-panel',
        '.source-panel',
        '[class*="sidebar"]',
      ]
      
      const scrollbarCheck = await page.evaluate((selectors) => {
        for (const selector of selectors) {
          const panel = document.querySelector(selector)
          if (!panel) continue
          
          // Count elements with overflow-y: scroll or auto that have scrollable content
          let scrollableCount = 0
          const scrollableElements: Array<{ selector: string; rect: DOMRect }> = []
          
          const walk = (el: Element) => {
            const style = window.getComputedStyle(el)
            if ((style.overflowY === 'scroll' || style.overflowY === 'auto') && 
                el.scrollHeight > el.clientHeight) {
              scrollableCount++
              scrollableElements.push({
                selector: el.tagName.toLowerCase() + (el.className ? `.${el.className.split(' ')[0]}` : ''),
                rect: el.getBoundingClientRect(),
              })
            }
            Array.from(el.children).forEach(child => walk(child))
          }
          walk(panel)
          
          return {
            found: true,
            panelSelector: selector,
            panelRect: panel.getBoundingClientRect(),
            nestedCount: scrollableCount,
            hasNested: scrollableCount > 1,
            scrollableElements,
          }
        }
        
        return { found: false, panelSelector: null, nestedCount: 0, hasNested: false, scrollableElements: [] }
      }, panelSelectors)
      
      const screenshot = await captureCheckScreenshot('left_panel_scrollbars')
      
      if (!scrollbarCheck.found) {
        recordCheck('duplicate_scrollbars', 'No duplicate scrollbars in left panel', true, 
          'Left panel not found (acceptable in idle state)', screenshot)
      } else if (scrollbarCheck.hasNested) {
        const failurePayload: FailurePayload = {
          check_id: 'duplicate_scrollbars',
          check_name: 'No duplicate scrollbars in left panel',
          failing_selectors: scrollbarCheck.scrollableElements.map(e => e.selector),
          bounding_boxes: scrollbarCheck.scrollableElements.map(e => ({
            left: e.rect.left,
            top: e.rect.top,
            right: e.rect.right,
            bottom: e.rect.bottom,
            width: e.rect.width,
            height: e.rect.height,
          })),
          viewport,
          screenshot_path: screenshot,
          raw_details: {
            panel_selector: scrollbarCheck.panelSelector,
            nested_count: scrollbarCheck.nestedCount,
          },
        }
        recordCheck('duplicate_scrollbars', 'No duplicate scrollbars in left panel', false, 
          `Found ${scrollbarCheck.nestedCount} nested scrollable elements (should be max 1)`, 
          screenshot, failurePayload)
      } else {
        recordCheck('duplicate_scrollbars', 'No duplicate scrollbars in left panel', true, undefined, screenshot)
      }
    } catch (err) {
      const screenshot = await captureCheckScreenshot('left_panel_error')
      recordCheck('duplicate_scrollbars', 'No duplicate scrollbars in left panel', false, 
        `Error during check: ${(err as Error).message}`, screenshot)
    }
    
    // Baseline regression detection for check 1
    const check1Metrics = {
      nested_scrollable_count: checks[checks.length - 1]?.failure_payload?.raw_details?.nested_count ?? 0,
    }
    regressionResults.push(detectRegression('duplicate_scrollbars', check1Metrics, viewport))

    // FAIL FAST: Stop if first check failed
    if (state.firstFailure) {
      // Request human confirmation if enabled
      if (confirmSession) {
        const confirmation = await requestConfirmation(
          state.firstFailure.check_id,
          state.firstFailure.name,
          state.firstFailure.reason || 'Check failed',
          state.firstFailure.screenshot
        )
        confirmSession.confirmations.push(confirmation)
        
        // If human accepted, continue (don't fail)
        if (confirmation.human_response === 'ACCEPT') {
          console.log('   ⏩ Human override: continuing despite failure')
          state.firstFailure = null // Clear failure to continue
        }
      }
      
      if (state.firstFailure) {
        const severity = determineSeverity(state.windowIsResizable, state.hasClippedButtons, state.firstFailure.check_id)
        const finalSession = confirmSession ? finalizeSession(confirmSession) : undefined
        await saveResultWithReport(artifactDir, 'VERIFIED_NOT_OK', checks, state.firstFailure, severity, regressionResults, undefined, finalSession)
        throw new Error(`Usability check failed: ${state.firstFailure.name}`)
      }
    }

    // =========================================================================
    // CHECK 2: App window is resizable
    // =========================================================================
    console.log('\n🔍 Check 2: App window is resizable')
    
    try {
      const windowInfo = await app.evaluate(({ BrowserWindow }) => {
        const win = BrowserWindow.getAllWindows()[0]
        if (!win) return null
        const bounds = win.getBounds()
        return {
          width: bounds.width,
          height: bounds.height,
          resizable: win.isResizable(),
          minimizable: win.isMinimizable(),
          maximizable: win.isMaximizable(),
        }
      })
      
      if (!windowInfo) {
        const screenshot = await captureCheckScreenshot('no_window')
        recordCheck('window_not_resizable', 'App window is resizable', false, 
          'Could not get window bounds', screenshot)
      } else {
        state.windowIsResizable = windowInfo.resizable
        
        if (!windowInfo.resizable) {
          const screenshot = await captureCheckScreenshot('window_not_resizable')
          const failurePayload: FailurePayload = {
            check_id: 'window_not_resizable',
            check_name: 'App window is resizable',
            failing_selectors: ['BrowserWindow'],
            bounding_boxes: [{
              left: 0,
              top: 0,
              right: windowInfo.width,
              bottom: windowInfo.height,
              width: windowInfo.width,
              height: windowInfo.height,
            }],
            viewport,
            screenshot_path: screenshot,
            raw_details: {
              resizable: windowInfo.resizable,
              minimizable: windowInfo.minimizable,
              maximizable: windowInfo.maximizable,
              window_size: { width: windowInfo.width, height: windowInfo.height },
            },
          }
          recordCheck('window_not_resizable', 'App window is resizable', false, 
            'Window isResizable() returned false', screenshot, failurePayload)
        } else {
          const screenshot = await captureCheckScreenshot('window_resizable')
          recordCheck('window_not_resizable', 'App window is resizable', true, undefined, screenshot)
        }
      }
    } catch (err) {
      const screenshot = await captureCheckScreenshot('resizable_error')
      recordCheck('window_not_resizable', 'App window is resizable', false, 
        `Error during check: ${(err as Error).message}`, screenshot)
    }
    
    // Baseline regression detection for check 2
    const check2Metrics = {
      resizable: state.windowIsResizable,
    }
    regressionResults.push(detectRegression('window_not_resizable', check2Metrics, viewport))

    // FAIL FAST
    if (state.firstFailure) {
      if (confirmSession) {
        const confirmation = await requestConfirmation(
          state.firstFailure.check_id,
          state.firstFailure.name,
          state.firstFailure.reason || 'Check failed',
          state.firstFailure.screenshot
        )
        confirmSession.confirmations.push(confirmation)
        if (confirmation.human_response === 'ACCEPT') {
          console.log('   ⏩ Human override: continuing despite failure')
          state.firstFailure = null
        }
      }
      
      if (state.firstFailure) {
        const severity = determineSeverity(state.windowIsResizable, state.hasClippedButtons, state.firstFailure.check_id)
        const finalSession = confirmSession ? finalizeSession(confirmSession) : undefined
        await saveResultWithReport(artifactDir, 'VERIFIED_NOT_OK', checks, state.firstFailure, severity, regressionResults, undefined, finalSession)
        throw new Error(`Usability check failed: ${state.firstFailure.name}`)
      }
    }

    // =========================================================================
    // CHECK 3: No buttons are visually clipped at 1440x900
    // =========================================================================
    console.log('\n🔍 Check 3: No buttons visually clipped at 1440x900')
    
    try {
      const buttonCheck = await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button'))
        const viewportWidth = window.innerWidth
        const viewportHeight = window.innerHeight
        const clipped: Array<{ 
          text: string
          reason: string
          selector: string
          rect: { left: number; top: number; right: number; bottom: number; width: number; height: number }
        }> = []
        
        for (const btn of buttons) {
          const style = window.getComputedStyle(btn)
          if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
            continue
          }
          
          const rect = btn.getBoundingClientRect()
          if (rect.width === 0 || rect.height === 0) {
            continue
          }
          
          const btnText = btn.textContent?.trim() || btn.getAttribute('aria-label') || '[unnamed]'
          const btnSelector = btn.getAttribute('data-testid') 
            ? `[data-testid="${btn.getAttribute('data-testid')}"]`
            : `button:has-text("${btnText.slice(0, 20)}")`
          
          const reasons: string[] = []
          if (rect.right > viewportWidth) {
            reasons.push(`right edge (${rect.right.toFixed(0)}px) exceeds viewport (${viewportWidth}px)`)
          }
          if (rect.bottom > viewportHeight) {
            reasons.push(`bottom edge (${rect.bottom.toFixed(0)}px) exceeds viewport (${viewportHeight}px)`)
          }
          if (rect.left < 0) {
            reasons.push(`left edge (${rect.left.toFixed(0)}px) is negative`)
          }
          if (rect.top < 0) {
            reasons.push(`top edge (${rect.top.toFixed(0)}px) is negative`)
          }
          
          if (reasons.length > 0) {
            clipped.push({ 
              text: btnText, 
              reason: reasons.join('; '), 
              selector: btnSelector,
              rect: {
                left: rect.left,
                top: rect.top,
                right: rect.right,
                bottom: rect.bottom,
                width: rect.width,
                height: rect.height,
              },
            })
          }
        }
        
        return { clipped, viewportWidth, viewportHeight }
      })
      
      const screenshot = await captureCheckScreenshot('button_clipping')
      
      if (buttonCheck.clipped.length > 0) {
        state.hasClippedButtons = true
        const clippedList = buttonCheck.clipped.map(b => `"${b.text}": ${b.reason}`).join('; ')
        const failurePayload: FailurePayload = {
          check_id: 'buttons_clipped',
          check_name: 'No buttons visually clipped at 1440x900',
          failing_selectors: buttonCheck.clipped.map(b => b.selector),
          bounding_boxes: buttonCheck.clipped.map(b => b.rect),
          viewport,
          screenshot_path: screenshot,
          raw_details: {
            clipped_buttons: buttonCheck.clipped.map(b => ({ text: b.text, reason: b.reason })),
            total_clipped: buttonCheck.clipped.length,
          },
        }
        recordCheck('buttons_clipped', 'No buttons visually clipped at 1440x900', false, 
          `${buttonCheck.clipped.length} clipped button(s): ${clippedList}`, screenshot, failurePayload)
      } else {
        recordCheck('buttons_clipped', 'No buttons visually clipped at 1440x900', true, undefined, screenshot)
      }
    } catch (err) {
      const screenshot = await captureCheckScreenshot('button_clipping_error')
      recordCheck('buttons_clipped', 'No buttons visually clipped at 1440x900', false, 
        `Error during check: ${(err as Error).message}`, screenshot)
    }
    
    // Baseline regression detection for check 3
    const check3Metrics = {
      clipped_count: state.hasClippedButtons ? 
        (checks[checks.length - 1]?.failure_payload?.raw_details?.total_clipped ?? 1) : 0,
    }
    regressionResults.push(detectRegression('buttons_clipped', check3Metrics, viewport))

    // FAIL FAST
    if (state.firstFailure) {
      if (confirmSession) {
        const confirmation = await requestConfirmation(
          state.firstFailure.check_id,
          state.firstFailure.name,
          state.firstFailure.reason || 'Check failed',
          state.firstFailure.screenshot
        )
        confirmSession.confirmations.push(confirmation)
        if (confirmation.human_response === 'ACCEPT') {
          console.log('   ⏩ Human override: continuing despite failure')
          state.firstFailure = null
        }
      }
      
      if (state.firstFailure) {
        const severity = determineSeverity(state.windowIsResizable, state.hasClippedButtons, state.firstFailure.check_id)
        const finalSession = confirmSession ? finalizeSession(confirmSession) : undefined
        await saveResultWithReport(artifactDir, 'VERIFIED_NOT_OK', checks, state.firstFailure, severity, regressionResults, undefined, finalSession)
        throw new Error(`Usability check failed: ${state.firstFailure.name}`)
      }
    }

    // =========================================================================
    // CHECK 4: No horizontal scrollbars in main panels
    // =========================================================================
    console.log('\n🔍 Check 4: No horizontal scrollbars in main panels')
    
    try {
      const scrollCheck = await page.evaluate(() => {
        const panelSelectors = [
          '[data-testid="left-panel"]',
          '[data-testid="right-panel"]',
          '[data-testid="create-job-panel"]',
          '[data-testid="job-queue-panel"]',
          'main',
          'aside',
          '[role="main"]',
        ]
        
        const withHorizontalScroll: Array<{ 
          selector: string
          scrollWidth: number
          clientWidth: number
          rect: { left: number; top: number; right: number; bottom: number; width: number; height: number }
        }> = []
        
        for (const selector of panelSelectors) {
          const elements = document.querySelectorAll(selector)
          for (const el of elements) {
            const hasHorizontalScroll = el.scrollWidth > el.clientWidth + 5
            const style = window.getComputedStyle(el)
            const hasOverflowX = style.overflowX === 'scroll' || 
              (style.overflowX === 'auto' && el.scrollWidth > el.clientWidth)
            
            if (hasHorizontalScroll && hasOverflowX) {
              const rect = el.getBoundingClientRect()
              withHorizontalScroll.push({
                selector,
                scrollWidth: el.scrollWidth,
                clientWidth: el.clientWidth,
                rect: {
                  left: rect.left,
                  top: rect.top,
                  right: rect.right,
                  bottom: rect.bottom,
                  width: rect.width,
                  height: rect.height,
                },
              })
            }
          }
        }
        
        return withHorizontalScroll
      })
      
      const screenshot = await captureCheckScreenshot('horizontal_scrollbars')
      
      if (scrollCheck.length > 0) {
        const scrollList = scrollCheck.map(s => 
          `${s.selector}: scrollWidth=${s.scrollWidth}, clientWidth=${s.clientWidth}`
        ).join('; ')
        const failurePayload: FailurePayload = {
          check_id: 'horizontal_scrollbars',
          check_name: 'No horizontal scrollbars in main panels',
          failing_selectors: scrollCheck.map(s => s.selector),
          bounding_boxes: scrollCheck.map(s => s.rect),
          viewport,
          screenshot_path: screenshot,
          raw_details: {
            panels_affected: scrollCheck.map(s => s.selector),
            scroll_dimensions: scrollCheck.map(s => ({ 
              selector: s.selector, 
              scrollWidth: s.scrollWidth, 
              clientWidth: s.clientWidth,
              overflow: s.scrollWidth - s.clientWidth,
            })),
          },
        }
        recordCheck('horizontal_scrollbars', 'No horizontal scrollbars in main panels', false, 
          `${scrollCheck.length} panel(s) with horizontal scroll: ${scrollList}`, screenshot, failurePayload)
      } else {
        recordCheck('horizontal_scrollbars', 'No horizontal scrollbars in main panels', true, undefined, screenshot)
      }
    } catch (err) {
      const screenshot = await captureCheckScreenshot('horizontal_scrollbars_error')
      recordCheck('horizontal_scrollbars', 'No horizontal scrollbars in main panels', false, 
        `Error during check: ${(err as Error).message}`, screenshot)
    }
    
    // Baseline regression detection for check 4
    const lastCheck = checks[checks.length - 1]
    const check4Metrics = {
      panels_with_horizontal_scroll: lastCheck?.failure_payload?.raw_details?.panels_affected?.length ?? 0,
    }
    regressionResults.push(detectRegression('horizontal_scrollbars', check4Metrics, viewport))

    // FAIL FAST (final check)
    if (state.firstFailure) {
      if (confirmSession) {
        const confirmation = await requestConfirmation(
          state.firstFailure.check_id,
          state.firstFailure.name,
          state.firstFailure.reason || 'Check failed',
          state.firstFailure.screenshot
        )
        confirmSession.confirmations.push(confirmation)
        if (confirmation.human_response === 'ACCEPT') {
          console.log('   ⏩ Human override: continuing despite failure')
          state.firstFailure = null
        }
      }
      
      if (state.firstFailure) {
        const severity = determineSeverity(state.windowIsResizable, state.hasClippedButtons, state.firstFailure.check_id)
        const finalSession = confirmSession ? finalizeSession(confirmSession) : undefined
        await saveResultWithReport(artifactDir, 'VERIFIED_NOT_OK', checks, state.firstFailure, severity, regressionResults, undefined, finalSession)
        throw new Error(`Usability check failed: ${state.firstFailure.name}`)
      }
    }

    // =========================================================================
    // PROPERTY-BASED INVARIANTS
    // =========================================================================
    console.log('\n🔒 Running property-based invariants...')
    
    const isE2EMode = process.env.E2E_MODE === '1' || process.env.CI === 'true'
    const invariantContext: InvariantContext = {
      viewport,
      isE2EMode,
    }
    const invariantResults = await runAllInvariants(page, state.windowIsResizable, invariantContext)
    
    const invariantFailures = invariantResults.filter(r => !r.passed)
    if (invariantFailures.length > 0) {
      console.log(`   ⚠️  ${invariantFailures.length} invariant(s) violated:`)
      for (const r of invariantFailures) {
        console.log(`      - ${r.invariant_id}: ${r.violations.length} violation(s)`)
      }
    } else {
      console.log('   ✅ All invariants hold')
    }

    // =========================================================================
    // ALL CHECKS PASSED
    // =========================================================================
    console.log('\n═══════════════════════════════════════════════════════════')
    console.log('  ✅ INTENT_010: ALL USABILITY CHECKS PASSED')
    console.log('═══════════════════════════════════════════════════════════\n')
    
    // Print regression summary if any regressions detected
    const regressions = regressionResults.filter(r => r.has_regression)
    if (regressions.length > 0) {
      console.log('⚠️  Regressions detected (even though all checks passed):')
      for (const r of regressions) {
        console.log(`   - ${r.check_id}: ${r.message}`)
      }
      console.log('')
    }
    
    // Finalize confirmation session if enabled
    const finalSession = confirmSession ? finalizeSession(confirmSession) : undefined
    
    await saveResultWithReport(artifactDir, 'VERIFIED_OK', checks, null, undefined, regressionResults, invariantResults, finalSession)
    
    expect(checks.every(c => c.passed), 'All usability checks should pass').toBe(true)
  })
})

// ============================================================================
// SEVERITY DETERMINATION
// ============================================================================

function determineSeverity(
  windowIsResizable: boolean, 
  hasClippedButtons: boolean,
  failedCheckId: string
): Severity {
  // HIGH severity: non-resizable window AND clipped buttons
  // This is a critical usability issue - users cannot see buttons AND cannot resize to fix it
  if (!windowIsResizable && hasClippedButtons) {
    return 'HIGH'
  }
  
  // HIGH severity if the specific check combo is met
  if (failedCheckId === 'buttons_clipped' && !windowIsResizable) {
    return 'HIGH'
  }
  
  // MEDIUM severity for all other failures
  return 'MEDIUM'
}

// ============================================================================
// RESULT SAVING AND REPORT GENERATION
// ============================================================================

async function saveResultWithReport(
  artifactDir: string, 
  verdict: 'VERIFIED_OK' | 'VERIFIED_NOT_OK', 
  checks: UsabilityCheck[],
  failedCheck: UsabilityCheck | null,
  severity?: Severity,
  regressionResults?: RegressionResult[],
  invariantResults?: InvariantResult[],
  confirmationSession?: ConfirmationSession
) {
  const timestamp = new Date().toISOString()
  
  // Build result object
  const result: UsabilityResult = {
    intent_id: 'INTENT_010',
    timestamp,
    verdict,
    severity,
    checks,
    failed_at: failedCheck?.name,
    failure_payload: failedCheck?.failure_payload,
    regressions: regressionResults,
    invariants: invariantResults,
    human_confirmations: confirmationSession,
  }
  
  // Save JSON result
  const resultPath = path.join(artifactDir, 'intent_010_result.json')
  fs.writeFileSync(resultPath, JSON.stringify(result, null, 2))
  console.log(`\n💾 JSON result saved: ${resultPath}`)
  
  // Generate markdown report
  const reportPath = path.join(artifactDir, 'intent_010_usability_report.md')
  const reportContent = generateMarkdownReport(result, artifactDir)
  fs.writeFileSync(reportPath, reportContent)
  console.log(`📝 Markdown report saved: ${reportPath}`)
  
  result.report_path = reportPath
  
  // Update JSON with report path
  fs.writeFileSync(resultPath, JSON.stringify(result, null, 2))
}

function generateMarkdownReport(result: UsabilityResult, artifactDir: string): string {
  const lines: string[] = []
  
  // Header
  lines.push('# INTENT_010 — Usability Report')
  lines.push('')
  lines.push(`**Generated:** ${result.timestamp}`)
  lines.push(`**Verdict:** ${result.verdict === 'VERIFIED_OK' ? '✅ PASS' : '❌ FAIL'}`)
  
  if (result.severity) {
    const severityEmoji = result.severity === 'HIGH' ? '🔴' : '🟡'
    lines.push(`**Severity:** ${severityEmoji} ${result.severity}`)
  }
  
  lines.push('')
  lines.push('---')
  lines.push('')
  
  if (result.verdict === 'VERIFIED_OK') {
    // Success case
    lines.push('## ✅ All Usability Checks Passed')
    lines.push('')
    lines.push('The application passed all layout and usability checks at 1440×900 resolution.')
    lines.push('')
    lines.push('### Checks Performed')
    lines.push('')
    for (const check of result.checks) {
      lines.push(`- ✅ ${check.name}`)
    }
  } else {
    // Failure case - show ONE failure (fail-fast)
    lines.push('## ❌ Usability Check Failed')
    lines.push('')
    
    const failedCheck = result.checks.find(c => !c.passed)
    if (failedCheck) {
      lines.push(`### Failed Check: ${failedCheck.name}`)
      lines.push('')
      
      // Plain English explanation
      const payload = failedCheck.failure_payload
      if (payload && FAILURE_EXPLANATIONS[payload.check_id]) {
        lines.push('#### What Went Wrong')
        lines.push('')
        lines.push(FAILURE_EXPLANATIONS[payload.check_id](payload))
        lines.push('')
      }
      
      // Technical details
      lines.push('#### Technical Details')
      lines.push('')
      if (failedCheck.reason) {
        lines.push(`**Reason:** ${failedCheck.reason}`)
        lines.push('')
      }
      
      if (payload) {
        lines.push(`**Viewport:** ${payload.viewport.width}×${payload.viewport.height}`)
        lines.push('')
        
        if (payload.failing_selectors.length > 0) {
          lines.push('**Affected Elements:**')
          lines.push('')
          for (const selector of payload.failing_selectors) {
            lines.push(`- \`${selector}\``)
          }
          lines.push('')
        }
        
        if (payload.bounding_boxes.length > 0) {
          lines.push('**Bounding Boxes:**')
          lines.push('')
          lines.push('| Element | Left | Top | Right | Bottom | Width | Height |')
          lines.push('|---------|------|-----|-------|--------|-------|--------|')
          for (let i = 0; i < payload.bounding_boxes.length; i++) {
            const box = payload.bounding_boxes[i]
            const selector = payload.failing_selectors[i] || `Element ${i + 1}`
            lines.push(`| \`${selector.slice(0, 30)}\` | ${box.left.toFixed(0)} | ${box.top.toFixed(0)} | ${box.right.toFixed(0)} | ${box.bottom.toFixed(0)} | ${box.width.toFixed(0)} | ${box.height.toFixed(0)} |`)
          }
          lines.push('')
        }
      }
      
      // Screenshot
      if (failedCheck.screenshot) {
        lines.push('#### Screenshot')
        lines.push('')
        const relativePath = path.relative(artifactDir, failedCheck.screenshot)
        lines.push(`![Failure Screenshot](${relativePath})`)
        lines.push('')
      }
      
      // Severity explanation
      if (result.severity === 'HIGH') {
        lines.push('#### ⚠️ High Severity')
        lines.push('')
        lines.push('This issue is marked as **HIGH** severity because the window is non-resizable AND buttons are clipped. Users cannot work around this by resizing the window.')
        lines.push('')
      }
    }
  }
  
  // Regression section
  if (result.regressions && result.regressions.length > 0) {
    lines.push('')
    lines.push(generateRegressionSection(result.regressions))
  }
  
  // Invariant section
  if (result.invariants && result.invariants.length > 0) {
    lines.push('')
    lines.push(generateInvariantSection(result.invariants))
  }
  
  // Human confirmation section
  if (result.human_confirmations) {
    lines.push('')
    lines.push(generateConfirmationSection(result.human_confirmations))
  }
  
  // Footer
  lines.push('---')
  lines.push('')
  lines.push('*This report was generated by INTENT_010 — Basic Usability & Layout Sanity QC.*')
  
  return lines.join('\n')
}
