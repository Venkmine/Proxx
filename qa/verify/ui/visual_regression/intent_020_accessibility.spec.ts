/**
 * INTENT_020 — Accessibility & Interaction Sanity
 * 
 * Validates accessibility and interaction properties in idle state:
 * - Keyboard reachability (Tab navigation)
 * - Focus indicators visibility
 * - Dead-click detection
 * - Invisible interactive elements
 * - Cursor/hitbox alignment
 * - Focus trap validation (for modals)
 * 
 * EXIT CODES (via test failure):
 * - HIGH severity violations → exit 1 (blocking)
 * - MEDIUM severity violations → exit 2 (warning)
 * - All passed → exit 0
 * 
 * ARTIFACTS:
 * - intent_020_result.json (structured JSON result)
 * - intent_020_report.md (human-readable markdown report)
 * 
 * RUN LOCALLY:
 *   cd qa/verify/ui/visual_regression
 *   npx playwright test intent_020_accessibility.spec.ts
 * 
 * INTEGRATION:
 *   Integrated into run_qc_loop.mjs Phase 4 summary
 */

import { test, expect } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import type { Page } from '@playwright/test'
import {
  checkKeyboardReachability,
  checkFocusIndicatorsVisible,
  checkDeadClicks,
  checkInvisibleInteractive,
  checkCursorHitboxMatch,
  checkFocusTrap,
  type InvariantResult,
  type AccessibilityViolation,
  type InvariantContext,
} from './intent_020_invariants'

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

interface CheckResult {
  id: string
  name: string
  passed: boolean
  severity: 'HIGH' | 'MEDIUM'
  violation_count?: number
  violations?: AccessibilityViolation[]
  screenshot_path?: string
}

interface AccessibilityResult {
  intent_id: 'INTENT_020'
  timestamp: string
  verdict: 'VERIFIED_OK' | 'VERIFIED_NOT_OK'
  severity?: 'HIGH' | 'MEDIUM'
  checks: CheckResult[]
  failed_at?: string
  failure_payload?: {
    check_id: string
    severity: 'HIGH' | 'MEDIUM'
    violation_count: number
    first_violation?: AccessibilityViolation
  }
  report_path?: string
}

// ============================================================================
// CONFIGURATION
// ============================================================================

const STANDARD_VIEWPORT = { width: 1440, height: 900 }

// ============================================================================
// TEST SUITE
// ============================================================================

test.use({
  viewport: STANDARD_VIEWPORT,
})

