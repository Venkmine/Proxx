/**
 * INTENT_030 — State & Store Integrity
 * 
 * Structural guardrails to prevent state fragmentation bugs.
 * Validates:
 * - Single ownership per UI domain
 * - No dual writes per action
 * - No deprecated store usage
 * - State transitions are visible
 * - Read-after-write consistency
 * 
 * EXIT CODES (via test failure):
 * - HIGH severity violations → exit 1 (blocking)
 * - MEDIUM severity violations → exit 2 (warning)
 * - All passed → exit 0
 * 
 * ARTIFACTS:
 * - intent_030_result.json (structured JSON result)
 * - intent_030_report.md (human-readable markdown report)
 * 
 * RUN LOCALLY:
 *   cd qa/verify/ui/visual_regression
 *   npx playwright test intent_030_state_integrity.spec.ts
 * 
 * INTEGRATION:
 *   Integrated into run_qc_loop.mjs Phase 4 summary
 */

import { test, expect } from './helpers'
import fs from 'node:fs'
import path from 'node:path'
import type { Page } from '@playwright/test'
import {
  exposeStoreDiagnostics,
  getStoreDiagnostics,
  captureDOMState,
  checkSingleOwnership,
  checkNoDualWrites,
  checkDeprecatedStores,
  checkStateTransitionVisibility,
  checkReadAfterWriteConsistency,
  type StoreInvariantResult,
  type StoreViolation,
  type InvariantContext,
  type StoreDiagnostics,
  type DOMStateSnapshot,
} from './intent_030_invariants'

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

interface CheckResult {
  id: string
  name: string
  passed: boolean
  severity: 'HIGH' | 'MEDIUM'
  violation_count?: number
  violations?: StoreViolation[]
  screenshot_path?: string
}

