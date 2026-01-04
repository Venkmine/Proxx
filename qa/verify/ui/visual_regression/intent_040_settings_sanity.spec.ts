/**
 * INTENT_040 — Settings Panel Sanity
 * 
 * Validates that the Settings panel can be safely reintroduced without breaking:
 * - Layout (no clipped buttons, no overflow, no scrollbar conflicts)
 * - Accessibility (keyboard navigation, focus management)
 * - State integrity (no store violations, no unintended side effects)
 * - Isolation (no changes to job/queue/source state)
 * 
 * PURPOSE: Structural safety checks ONLY - feature correctness comes later.
 * 
 * EXIT CODES (via test failure):
 * - HIGH severity violations → exit 1 (blocking)
 * - MEDIUM severity violations → exit 2 (warning)
 * - All passed → exit 0
 * 
 * ARTIFACTS:
 * - intent_040_result.json (structured JSON result)
 * - intent_040_report.md (human-readable markdown report)
 * 
 * RUN LOCALLY:
 *   cd qa/verify/ui/visual_regression
 *   npx playwright test intent_040_settings_sanity.spec.ts
 * 
 * INTEGRATION:
 *   Integrated into run_qc_loop.mjs Phase 4 summary
 */

import { test, expect } from './helpers'
import fs from 'node:fs'
import path from 'node:path'
import type { Page } from '@playwright/test'
import {
  checkSettingsRenderAndToggle,
  checkSettingsLayoutSafety,
  checkSettingsAccessibility,
  checkSettingsStateIntegrity,
  checkSettingsIsolation,
  type SettingsSanityResult,
  type SettingsSanityViolation,
  type InvariantContext,
} from './intent_040_invariants'

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

interface CheckResult {
  id: string
  name: string
  passed: boolean
  severity: 'HIGH' | 'MEDIUM'
  violation_count?: number
  violations?: SettingsSanityViolation[]
  screenshot_path?: string
}

