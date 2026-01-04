#!/usr/bin/env node
/**
 * QC_SUMMARY GENERATOR
 * 
 * Consolidates all QC results from a run into a single QC_SUMMARY.md file.
 * 
 * Sections:
 * 1. Executive Summary (SHIP / NO-SHIP recommendation)
 * 2. UI QC (INTENT_010 usability checks)
 * 3. Execution QC (Playwright test results)
 * 4. GLM Visual Analysis (if available)
 * 5. Baseline Comparisons (regressions)
 * 6. Property Invariants
 * 7. Human Confirmations (if any)
 * 8. Severity Rollup
 * 
 * Usage:
 *   node generate_qc_summary.mjs --artifact-path <path>
 * 
 * Or programmatically:
 *   import { generateQCSummary } from './generate_qc_summary.mjs'
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const projectRoot = path.resolve(__dirname, '../..')

// ============================================================================
// TYPE DEFINITIONS (JSDoc for documentation)
// ============================================================================

/**
 * @typedef {Object} QCSummaryData
 * @property {string} runId - Unique identifier for this run
 * @property {string} timestamp - ISO timestamp
 * @property {string} artifactPath - Path to artifacts
 * @property {'SHIP' | 'NO-SHIP' | 'REVIEW'} recommendation
 * @property {string[]} blockers - List of blocking issues
 * @property {string[]} warnings - List of non-blocking warnings
 * @property {Object} intent010 - INTENT_010 usability results
 * @property {Object} playwrightResults - Playwright test results
 * @property {Object} glmAnalysis - GLM visual analysis (optional)
 * @property {Object[]} regressions - Baseline comparison results
 * @property {Object[]} invariants - Property invariant results
 * @property {Object} humanConfirmations - Human confirmation session
 */

// ============================================================================
// DATA COLLECTION
// ============================================================================

/**
 * Collect all QC data from artifact directory
 * @param {string} artifactPath 
 * @returns {QCSummaryData}
 */
function collectQCData(artifactPath) {
  const data = {
    runId: path.basename(artifactPath),
    timestamp: new Date().toISOString(),
    artifactPath,
    recommendation: 'SHIP',
    blockers: [],
    warnings: [],
    intent010: null,
    playwrightResults: null,
    glmAnalysis: null,
    regressions: [],
    invariants: [],
    humanConfirmations: null,
  }

  // 1. Collect INTENT_010 results
  data.intent010 = findIntent010Results(artifactPath)
  if (data.intent010) {
    if (data.intent010.verdict === 'VERIFIED_NOT_OK') {
      if (data.intent010.severity === 'HIGH') {
        data.blockers.push(`INTENT_010: ${data.intent010.failed_at} (HIGH severity)`)
        data.recommendation = 'NO-SHIP'
      } else {
        data.warnings.push(`INTENT_010: ${data.intent010.failed_at} (MEDIUM severity)`)
        if (data.recommendation !== 'NO-SHIP') data.recommendation = 'REVIEW'
      }
    }
    
    // Extract regressions
    if (data.intent010.regressions) {
      const regressionsDetected = data.intent010.regressions.filter(r => r.has_regression)
      if (regressionsDetected.length > 0) {
        data.warnings.push(`${regressionsDetected.length} regression(s) detected in baseline comparison`)
        data.regressions = regressionsDetected
      }
    }
    
    // Extract invariant failures
    if (data.intent010.invariants) {
      const invariantFailures = data.intent010.invariants.filter(r => !r.passed)
      if (invariantFailures.length > 0) {
        data.warnings.push(`${invariantFailures.length} property invariant(s) violated`)
        data.invariants = invariantFailures
      }
    }
    
    // Extract human confirmations
    if (data.intent010.human_confirmations) {
      data.humanConfirmations = data.intent010.human_confirmations
      
      // Check if human rejected anything
      const rejected = data.humanConfirmations.confirmations?.filter(c => c.human_response === 'REJECT') || []
      if (rejected.length > 0) {
        data.blockers.push(`Human REJECTED ${rejected.length} check(s)`)
        data.recommendation = 'NO-SHIP'
      }
    }
  }

  // 2. Collect Playwright results
  data.playwrightResults = findPlaywrightResults(artifactPath)
  if (data.playwrightResults) {
    const failed = data.playwrightResults.failed || 0
    if (failed > 0) {
      data.blockers.push(`${failed} Playwright test(s) failed`)
      data.recommendation = 'NO-SHIP'
    }
  }

  // 3. Collect GLM analysis results
  data.glmAnalysis = findGLMResults(artifactPath)
  if (data.glmAnalysis) {
    if (data.glmAnalysis.verdict === 'VERIFIED_NOT_OK') {
      data.blockers.push(`GLM Visual Analysis: ${data.glmAnalysis.reason || 'verification failed'}`)
      data.recommendation = 'NO-SHIP'
    }
  }

  return data
}