interface StateIntegrityResult {
  intent_id: 'INTENT_030'
  timestamp: string
  verdict: 'VERIFIED_OK' | 'VERIFIED_NOT_OK'
  severity?: 'HIGH' | 'MEDIUM'
  checks: CheckResult[]
  failed_at?: string
  failure_payload?: {
    check_id: string
    severity: 'HIGH' | 'MEDIUM'
    violation_count: number
    first_violation?: StoreViolation
  }
  diagnostics?: StoreDiagnostics | null
  dom_snapshot?: DOMStateSnapshot
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

test.describe('INTENT_030 — State & Store Integrity', () => {
  test.beforeEach(async ({ page, visualCollector }) => {
    console.log('\n═══════════════════════════════════════════════════════════')
    console.log('  INTENT_030 — State & Store Integrity')
    console.log('═══════════════════════════════════════════════════════════')
    console.log(`  Artifact dir: ${visualCollector.artifactDir}`)
    console.log(`  Viewport: ${STANDARD_VIEWPORT.width}×${STANDARD_VIEWPORT.height}`)
    console.log('')
  })

  test('state and store integrity checks', async ({ page, visualCollector, app }) => {
    const artifactDir = visualCollector.artifactDir
    const isE2EMode = process.env.E2E_TEST === 'true'
    
    const context: InvariantContext = {
      viewport: STANDARD_VIEWPORT,
      isE2EMode,
    }
    
    // Wait for idle state
    console.log('⏳ Waiting for idle state...')
    await page.waitForTimeout(2000)
    
    // Expose store diagnostics for inspection
    console.log('🔧 Exposing store diagnostics...')
    await exposeStoreDiagnostics(page)
    
    // Capture initial state
    const initialDiagnostics = await getStoreDiagnostics(page)
    const initialDOMState = await captureDOMState(page)
    
    console.log('📊 Initial store diagnostics:', JSON.stringify(initialDiagnostics, null, 2))
    console.log('📊 Initial DOM state:', JSON.stringify(initialDOMState, null, 2))
    
    const checks: CheckResult[] = []
    let firstFailure: { check: CheckResult; invariant: StoreInvariantResult } | null = null
    
    // =========================================================================
    // CHECK 1: Single Ownership (HIGH severity)
    // =========================================================================
    console.log('\n🔍 Check 1: Single ownership per UI domain')
    
    try {
      const result = await checkSingleOwnership(page, context)
      
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
        console.log(`   ❌ ${result.violations.length} ownership violation(s)`)
        for (const v of result.violations.slice(0, 3)) {
          console.log(`      • ${v.domain}: ${v.issue}`)
        }
        
        if (!firstFailure) {
          const screenshotPath = path.join(artifactDir, 'single_ownership_failure.png')
          await page.screenshot({ path: screenshotPath, fullPage: false })
          check.screenshot_path = screenshotPath
          console.log(`      📸 Screenshot: ${screenshotPath}`)
          
          firstFailure = { check, invariant: result }
        }
      } else {
        console.log('   ✅ Single ownership per domain maintained')
      }
    } catch (error) {
      console.error(`   ⚠️  Check failed with error: ${error}`)
      checks.push({
        id: 'SINGLE_OWNERSHIP',
        name: 'Single ownership check',
        passed: false,
        severity: 'HIGH',
      })
    }
    
    // Fail fast on HIGH severity
    if (firstFailure && firstFailure.check.severity === 'HIGH') {
      console.log('\n❌ FAIL FAST: HIGH severity violation detected')
      await saveResultWithReport(artifactDir, 'VERIFIED_NOT_OK', checks, firstFailure.check, 'HIGH', initialDiagnostics, initialDOMState)
      expect(false, `HIGH severity state integrity failure: ${firstFailure.check.name}`).toBe(true)
      return
    }
    
    // =========================================================================
    // CHECK 2: No Dual Writes (MEDIUM severity)
    // =========================================================================
    console.log('\n🔍 Check 2: No dual writes per action')
    
    try {
      const result = await checkNoDualWrites(page, context)
      
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
        console.log(`   ⚠️  ${result.violations.length} dual-write violation(s)`)
        for (const v of result.violations.slice(0, 3)) {
          console.log(`      • ${v.domain}: ${v.issue}`)
        }
        
        if (!firstFailure) {
          const screenshotPath = path.join(artifactDir, 'dual_writes_failure.png')
          await page.screenshot({ path: screenshotPath, fullPage: false })
          check.screenshot_path = screenshotPath
          console.log(`      📸 Screenshot: ${screenshotPath}`)
          
          firstFailure = { check, invariant: result }
        }
      } else {
        console.log('   ✅ No dual-write patterns detected')
      }
    } catch (error) {
      console.error(`   ⚠️  Check failed with error: ${error}`)
      checks.push({
        id: 'NO_DUAL_WRITES',
        name: 'No dual writes check',
        passed: false,
        severity: 'MEDIUM',
      })
    }
    
    // =========================================================================
    // CHECK 3: Deprecated Store Detection (HIGH severity)
    // =========================================================================
    console.log('\n🔍 Check 3: No deprecated store usage')
    
    try {
      const result = await checkDeprecatedStores(page, context)
      
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
        console.log(`   ❌ ${result.violations.length} deprecated store usage(s)`)
        for (const v of result.violations.slice(0, 3)) {
          console.log(`      • ${v.domain}: ${v.issue}`)
        }
        
        if (!firstFailure) {
          const screenshotPath = path.join(artifactDir, 'deprecated_stores_failure.png')
          await page.screenshot({ path: screenshotPath, fullPage: false })
          check.screenshot_path = screenshotPath
          console.log(`      📸 Screenshot: ${screenshotPath}`)
          
          firstFailure = { check, invariant: result }
        }
      } else {
        console.log('   ✅ No deprecated store usage detected')
      }
    } catch (error) {
      console.error(`   ⚠️  Check failed with error: ${error}`)
      checks.push({
        id: 'DEPRECATED_STORE_DETECTION',
        name: 'Deprecated store detection',
        passed: false,
        severity: 'HIGH',
      })
    }
    
    // Fail fast on HIGH severity
    if (firstFailure && firstFailure.check.severity === 'HIGH' && firstFailure.check.id === 'DEPRECATED_STORE_DETECTION') {
      console.log('\n❌ FAIL FAST: HIGH severity violation detected')
      await saveResultWithReport(artifactDir, 'VERIFIED_NOT_OK', checks, firstFailure.check, 'HIGH', initialDiagnostics, initialDOMState)
      expect(false, `HIGH severity state integrity failure: ${firstFailure.check.name}`).toBe(true)
      return
    }
    
    // =========================================================================
    // CHECK 4: State Transition Visibility (MEDIUM severity)
    // =========================================================================
    console.log('\n🔍 Check 4: State transitions are visible')
    
    try {
      const result = await checkStateTransitionVisibility(page, context)
      
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
        console.log(`   ⚠️  ${result.violations.length} visibility violation(s)`)
        for (const v of result.violations.slice(0, 3)) {
          console.log(`      • ${v.domain}: ${v.issue}`)
        }
        
        if (!firstFailure) {
          const screenshotPath = path.join(artifactDir, 'transition_visibility_failure.png')
          await page.screenshot({ path: screenshotPath, fullPage: false })
          check.screenshot_path = screenshotPath
          console.log(`      📸 Screenshot: ${screenshotPath}`)
          
          firstFailure = { check, invariant: result }
        }
      } else {
        console.log('   ✅ State transitions are visible')
      }
    } catch (error) {
      console.error(`   ⚠️  Check failed with error: ${error}`)
      checks.push({
        id: 'STATE_TRANSITION_VISIBILITY',
        name: 'State transition visibility',
        passed: false,
        severity: 'MEDIUM',
      })
    }
    