interface SettingsSanityTestResult {
  intent_id: 'INTENT_040'
  timestamp: string
  verdict: 'VERIFIED_OK' | 'VERIFIED_NOT_OK'
  severity?: 'HIGH' | 'MEDIUM'
  checks: CheckResult[]
  failed_at?: string
  failure_payload?: {
    check_id: string
    severity: 'HIGH' | 'MEDIUM'
    violation_count: number
    first_violation?: SettingsSanityViolation
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

test.describe('INTENT_040 — Settings Panel Sanity', () => {
  test.beforeEach(async ({ page, visualCollector }) => {
    console.log('\n═══════════════════════════════════════════════════════════')
    console.log('  INTENT_040 — Settings Panel Sanity')
    console.log('═══════════════════════════════════════════════════════════')
    console.log(`  Artifact dir: ${visualCollector.artifactDir}`)
    console.log(`  Viewport: ${STANDARD_VIEWPORT.width}×${STANDARD_VIEWPORT.height}`)
    console.log('')
  })

  test('settings panel structural safety checks', async ({ page, visualCollector, app }) => {
    const artifactDir = visualCollector.artifactDir
    const timestamp = new Date().toISOString()
    
    const context: InvariantContext = {
      viewport: STANDARD_VIEWPORT,
      isE2EMode: false,
    }
    
    const checks: CheckResult[] = []
    let verdict: 'VERIFIED_OK' | 'VERIFIED_NOT_OK' = 'VERIFIED_OK'
    let maxSeverity: 'HIGH' | 'MEDIUM' | undefined = undefined
    let failurePayload: SettingsSanityTestResult['failure_payload'] = undefined
    
    console.log('⏳ Running Settings Panel Sanity checks...')
    console.log('')
    
    // ========================================================================
    // CHECK 1: RENDER & TOGGLE
    // ========================================================================
    console.log('📋 CHECK 1/5: Settings panel render and toggle...')
    
    const renderToggleResult = await checkSettingsRenderAndToggle(page, context)
    
    const renderToggleCheck: CheckResult = {
      id: renderToggleResult.invariant_id,
      name: renderToggleResult.invariant_name,
      passed: renderToggleResult.passed,
      severity: renderToggleResult.severity || 'HIGH',
      violation_count: renderToggleResult.violations.length,
      violations: renderToggleResult.violations,
    }
    
    if (!renderToggleResult.passed) {
      const screenshotPath = path.join(artifactDir, 'check_01_render_toggle_FAIL.png')
      await visualCollector.capture('check_01_render_toggle_FAIL')
      renderToggleCheck.screenshot_path = screenshotPath
      
      console.log(`   ❌ FAILED (${renderToggleResult.violations.length} violation(s))`)
      console.log(`   Screenshot: ${screenshotPath}`)
      
      verdict = 'VERIFIED_NOT_OK'
      maxSeverity = renderToggleCheck.severity
      failurePayload = {
        check_id: renderToggleCheck.id,
        severity: renderToggleCheck.severity,
        violation_count: renderToggleResult.violations.length,
        first_violation: renderToggleResult.violations[0],
      }
    } else {
      console.log('   ✅ PASSED')
    }
    
    checks.push(renderToggleCheck)
    console.log('')
    
    // If render/toggle fails, cannot continue with other checks
    if (!renderToggleResult.passed) {
      console.log('🛑 Settings panel cannot be opened - skipping remaining checks')
      
      const result: SettingsSanityTestResult = {
        intent_id: 'INTENT_040',
        timestamp,
        verdict,
        severity: maxSeverity,
        checks,
        failed_at: renderToggleCheck.id,
        failure_payload: failurePayload,
      }
      
      // Write JSON result
      const jsonPath = path.join(artifactDir, 'intent_040_result.json')
      fs.writeFileSync(jsonPath, JSON.stringify(result, null, 2))
      
      // Write Markdown report
      const reportPath = path.join(artifactDir, 'intent_040_report.md')
      const report = generateMarkdownReport(result)
      fs.writeFileSync(reportPath, report)
      result.report_path = reportPath
      
      // Update JSON with report path
      fs.writeFileSync(jsonPath, JSON.stringify(result, null, 2))
      
      console.log('')
      console.log('═══════════════════════════════════════════════════════════')
      console.log(`  VERDICT: ${verdict}`)
      if (maxSeverity) {
        console.log(`  SEVERITY: ${maxSeverity}`)
      }
      console.log('═══════════════════════════════════════════════════════════')
      console.log('')
      
      // Assert based on severity
      if (maxSeverity === 'HIGH') {
        throw new Error(`INTENT_040 FAILED: ${failurePayload?.check_id} (HIGH severity)`)
      } else if (maxSeverity === 'MEDIUM') {
        throw new Error(`INTENT_040 WARNING: ${failurePayload?.check_id} (MEDIUM severity)`)
      }
      
      return
    }
    
    // Open settings panel for subsequent checks
    await openSettingsPanel(page)
    
    // ========================================================================
    // CHECK 2: LAYOUT SAFETY (reuses INTENT_010 invariants)
    // ========================================================================
    console.log('📋 CHECK 2/5: Layout safety (with Settings open)...')
    
    const layoutSafetyResult = await checkSettingsLayoutSafety(page, context)
    
    const layoutSafetyCheck: CheckResult = {
      id: layoutSafetyResult.invariant_id,
      name: layoutSafetyResult.invariant_name,
      passed: layoutSafetyResult.passed,
      severity: layoutSafetyResult.severity || 'HIGH',
      violation_count: layoutSafetyResult.violations.length,
      violations: layoutSafetyResult.violations,
    }
    
    if (!layoutSafetyResult.passed) {
      const screenshotPath = path.join(artifactDir, 'check_02_layout_safety_FAIL.png')
      await visualCollector.capture('check_02_layout_safety_FAIL')
      layoutSafetyCheck.screenshot_path = screenshotPath
      
      console.log(`   ❌ FAILED (${layoutSafetyResult.violations.length} violation(s))`)
      console.log(`   Screenshot: ${screenshotPath}`)
      
      verdict = 'VERIFIED_NOT_OK'
      if (!maxSeverity || layoutSafetyCheck.severity === 'HIGH') {
        maxSeverity = layoutSafetyCheck.severity
        failurePayload = {
          check_id: layoutSafetyCheck.id,
          severity: layoutSafetyCheck.severity,
          violation_count: layoutSafetyResult.violations.length,
          first_violation: layoutSafetyResult.violations[0],
        }
      }
    } else {
      console.log('   ✅ PASSED')
    }
    
    checks.push(layoutSafetyCheck)
    console.log('')
    
    // ========================================================================
    // CHECK 3: ACCESSIBILITY SAFETY (reuses INTENT_020 invariants)
    // ========================================================================
    console.log('📋 CHECK 3/5: Accessibility safety (with Settings open)...')
    
    const accessibilityResult = await checkSettingsAccessibility(page, context)
    
    const accessibilityCheck: CheckResult = {
      id: accessibilityResult.invariant_id,
      name: accessibilityResult.invariant_name,
      passed: accessibilityResult.passed,
      severity: accessibilityResult.severity || 'HIGH',
      violation_count: accessibilityResult.violations.length,
      violations: accessibilityResult.violations,
    }
    
    if (!accessibilityResult.passed) {
      const screenshotPath = path.join(artifactDir, 'check_03_accessibility_FAIL.png')
      await visualCollector.capture('check_03_accessibility_FAIL')
      accessibilityCheck.screenshot_path = screenshotPath
      
      console.log(`   ❌ FAILED (${accessibilityResult.violations.length} violation(s))`)
      console.log(`   Screenshot: ${screenshotPath}`)
      
      verdict = 'VERIFIED_NOT_OK'
      if (!maxSeverity || accessibilityCheck.severity === 'HIGH') {
        maxSeverity = accessibilityCheck.severity
        failurePayload = {
          check_id: accessibilityCheck.id,
          severity: accessibilityCheck.severity,
          violation_count: accessibilityResult.violations.length,
          first_violation: accessibilityResult.violations[0],
        }
      }
    } else {
      console.log('   ✅ PASSED')
    }
    
    checks.push(accessibilityCheck)
    console.log('')
    
    // ========================================================================
    // CHECK 4: STATE INTEGRITY (reuses INTENT_030 invariants)
    // ========================================================================
    console.log('📋 CHECK 4/5: State integrity (no store violations)...')
    
    const stateIntegrityResult = await checkSettingsStateIntegrity(page, context)
    
    const stateIntegrityCheck: CheckResult = {
      id: stateIntegrityResult.invariant_id,
      name: stateIntegrityResult.invariant_name,
      passed: stateIntegrityResult.passed,
      severity: stateIntegrityResult.severity || 'HIGH',
      violation_count: stateIntegrityResult.violations.length,
      violations: stateIntegrityResult.violations,
    }
    
    if (!stateIntegrityResult.passed) {
      const screenshotPath = path.join(artifactDir, 'check_04_state_integrity_FAIL.png')
      await visualCollector.capture('check_04_state_integrity_FAIL')
      stateIntegrityCheck.screenshot_path = screenshotPath
      
      console.log(`   ❌ FAILED (${stateIntegrityResult.violations.length} violation(s))`)
      console.log(`   Screenshot: ${screenshotPath}`)
      
      verdict = 'VERIFIED_NOT_OK'
      if (!maxSeverity || stateIntegrityCheck.severity === 'HIGH') {
        maxSeverity = stateIntegrityCheck.severity
        failurePayload = {
          check_id: stateIntegrityCheck.id,
          severity: stateIntegrityCheck.severity,
          violation_count: stateIntegrityResult.violations.length,
          first_violation: stateIntegrityResult.violations[0],
        }
      }
    } else {
      console.log('   ✅ PASSED')
    }
    
    checks.push(stateIntegrityCheck)
    console.log('')
    
    // ========================================================================
    // CHECK 5: ISOLATION (no side effects on other state)
    // ========================================================================
    console.log('📋 CHECK 5/5: Isolation (no job/queue/source mutations)...')
    
    const isolationResult = await checkSettingsIsolation(page, context)
    
    const isolationCheck: CheckResult = {
      id: isolationResult.invariant_id,
      name: isolationResult.invariant_name,
      passed: isolationResult.passed,
      severity: isolationResult.severity || 'HIGH',
      violation_count: isolationResult.violations.length,
      violations: isolationResult.violations,
    }
    
    if (!isolationResult.passed) {
      const screenshotPath = path.join(artifactDir, 'check_05_isolation_FAIL.png')
      await visualCollector.capture('check_05_isolation_FAIL')
      isolationCheck.screenshot_path = screenshotPath
      
      console.log(`   ❌ FAILED (${isolationResult.violations.length} violation(s))`)
      console.log(`   Screenshot: ${screenshotPath}`)
      
      verdict = 'VERIFIED_NOT_OK'
      if (!maxSeverity || isolationCheck.severity === 'HIGH') {
        maxSeverity = isolationCheck.severity
        failurePayload = {
          check_id: isolationCheck.id,
          severity: isolationCheck.severity,
          violation_count: isolationResult.violations.length,
          first_violation: isolationResult.violations[0],
        }
      }
    } else {
      console.log('   ✅ PASSED')
    }
    
    checks.push(isolationCheck)
    console.log('')
    
    // ========================================================================
    // FINAL VERDICT
    // ========================================================================
    
    const result: SettingsSanityTestResult = {
      intent_id: 'INTENT_040',
      timestamp,
      verdict,
      severity: maxSeverity,
      checks,
      failed_at: failurePayload?.check_id,
      failure_payload: failurePayload,
    }
    
    // Write JSON result
    const jsonPath = path.join(artifactDir, 'intent_040_result.json')
    fs.writeFileSync(jsonPath, JSON.stringify(result, null, 2))
    
    // Write Markdown report
    const reportPath = path.join(artifactDir, 'intent_040_report.md')
    const report = generateMarkdownReport(result)
    fs.writeFileSync(reportPath, report)
    result.report_path = reportPath
    
    // Update JSON with report path
    fs.writeFileSync(jsonPath, JSON.stringify(result, null, 2))
    
    console.log('═══════════════════════════════════════════════════════════')
    console.log(`  VERDICT: ${verdict}`)
    if (maxSeverity) {
      console.log(`  SEVERITY: ${maxSeverity}`)
    }
    console.log(`  Report: ${reportPath}`)
    console.log('═══════════════════════════════════════════════════════════')
    console.log('')
    
    // Assert based on severity
    if (maxSeverity === 'HIGH') {
      throw new Error(`INTENT_040 FAILED: ${failurePayload?.check_id} (HIGH severity)`)
    } else if (maxSeverity === 'MEDIUM') {
      throw new Error(`INTENT_040 WARNING: ${failurePayload?.check_id} (MEDIUM severity)`)
    }
    
    // All passed
    expect(verdict).toBe('VERIFIED_OK')
  })
})

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Open the Settings panel via UI control
 */
async function openSettingsPanel(page: Page): Promise<void> {
  // TODO: Implement based on actual Settings panel toggle mechanism
  // This will depend on how the Settings panel is reintroduced to the UI
  // For now, throw a clear error indicating what needs to be implemented
  
  // Check if a settings toggle button exists
  const settingsToggle = await page.locator('[data-testid="settings-toggle"]').count()
  
  if (settingsToggle === 0) {
    throw new Error(
      'Settings panel toggle not found. ' +
      'Settings panel needs to be reintroduced to the UI with a [data-testid="settings-toggle"] control.'
    )
  }
  
  // Click the toggle
  await page.click('[data-testid="settings-toggle"]')
  
  // Wait for panel to be visible
  await page.waitForSelector('[data-testid="settings-panel"]', { state: 'visible', timeout: 2000 })
}

/**
 * Generate human-readable Markdown report
 */
function generateMarkdownReport(result: SettingsSanityTestResult): string {
  const lines: string[] = []
  
  lines.push('# INTENT_040 — Settings Panel Sanity')
  lines.push('')
  lines.push(`**Timestamp:** ${result.timestamp}`)
  lines.push(`**Verdict:** ${result.verdict}`)
  if (result.severity) {
    lines.push(`**Severity:** ${result.severity}`)
  }
  lines.push('')
  
  lines.push('## Summary')
  lines.push('')
  const passedCount = result.checks.filter(c => c.passed).length
  const failedCount = result.checks.length - passedCount
  lines.push(`- **Total checks:** ${result.checks.length}`)
  lines.push(`- **Passed:** ${passedCount}`)
  lines.push(`- **Failed:** ${failedCount}`)
  lines.push('')
  
  if (result.failed_at) {
    lines.push('## Failure')
    lines.push('')
    lines.push(`**Failed at:** ${result.failed_at}`)
    lines.push(`**Severity:** ${result.failure_payload?.severity}`)
    lines.push(`**Violation count:** ${result.failure_payload?.violation_count}`)
    
    if (result.failure_payload?.first_violation) {
      lines.push('')
      lines.push('**First violation:**')
      lines.push('```json')
      lines.push(JSON.stringify(result.failure_payload.first_violation, null, 2))
      lines.push('```')
    }
    lines.push('')
  }
  
  lines.push('## Checks')
  lines.push('')
  
  for (const check of result.checks) {
    const icon = check.passed ? '✅' : '❌'
    lines.push(`### ${icon} ${check.name}`)
    lines.push('')
    lines.push(`- **ID:** ${check.id}`)
    lines.push(`- **Severity:** ${check.severity}`)
    lines.push(`- **Status:** ${check.passed ? 'PASSED' : 'FAILED'}`)
    
    if (!check.passed && check.violation_count) {
      lines.push(`- **Violations:** ${check.violation_count}`)
      
      if (check.violations && check.violations.length > 0) {
        lines.push('')
        lines.push('**Violations:**')
        lines.push('')
        
        for (let i = 0; i < Math.min(3, check.violations.length); i++) {
          const v = check.violations[i]
          lines.push(`${i + 1}. **${v.check_type || 'Violation'}**`)
          lines.push(`   - ${v.reason}`)
          if (v.context) {
            lines.push(`   - Context: ${JSON.stringify(v.context)}`)
          }
          lines.push('')
        }
        
        if (check.violations.length > 3) {
          lines.push(`_... and ${check.violations.length - 3} more violation(s)_`)
          lines.push('')
        }
      }
      
      if (check.screenshot_path) {
        lines.push(`**Screenshot:** \`${check.screenshot_path}\``)
      }
    }
    
    lines.push('')
  }
  
  lines.push('---')
  lines.push('')
  lines.push('*Generated by INTENT_040 — Settings Panel Sanity*')
  
  return lines.join('\n')
}