/**
 * Find INTENT_010 results in artifact directory
 */
function findIntent010Results(artifactPath) {
  const possiblePaths = [
    path.join(artifactPath, 'intent_010_result.json'),
  ]
  
  // Search subdirectories
  try {
    const subdirs = fs.readdirSync(artifactPath, { withFileTypes: true })
      .filter(d => d.isDirectory())
    
    for (const d of subdirs) {
      possiblePaths.push(path.join(artifactPath, d.name, 'intent_010_result.json'))
    }
  } catch (e) {
    // Ignore read errors
  }
  
  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      try {
        return JSON.parse(fs.readFileSync(p, 'utf-8'))
      } catch (e) {
        // Continue to next
      }
    }
  }
  
  return null
}

/**
 * Find Playwright test results
 */
function findPlaywrightResults(artifactPath) {
  const possiblePaths = [
    path.join(artifactPath, 'playwright-results.json'),
    path.join(artifactPath, '..', 'playwright-results.json'),
    path.join(projectRoot, 'artifacts', 'playwright-results.json'),
  ]
  
  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      try {
        return JSON.parse(fs.readFileSync(p, 'utf-8'))
      } catch (e) {
        // Continue to next
      }
    }
  }
  
  return null
}

/**
 * Find GLM analysis results
 */
function findGLMResults(artifactPath) {
  const possiblePaths = [
    path.join(artifactPath, 'glm_verification.json'),
    path.join(artifactPath, 'glm_analysis.json'),
  ]
  
  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      try {
        return JSON.parse(fs.readFileSync(p, 'utf-8'))
      } catch (e) {
        // Continue to next
      }
    }
  }
  
  return null
}

// ============================================================================
// MARKDOWN GENERATION
// ============================================================================

/**
 * Generate QC_SUMMARY.md content
 * @param {QCSummaryData} data 
 * @returns {string}
 */