test.describe('INTENT_020 — Accessibility & Interaction Sanity', () => {
  test.beforeEach(async ({ page, visualCollector }) => {
    console.log('\n═══════════════════════════════════════════════════════════')
    console.log('  INTENT_020 — Accessibility & Interaction Sanity')
    console.log('═══════════════════════════════════════════════════════════')
    console.log(`  Artifact dir: ${visualCollector.artifactDir}`)
    console.log(`  Viewport: ${STANDARD_VIEWPORT.width}×${STANDARD_VIEWPORT.height}`)
    console.log('')
  })

  test('accessibility and interaction checks', async ({ page, visualCollector, app }) => {
    const artifactDir = visualCollector.artifactDir
    const isE2EMode = process.env.E2E_TEST === 'true'
    
    const context: InvariantContext = {
      viewport: STANDARD_VIEWPORT,
      isE2EMode,
    }
    
    // Wait for idle state
    console.log('⏳ Waiting for idle state...')
    await page.waitForTimeout(2000)
    
    const checks: CheckResult[] = []
    let firstFailure: { check: CheckResult; invariant: InvariantResult } | null = null
    
    // =========================================================================
    // CHECK 1: Keyboard Reachability (HIGH severity)
    // =========================================================================
    console.log('\n🔍 Check 1: Keyboard reachability')
    
    try {
      const result = await checkKeyboardReachability(page, context)
      
      const check: CheckResult = {
        id: result.invariant_id,
        name: result.invariant_name,
        passed: result.passed,
        severity: 'HIGH',
        violation_count: result.violations.length,
        violations: result.violations,
      }
      
      checks.push(check)
      
      if (!result.passed) {
        console.log(`   ❌ ${result.violations.length} keyboard reachability violation(s)`)
        for (const v of result.violations.slice(0, 3)) {
          console.log(`      • ${v.element_description}: ${v.reason}`)
        }
        
        if (!firstFailure) {
          // Capture failure screenshot
          const screenshotPath = path.join(artifactDir, 'keyboard_reachability_failure.png')
          await page.screenshot({ path: screenshotPath, fullPage: false })
          check.screenshot_path = screenshotPath
          console.log(`      📸 Screenshot: ${screenshotPath}`)
          
          firstFailure = { check, invariant: result }
        }
      } else {
        console.log('   ✅ All interactive elements keyboard reachable')
      }
    } catch (error) {
      console.error(`   ⚠️  Check failed with error: ${error}`)
      checks.push({
        id: 'KEYBOARD_REACHABILITY',
        name: 'Keyboard reachability check',
        passed: false,
        severity: 'HIGH',
      })
    }
    
    // Fail fast on HIGH severity
    if (firstFailure && firstFailure.check.severity === 'HIGH') {
      console.log('\n❌ FAIL FAST: HIGH severity violation detected')
      await saveResultWithReport(artifactDir, 'VERIFIED_NOT_OK', checks, firstFailure.check, 'HIGH')
      expect(false, `HIGH severity accessibility failure: ${firstFailure.check.name}`).toBe(true)
      return
    }
    
    // =========================================================================
    // CHECK 2: Focus Indicators Visible (MEDIUM severity)
    // =========================================================================
    console.log('\n🔍 Check 2: Focus indicators visible')
    
    try {
      const result = await checkFocusIndicatorsVisible(page, context)
      
      const check: CheckResult = {
        id: result.invariant_id,
        name: result.invariant_name,
        passed: result.passed,
        severity: 'MEDIUM',
        violation_count: result.violations.length,
        violations: result.violations,
      }
      
      checks.push(check)
      
      if (!result.passed) {
        console.log(`   ⚠️  ${result.violations.length} focus indicator violation(s)`)
        for (const v of result.violations.slice(0, 3)) {
          console.log(`      • ${v.element_description}: ${v.reason}`)
        }
        
        if (!firstFailure) {
          const screenshotPath = path.join(artifactDir, 'focus_indicators_failure.png')
          await page.screenshot({ path: screenshotPath, fullPage: false })
          check.screenshot_path = screenshotPath
          console.log(`      📸 Screenshot: ${screenshotPath}`)
          
          firstFailure = { check, invariant: result }
        }
      } else {
        console.log('   ✅ All focusable elements have visible indicators')
      }
    } catch (error) {
      console.error(`   ⚠️  Check failed with error: ${error}`)
      checks.push({
        id: 'FOCUS_INDICATORS_VISIBLE',
        name: 'Focus indicators check',
        passed: false,
        severity: 'MEDIUM',
      })
    }
    
    // =========================================================================
    // CHECK 3: Dead Click Detection (HIGH severity)
    // =========================================================================
    console.log('\n🔍 Check 3: Dead click detection')
    
    try {
      const result = await checkDeadClicks(page, context)
      
      const check: CheckResult = {
        id: result.invariant_id,
        name: result.invariant_name,
        passed: result.passed,
        severity: 'HIGH',
        violation_count: result.violations.length,
        violations: result.violations,
      }
      
      checks.push(check)
      
      if (!result.passed) {
        console.log(`   ❌ ${result.violations.length} dead-click violation(s)`)
        for (const v of result.violations.slice(0, 3)) {
          console.log(`      • ${v.element_description}: ${v.reason}`)
        }
        
        if (!firstFailure) {
          const screenshotPath = path.join(artifactDir, 'dead_click_failure.png')
          await page.screenshot({ path: screenshotPath, fullPage: false })
          check.screenshot_path = screenshotPath
          console.log(`      📸 Screenshot: ${screenshotPath}`)
          
          firstFailure = { check, invariant: result }
        }
      } else {
        console.log('   ✅ No dead-click elements detected')
      }
    } catch (error) {
      console.error(`   ⚠️  Check failed with error: ${error}`)
      checks.push({
        id: 'DEAD_CLICK_DETECTION',
        name: 'Dead click detection',
        passed: false,
        severity: 'HIGH',
      })
    }
    
    // Fail fast on HIGH severity
    if (firstFailure && firstFailure.check.severity === 'HIGH' && firstFailure.check.id === 'DEAD_CLICK_DETECTION') {
      console.log('\n❌ FAIL FAST: HIGH severity violation detected')
      await saveResultWithReport(artifactDir, 'VERIFIED_NOT_OK', checks, firstFailure.check, 'HIGH')
      expect(false, `HIGH severity accessibility failure: ${firstFailure.check.name}`).toBe(true)
      return
    }
    
    // =========================================================================
    // CHECK 4: Invisible Interactive Elements (MEDIUM severity)
    // =========================================================================
    console.log('\n🔍 Check 4: Invisible interactive elements')
    
    try {
      const result = await checkInvisibleInteractive(page, context)
      
      const check: CheckResult = {
        id: result.invariant_id,
        name: result.invariant_name,
        passed: result.passed,
        severity: 'MEDIUM',
        violation_count: result.violations.length,
        violations: result.violations,
      }
      
      checks.push(check)
      
      if (!result.passed) {
        console.log(`   ⚠️  ${result.violations.length} invisible interactive element(s)`)
        for (const v of result.violations.slice(0, 3)) {
          console.log(`      • ${v.element_description}: ${v.reason}`)
        }
        
        if (!firstFailure) {
          const screenshotPath = path.join(artifactDir, 'invisible_interactive_failure.png')
          await page.screenshot({ path: screenshotPath, fullPage: false })
          check.screenshot_path = screenshotPath
          console.log(`      📸 Screenshot: ${screenshotPath}`)
          
          firstFailure = { check, invariant: result }
        }
      } else {
        console.log('   ✅ No invisible interactive elements')
      }
    } catch (error) {
      console.error(`   ⚠️  Check failed with error: ${error}`)
      checks.push({
        id: 'INVISIBLE_INTERACTIVE_DETECTION',
        name: 'Invisible interactive elements check',
        passed: false,
        severity: 'MEDIUM',
      })
    }
    
    // =========================================================================
    // CHECK 5: Cursor/Hitbox Match (MEDIUM severity)
    // =========================================================================
    console.log('\n🔍 Check 5: Cursor/hitbox alignment')
    
    try {
      const result = await checkCursorHitboxMatch(page, context)
      
      const check: CheckResult = {
        id: result.invariant_id,
        name: result.invariant_name,
        passed: result.passed,
        severity: 'MEDIUM',
        violation_count: result.violations.length,
        violations: result.violations,
      }
      
      checks.push(check)
      
      if (!result.passed) {
        console.log(`   ⚠️  ${result.violations.length} cursor/hitbox mismatch(es)`)
        for (const v of result.violations.slice(0, 3)) {
          console.log(`      • ${v.element_description}: ${v.reason}`)
        }
        
        if (!firstFailure) {
          const screenshotPath = path.join(artifactDir, 'cursor_hitbox_failure.png')
          await page.screenshot({ path: screenshotPath, fullPage: false })
          check.screenshot_path = screenshotPath
          console.log(`      📸 Screenshot: ${screenshotPath}`)
          
          firstFailure = { check, invariant: result }
        }
      } else {
        console.log('   ✅ Cursor and hitbox alignment good')
      }
    } catch (error) {
      console.error(`   ⚠️  Check failed with error: ${error}`)
      checks.push({
        id: 'CURSOR_HITBOX_MATCH',
        name: 'Cursor/hitbox match check',
        passed: false,
        severity: 'MEDIUM',
      })
    }
    
    // =========================================================================
    // CHECK 6: Focus Trap Validation (MEDIUM severity)
    // =========================================================================
    console.log('\n🔍 Check 6: Focus trap validation')
    
    try {
      const result = await checkFocusTrap(page, context)
      
      const check: CheckResult = {
        id: result.invariant_id,
        name: result.invariant_name,
        passed: result.passed,
        severity: 'MEDIUM',
        violation_count: result.violations.length,
        violations: result.violations,
      }
      
      checks.push(check)
      
      if (!result.passed) {
        console.log(`   ⚠️  ${result.violations.length} focus trap violation(s)`)
        for (const v of result.violations.slice(0, 3)) {
          console.log(`      • ${v.element_description}: ${v.reason}`)
        }
        
        if (!firstFailure) {
          const screenshotPath = path.join(artifactDir, 'focus_trap_failure.png')
          await page.screenshot({ path: screenshotPath, fullPage: false })
          check.screenshot_path = screenshotPath
          console.log(`      📸 Screenshot: ${screenshotPath}`)
          
          firstFailure = { check, invariant: result }
        }
      } else {
        console.log('   ✅ Focus trap validation passed')
      }
    } catch (error) {
      console.error(`   ⚠️  Check failed with error: ${error}`)
      checks.push({
        id: 'FOCUS_TRAP_VALIDATION',
        name: 'Focus trap validation',
        passed: false,
        severity: 'MEDIUM',
      })
    }
    
    // =========================================================================
    // FINAL VERDICT
    // =========================================================================
    
    if (firstFailure) {
      const severity = firstFailure.check.severity
      console.log('\n═══════════════════════════════════════════════════════════')
      if (severity === 'HIGH') {
        console.log('  ❌ INTENT_020: ACCESSIBILITY CHECK FAILED (HIGH SEVERITY)')
      } else {
        console.log('  ⚠️  INTENT_020: ACCESSIBILITY CHECK FAILED (MEDIUM SEVERITY)')
      }
      console.log('═══════════════════════════════════════════════════════════\n')
      
      await saveResultWithReport(artifactDir, 'VERIFIED_NOT_OK', checks, firstFailure.check, severity)
      
      expect(false, `Accessibility check failed: ${firstFailure.check.name}`).toBe(true)
    } else {
      console.log('\n═══════════════════════════════════════════════════════════')
      console.log('  ✅ INTENT_020: ALL ACCESSIBILITY CHECKS PASSED')
      console.log('═══════════════════════════════════════════════════════════\n')
      
      await saveResultWithReport(artifactDir, 'VERIFIED_OK', checks)
      
      expect(checks.every(c => c.passed), 'All accessibility checks should pass').toBe(true)
    }
  })
})