    // =========================================================================
    // CHECK 5: Read-after-write Consistency (MEDIUM severity)
    // =========================================================================
    console.log('\n🔍 Check 5: Read-after-write consistency')
    
    try {
      const result = await checkReadAfterWriteConsistency(page, context)
      
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
        console.log(`   ⚠️  ${result.violations.length} consistency violation(s)`)
        for (const v of result.violations.slice(0, 3)) {
          console.log(`      • ${v.domain}: ${v.issue}`)
        }
        
        if (!firstFailure) {
          const screenshotPath = path.join(artifactDir, 'read_after_write_failure.png')
          await page.screenshot({ path: screenshotPath, fullPage: false })
          check.screenshot_path = screenshotPath
          console.log(`      📸 Screenshot: ${screenshotPath}`)
          
          firstFailure = { check, invariant: result }
        }
      } else {
        console.log('   ✅ Read-after-write consistency maintained')
      }
    } catch (error) {
      console.error(`   ⚠️  Check failed with error: ${error}`)
      checks.push({
        id: 'READ_AFTER_WRITE_CONSISTENCY',
        name: 'Read-after-write consistency',
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
        console.log('  ❌ INTENT_030: STATE INTEGRITY CHECK FAILED (HIGH SEVERITY)')
      } else {
        console.log('  ⚠️  INTENT_030: STATE INTEGRITY CHECK FAILED (MEDIUM SEVERITY)')
      }
      console.log('═══════════════════════════════════════════════════════════\n')
      
      await saveResultWithReport(artifactDir, 'VERIFIED_NOT_OK', checks, firstFailure.check, severity, initialDiagnostics, initialDOMState)
      
      expect(false, `State integrity check failed: ${firstFailure.check.name}`).toBe(true)
    } else {
      console.log('\n═══════════════════════════════════════════════════════════')
      console.log('  ✅ INTENT_030: ALL STATE INTEGRITY CHECKS PASSED')
      console.log('═══════════════════════════════════════════════════════════\n')
      
      await saveResultWithReport(artifactDir, 'VERIFIED_OK', checks, undefined, undefined, initialDiagnostics, initialDOMState)
      
      expect(checks.every(c => c.passed), 'All state integrity checks should pass').toBe(true)
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
  severity?: 'HIGH' | 'MEDIUM',
  diagnostics?: StoreDiagnostics | null,
  domSnapshot?: DOMStateSnapshot
) {
  const timestamp = new Date().toISOString()
  
  // Build result object
  const result: StateIntegrityResult = {
    intent_id: 'INTENT_030',
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
    diagnostics,
    dom_snapshot: domSnapshot,
  }
  
  // Save JSON result
  const resultPath = path.join(artifactDir, 'intent_030_result.json')
  fs.writeFileSync(resultPath, JSON.stringify(result, null, 2))
  console.log(`💾 JSON result saved: ${resultPath}`)
  
  // Generate markdown report
  const reportPath = path.join(artifactDir, 'intent_030_report.md')
  const reportContent = generateMarkdownReport(result, artifactDir)
  fs.writeFileSync(reportPath, reportContent)
  console.log(`📝 Markdown report saved: ${reportPath}`)
  
  result.report_path = reportPath
  
  // Update JSON with report path
  fs.writeFileSync(resultPath, JSON.stringify(result, null, 2))
}

function generateMarkdownReport(result: StateIntegrityResult, artifactDir: string): string {
  const lines: string[] = []
  
  // Header
  lines.push('# INTENT_030 — State & Store Integrity Report')
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
    lines.push('## ✅ All State Integrity Checks Passed')
    lines.push('')
    lines.push('The application passed all state and store integrity checks.')
    lines.push('')
    lines.push('### Checks Performed')
    lines.push('')
    for (const check of result.checks) {
      lines.push(`- ✅ **${check.name}** (${check.severity})`)
    }
  } else {
    // Failure case - show ONE failure (fail-fast)
    lines.push('## ❌ State Integrity Check Failed')
    lines.push('')
    
    const failedCheck = result.checks.find(c => !c.passed)
    if (failedCheck) {
      lines.push(`### Failed Check: ${failedCheck.name}`)
      lines.push('')
      lines.push(`**Severity:** ${failedCheck.severity === 'HIGH' ? '🔴 HIGH' : '🟡 MEDIUM'}`)
      lines.push(`**Violations:** ${failedCheck.violation_count || 0}`)
      lines.push('')
      
      // Violations
      if (failedCheck.violations && failedCheck.violations.length > 0) {
        lines.push('#### Violations Detected')
        lines.push('')
        
        for (const [idx, v] of failedCheck.violations.slice(0, 5).entries()) {
          lines.push(`${idx + 1}. **Domain: ${v.domain}**`)
          lines.push(`   - Issue: ${v.issue}`)
          lines.push(`   - Details: ${v.details}`)
          if (v.recommendation) {
            lines.push(`   - Recommendation: ${v.recommendation}`)
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
      
      // Store diagnostics
      if (result.diagnostics) {
        lines.push('#### Store Diagnostics')
        lines.push('')
        lines.push('```json')
        lines.push(JSON.stringify(result.diagnostics, null, 2))
        lines.push('```')
        lines.push('')
      }
      
      // DOM snapshot
      if (result.dom_snapshot) {
        lines.push('#### DOM State Snapshot')
        lines.push('')
        lines.push('```json')
        lines.push(JSON.stringify(result.dom_snapshot, null, 2))
        lines.push('```')
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
  lines.push('*This report was generated by INTENT_030 — State & Store Integrity QC.*')
  
  return lines.join('\n')
}

function getRemediationAdvice(checkId: string): string {
  const advice: Record<string, string> = {
    SINGLE_OWNERSHIP: `
- Review component source to identify dual store reads
- Consolidate state into single authoritative store per UI domain
- Remove deprecated state attributes (data-has-sources, etc.)
- Ensure components read from Zustand store, not local useState
`,
    NO_DUAL_WRITES: `
- Identify action that mutates multiple stores
- Refactor to single store update per action
- Use derived state or selectors instead of duplicating data
- Ensure store updates are atomic (all or nothing)
`,
    DEPRECATED_STORE_DETECTION: `
- Remove isBurnInsEditorOpen usage, use isVisualPreviewModalOpen
- Clear deprecated localStorage keys
- Update components to use new store fields
- Remove dual-state patterns (store + localStorage)
`,
    STATE_TRANSITION_VISIBILITY: `
- Add console.log or telemetry for state changes
- Use Zustand middleware to log all store updates
- Ensure state changes are explicit, not background polling
- Review useEffect dependencies that may cause silent changes
`,
    READ_AFTER_WRITE_CONSISTENCY: `
- Ensure UI reads directly from store, not cached values
- Remove stale selectors or memoization with incorrect dependencies
- Verify React renders after store updates (useEffect deps)
- Check for race conditions between store update and render
`,
  }
  
  return advice[checkId] || 'No specific remediation advice available.'
}