function generateMarkdown(data) {
  const lines = []
  
  // Header
  lines.push('# QC_SUMMARY')
  lines.push('')
  lines.push(`**Run ID:** ${data.runId}`)
  lines.push(`**Generated:** ${data.timestamp}`)
  lines.push(`**Artifacts:** ${data.artifactPath}`)
  lines.push('')
  
  // Executive Summary
  lines.push('---')
  lines.push('')
  lines.push('## 📋 Executive Summary')
  lines.push('')
  
  const recEmoji = data.recommendation === 'SHIP' ? '✅' : 
                   data.recommendation === 'NO-SHIP' ? '❌' : '⚠️'
  lines.push(`### ${recEmoji} Recommendation: **${data.recommendation}**`)
  lines.push('')
  
  if (data.blockers.length > 0) {
    lines.push('**Blocking Issues:**')
    lines.push('')
    for (const b of data.blockers) {
      lines.push(`- 🔴 ${b}`)
    }
    lines.push('')
  }
  
  if (data.warnings.length > 0) {
    lines.push('**Warnings (non-blocking):**')
    lines.push('')
    for (const w of data.warnings) {
      lines.push(`- 🟡 ${w}`)
    }
    lines.push('')
  }
  
  if (data.blockers.length === 0 && data.warnings.length === 0) {
    lines.push('All checks passed. Ready to ship.')
    lines.push('')
  }
  
  // UI QC Section
  lines.push('---')
  lines.push('')
  lines.push('## 🖥️ UI QC (INTENT_010)')
  lines.push('')
  
  if (data.intent010) {
    const verdict = data.intent010.verdict === 'VERIFIED_OK' ? '✅ PASS' : '❌ FAIL'
    lines.push(`**Verdict:** ${verdict}`)
    
    if (data.intent010.severity) {
      const sevEmoji = data.intent010.severity === 'HIGH' ? '🔴' : '🟡'
      lines.push(`**Severity:** ${sevEmoji} ${data.intent010.severity}`)
    }
    
    if (data.intent010.failed_at) {
      lines.push(`**Failed At:** ${data.intent010.failed_at}`)
    }
    
    lines.push('')
    
    // Checks summary
    if (data.intent010.checks && data.intent010.checks.length > 0) {
      lines.push('### Checks')
      lines.push('')
      for (const check of data.intent010.checks) {
        const emoji = check.passed ? '✅' : '❌'
        lines.push(`- ${emoji} ${check.name}`)
      }
      lines.push('')
    }
  } else {
    lines.push('*INTENT_010 results not found.*')
    lines.push('')
  }
  
  // Regressions Section
  if (data.regressions.length > 0) {
    lines.push('---')
    lines.push('')
    lines.push('## 📉 Baseline Regressions')
    lines.push('')
    
    for (const r of data.regressions) {
      lines.push(`### ${r.check_id}`)
      lines.push('')
      lines.push(`**Type:** ${r.regression_type || 'unknown'}`)
      lines.push(`**Message:** ${r.message}`)
      lines.push('')
      
      if (r.diff) {
        lines.push('| Metric | Baseline | Current |')
        lines.push('|--------|----------|---------|')
        for (const [key, val] of Object.entries(r.diff)) {
          lines.push(`| ${key} | ${JSON.stringify(val.baseline)} | ${JSON.stringify(val.current)} |`)
        }
        lines.push('')
      }
    }
  }
  
  // Invariants Section
  if (data.invariants.length > 0) {
    lines.push('---')
    lines.push('')
    lines.push('## 🔒 Property Invariant Violations')
    lines.push('')
    
    for (const inv of data.invariants) {
      lines.push(`### ${inv.invariant_id}`)
      lines.push('')
      lines.push(`*${inv.invariant_name}*`)
      lines.push('')
      
      if (inv.violations && inv.violations.length > 0) {
        lines.push('| Element | Reason |')
        lines.push('|---------|--------|')
        for (const v of inv.violations.slice(0, 5)) {
          lines.push(`| ${v.element_description} | ${v.reason} |`)
        }
        if (inv.violations.length > 5) {
          lines.push(`| ... | *${inv.violations.length - 5} more* |`)
        }
        lines.push('')
      }
    }
  }
  
  // Human Confirmations Section
  if (data.humanConfirmations) {
    lines.push('---')
    lines.push('')
    lines.push('## 👤 Human Confirmations')
    lines.push('')
    lines.push(`**Session ID:** ${data.humanConfirmations.session_id}`)
    
    if (data.humanConfirmations.final_decision) {
      const decEmoji = data.humanConfirmations.final_decision === 'APPROVED' ? '✅' :
                       data.humanConfirmations.final_decision === 'REJECTED' ? '❌' : '⚠️'
      lines.push(`**Final Decision:** ${decEmoji} ${data.humanConfirmations.final_decision}`)
    }
    
    lines.push('')
    
    if (data.humanConfirmations.confirmations && data.humanConfirmations.confirmations.length > 0) {
      lines.push('| Check | Automated | Human | Notes |')
      lines.push('|-------|-----------|-------|-------|')
      
      for (const c of data.humanConfirmations.confirmations) {
        const autoEmoji = c.automated_verdict === 'PASS' ? '✅' : '❌'
        const humanEmoji = c.human_response === 'ACCEPT' ? '✅' :
                           c.human_response === 'REJECT' ? '❌' : '⏭️'
        const notes = c.human_notes ? c.human_notes.slice(0, 40) : '-'
        lines.push(`| ${c.check_name.slice(0, 25)} | ${autoEmoji} | ${humanEmoji} | ${notes} |`)
      }
      lines.push('')
    }
  }
  
  // Playwright Results Section
  if (data.playwrightResults) {
    lines.push('---')
    lines.push('')
    lines.push('## 🎭 Playwright Execution')
    lines.push('')
    
    const passed = data.playwrightResults.passed || 0
    const failed = data.playwrightResults.failed || 0
    const skipped = data.playwrightResults.skipped || 0
    const total = passed + failed + skipped
    
    lines.push(`**Total Tests:** ${total}`)
    lines.push(`**Passed:** ✅ ${passed}`)
    lines.push(`**Failed:** ❌ ${failed}`)
    lines.push(`**Skipped:** ⏭️ ${skipped}`)
    lines.push('')
  }
  
  // GLM Analysis Section
  if (data.glmAnalysis) {
    lines.push('---')
    lines.push('')
    lines.push('## 🤖 GLM Visual Analysis')
    lines.push('')
    
    const verdict = data.glmAnalysis.verdict === 'VERIFIED_OK' ? '✅ PASS' : '❌ FAIL'
    lines.push(`**Verdict:** ${verdict}`)
    
    if (data.glmAnalysis.reason) {
      lines.push(`**Reason:** ${data.glmAnalysis.reason}`)
    }
    
    lines.push('')
  }
  
  // Footer
  lines.push('---')
  lines.push('')
  lines.push('*Generated by QC Summary Generator*')
  
  return lines.join('\n')
}