// ============================================================================
// REPORTING FUNCTIONS
// ============================================================================

async function saveResultWithReport(
  artifactDir: string,
  verdict: 'VERIFIED_OK' | 'VERIFIED_NOT_OK',
  checks: CheckResult[],
  failedCheck?: CheckResult,
  severity?: 'HIGH' | 'MEDIUM'
) {
  const timestamp = new Date().toISOString()
  
  // Build result object
  const result: AccessibilityResult = {
    intent_id: 'INTENT_020',
    timestamp,
    verdict,
    severity,
    checks,
    failed_at: failedCheck?.name,
    failure_payload: failedCheck ? {
      check_id: failedCheck.id,
      severity: failedCheck.severity,
      violation_count: failedCheck.violation_count || 0,
      first_violation: failedCheck.violations?.[0],
    } : undefined,
  }
  
  // Save JSON result
  const resultPath = path.join(artifactDir, 'intent_020_result.json')
  fs.writeFileSync(resultPath, JSON.stringify(result, null, 2))
  console.log(`💾 JSON result saved: ${resultPath}`)
  
  // Generate markdown report
  const reportPath = path.join(artifactDir, 'intent_020_report.md')
  const reportContent = generateMarkdownReport(result, artifactDir)
  fs.writeFileSync(reportPath, reportContent)
  console.log(`📝 Markdown report saved: ${reportPath}`)
  
  result.report_path = reportPath
  
  // Update JSON with report path
  fs.writeFileSync(resultPath, JSON.stringify(result, null, 2))
}

function generateMarkdownReport(result: AccessibilityResult, artifactDir: string): string {
  const lines: string[] = []
  
  // Header
  lines.push('# INTENT_020 — Accessibility & Interaction Report')
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
    lines.push('## ✅ All Accessibility Checks Passed')
    lines.push('')
    lines.push('The application passed all accessibility and interaction checks.')
    lines.push('')
    lines.push('### Checks Performed')
    lines.push('')
    for (const check of result.checks) {
      lines.push(`- ✅ **${check.name}** (${check.severity})`)
    }
  } else {
    // Failure case - show ONE failure (fail-fast)
    lines.push('## ❌ Accessibility Check Failed')
    lines.push('')
    
    const failedCheck = result.checks.find(c => !c.passed)
    if (failedCheck) {
      lines.push(`### Failed Check: ${failedCheck.name}`)
      lines.push('')
      lines.push(`**Severity:** ${failedCheck.severity === 'HIGH' ? '🔴 HIGH' : '🟡 MEDIUM'}`)
      lines.push(`**Violations:** ${failedCheck.violation_count || 0}`)
      lines.push('')
      
      // Plain English explanation
      if (failedCheck.violations && failedCheck.violations.length > 0) {
        lines.push('#### Violations Detected')
        lines.push('')
        
        for (const [idx, v] of failedCheck.violations.slice(0, 5).entries()) {
          lines.push(`${idx + 1}. **${v.element_description}**`)
          lines.push(`   - Reason: ${v.reason}`)
          if (v.selector_hint) {
            lines.push(`   - Selector: \`${v.selector_hint}\``)
          }
          if (v.bounds) {
            lines.push(`   - Position: (${v.bounds.left.toFixed(0)}, ${v.bounds.top.toFixed(0)})`)
          }
          lines.push('')
        }
        
        if (failedCheck.violations.length > 5) {
          lines.push(`*...and ${failedCheck.violations.length - 5} more violations.*`)
          lines.push('')
        }
      }
      
      // Screenshot if available
      if (failedCheck.screenshot_path) {
        const screenshotName = path.basename(failedCheck.screenshot_path)
        lines.push(`#### Screenshot`)
        lines.push('')
        lines.push(`![Failure Screenshot](./${screenshotName})`)
        lines.push('')
      }
      
      // Remediation advice
      lines.push('#### Recommended Actions')
      lines.push('')
      lines.push(getRemediationAdvice(failedCheck.id))
      lines.push('')
    }
  }
  
  // Footer
  lines.push('---')
  lines.push('')
  lines.push('*This report was generated by INTENT_020 — Accessibility & Interaction Sanity QC.*')
  
  return lines.join('\n')
}