// ============================================================================
// MAIN EXPORT & CLI
// ============================================================================

/**
 * Generate QC summary and save to artifact directory
 * @param {string} artifactPath 
 * @returns {{ summaryPath: string, data: QCSummaryData }}
 */
export function generateQCSummary(artifactPath) {
  const data = collectQCData(artifactPath)
  const markdown = generateMarkdown(data)
  
  const summaryPath = path.join(artifactPath, 'QC_SUMMARY.md')
  fs.writeFileSync(summaryPath, markdown)
  
  // Also save as JSON for programmatic access
  const jsonPath = path.join(artifactPath, 'qc_summary.json')
  fs.writeFileSync(jsonPath, JSON.stringify(data, null, 2))
  
  return { summaryPath, data }
}

/**
 * Print summary to console
 */
export function printQCSummary(data) {
  console.log('')
  console.log('╔══════════════════════════════════════════════════════════════╗')
  console.log('║                      QC SUMMARY                              ║')
  console.log('╚══════════════════════════════════════════════════════════════╝')
  console.log('')
  
  const recEmoji = data.recommendation === 'SHIP' ? '✅' :
                   data.recommendation === 'NO-SHIP' ? '❌' : '⚠️'
  console.log(`  ${recEmoji} RECOMMENDATION: ${data.recommendation}`)
  console.log('')
  
  if (data.blockers.length > 0) {
    console.log('  🔴 BLOCKERS:')
    for (const b of data.blockers) {
      console.log(`     - ${b}`)
    }
    console.log('')
  }
  
  if (data.warnings.length > 0) {
    console.log('  🟡 WARNINGS:')
    for (const w of data.warnings) {
      console.log(`     - ${w}`)
    }
    console.log('')
  }
  
  if (data.blockers.length === 0 && data.warnings.length === 0) {
    console.log('  All checks passed. Ready to ship! 🚀')
    console.log('')
  }
}

// CLI execution
if (process.argv[1] === __filename) {
  const args = process.argv.slice(2)
  let artifactPath = null
  
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--artifact-path') {
      artifactPath = args[++i]
    }
  }
  
  if (!artifactPath) {
    // Find latest artifact
    const visualDir = path.join(projectRoot, 'artifacts/ui/visual')
    if (fs.existsSync(visualDir)) {
      const dirs = fs.readdirSync(visualDir, { withFileTypes: true })
        .filter(d => d.isDirectory() && /^\d{4}-\d{2}-\d{2}T/.test(d.name))
        .map(d => d.name)
        .sort()
        .reverse()
      
      if (dirs.length > 0) {
        artifactPath = path.join(visualDir, dirs[0])
      }
    }
  }
  
  if (!artifactPath) {
    console.error('Error: No artifact path specified and no artifacts found.')
    console.error('Usage: node generate_qc_summary.mjs --artifact-path <path>')
    process.exit(1)
  }
  
  console.log(`Generating QC summary for: ${artifactPath}`)
  
  const { summaryPath, data } = generateQCSummary(artifactPath)
  
  printQCSummary(data)
  
  console.log(`  📝 Summary saved to: ${summaryPath}`)
  console.log('')
  
  // Exit with appropriate code
  if (data.recommendation === 'NO-SHIP') {
    process.exit(1)
  } else if (data.recommendation === 'REVIEW') {
    process.exit(2)
  } else {
    process.exit(0)
  }
}