function getRemediationAdvice(checkId: string): string {
  const advice: Record<string, string> = {
    KEYBOARD_REACHABILITY: `
- Ensure all interactive elements have \`tabIndex >= 0\` or are naturally focusable (button, a, input, etc.)
- Remove \`tabIndex="-1"\` from elements that should be keyboard accessible
- Use semantic HTML elements (button, a) instead of divs with click handlers
`,
    FOCUS_INDICATORS_VISIBLE: `
- Do not use \`outline: none\` without providing an alternative focus indicator
- Use \`:focus\` styles with \`box-shadow\`, \`border\`, or \`background-color\` changes
- Test keyboard navigation to verify focus is visible
`,
    DEAD_CLICK_DETECTION: `
- Ensure all buttons have click handlers attached (React onClick, addEventListener, etc.)
- For links, ensure they have valid \`href\` attributes
- Remove \`cursor: pointer\` from non-interactive elements
`,
    INVISIBLE_INTERACTIVE_DETECTION: `
- Avoid \`opacity: 0\` on interactive elements unless they are truly hidden
- Use \`display: none\` or \`visibility: hidden\` for hidden elements
- Set \`pointer-events: none\` on invisible decorative overlays
`,
    CURSOR_HITBOX_MATCH: `
- Ensure clickable area matches visual bounds
- Use padding to increase clickable area for small elements
- Avoid nested clickable elements with mismatched sizes
`,
    FOCUS_TRAP_VALIDATION: `
- Modals must contain focusable elements
- Implement focus trap using \`focusTrap\` library or similar
- Test Tab/Shift+Tab navigation within modals
`,
  }
  
  return advice[checkId] || 'No specific remediation advice available.'
}
