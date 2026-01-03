#!/usr/bin/env node
/**
 * PHASE 3 — INTERPRETATION (Sonnet/Opus)
 * 
 * Reads glm_report.json and produces qc_interpretation.json.
 * 
 * CLASSIFICATION:
 * - VERIFIED_OK: All critical questions passed
 * - VERIFIED_NOT_OK: One or more critical failures
 * - QC_INVALID: Cannot assess (e.g., splash-only, no screenshots)
 * 
 * RULES:
 * - Rule-based only, no AI inference
 * - Deterministic given same input
 * - Reversible: same GLM report = same interpretation
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const projectRoot = path.resolve(__dirname, '../..')

/**
 * Interpretation rules (versioned)
 * 
 * Each rule defines:
 * - condition: function to evaluate answers
 * - classification: resulting classification
 * - reason: human-readable explanation
 */
const INTERPRETATION_RULES_V1 = {
  version: 'v1',
  
  /**
   * Critical failure conditions (any = VERIFIED_NOT_OK)
   */
  criticalFailures: [
    {
      id: 'ui_elements_clipped',
      check: (answers) => answers.ui_elements_clipped === 'yes',
      reason: 'UI elements are clipped or cut off',
    },
    {
      id: 'error_visible',
      check: (answers) => answers.error_message_visible === 'yes',
      reason: 'Error message or warning visible',
    },
  ],
  
  /**
   * QC invalid conditions (any = QC_INVALID)
   */
  invalidConditions: [
    {
      id: 'splash_only',
      check: (answers) => {
        return answers.splash_visible === 'yes' && 
               answers.player_area_visible === 'no' &&
               answers.queue_panel_visible === 'no'
      },
      reason: 'Only splash screen visible - app not fully loaded',
    },
    {
      id: 'no_ui_visible',
      check: (answers) => {
        return answers.player_area_visible === 'no' &&
               answers.queue_panel_visible === 'no' &&
               answers.primary_action_button === 'no'
      },
      reason: 'No recognizable UI elements visible',
    },
  ],
  
  /**
   * Required visibility checks (all must pass for VERIFIED_OK)
   */
  requiredVisible: [
    {
      id: 'player_area',
      answerKey: 'player_area_visible',
      required: true,
      weight: 'high',
    },
    {
      id: 'queue_panel',
      answerKey: 'queue_panel_visible',
      required: false, // Optional but tracked
      weight: 'medium',
    },
    {
      id: 'zoom_controls',
      answerKey: 'zoom_controls_visible',
      required: false,
      weight: 'low',
    },
  ],
}

/**
 * Apply interpretation rules to a single screenshot's answers
 */
function interpretScreenshot(answers, rules) {
  const findings = []
  
  // Check for QC invalid conditions first
  for (const condition of rules.invalidConditions) {
    if (condition.check(answers)) {
      return {
        classification: 'QC_INVALID',
        reason: condition.reason,
        ruleId: condition.id,
        findings: [{ type: 'invalid', ...condition }],
      }
    }
  }
  
  // Check for critical failures
  for (const failure of rules.criticalFailures) {
    if (failure.check(answers)) {
      findings.push({
        type: 'critical_failure',
        id: failure.id,
        reason: failure.reason,
      })
    }
  }
  
  // If any critical failures, return NOT_OK
  if (findings.length > 0) {
    return {
      classification: 'VERIFIED_NOT_OK',
      reason: findings.map(f => f.reason).join('; '),
      findings,
    }
  }
  
  // Check required visibility
  const missingRequired = []
  const visibilityStatus = []
  
  for (const check of rules.requiredVisible) {
    const isVisible = answers[check.answerKey] === 'yes'
    visibilityStatus.push({
      id: check.id,
      visible: isVisible,
      required: check.required,
      weight: check.weight,
    })
    
    if (check.required && !isVisible) {
      missingRequired.push(check.id)
    }
  }
  
  if (missingRequired.length > 0) {
    return {
      classification: 'VERIFIED_NOT_OK',
      reason: `Missing required UI elements: ${missingRequired.join(', ')}`,
      findings: visibilityStatus.filter(v => v.required && !v.visible),
    }
  }
  
  // All checks passed
  return {
    classification: 'VERIFIED_OK',
    reason: 'All critical checks passed',
    findings: visibilityStatus,
  }
}

/**
 * Aggregate interpretations across multiple screenshots
 */
function aggregateInterpretations(screenshotInterpretations) {
  const classifications = screenshotInterpretations.map(i => i.classification)
  
  // Priority: QC_INVALID > VERIFIED_NOT_OK > VERIFIED_OK
  if (classifications.includes('QC_INVALID')) {
    const invalidCount = classifications.filter(c => c === 'QC_INVALID').length
    return {
      overall: 'QC_INVALID',
      reason: `${invalidCount} screenshot(s) could not be assessed`,
      confidence: 'low',
    }
  }
  
  if (classifications.includes('VERIFIED_NOT_OK')) {
    const failCount = classifications.filter(c => c === 'VERIFIED_NOT_OK').length
    return {
      overall: 'VERIFIED_NOT_OK',
      reason: `${failCount} screenshot(s) failed verification`,
      confidence: 'high',
    }
  }
  
  return {
    overall: 'VERIFIED_OK',
    reason: 'All screenshots passed verification',
    confidence: 'high',
  }
}

/**
 * Main execution
 */
async function main() {
  const args = process.argv.slice(2)
  
  let glmReportPath = null
  let rulesVersion = 'v1'
  
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--glm-report' && args[i + 1]) {
      glmReportPath = args[++i]
    } else if (args[i] === '--rules' && args[i + 1]) {
      rulesVersion = args[++i]
    } else if (!glmReportPath && !args[i].startsWith('--')) {
      glmReportPath = args[i]
    }
  }
  
  if (!glmReportPath) {
    console.error('Usage: interpret_glm_report.mjs <glm-report-path> [--rules v1]')
    process.exit(1)
  }
  
  // If path is a directory, look for glm_report.json inside
  if (fs.existsSync(glmReportPath) && fs.statSync(glmReportPath).isDirectory()) {
    glmReportPath = path.join(glmReportPath, 'glm_report.json')
  }
  
  if (!fs.existsSync(glmReportPath)) {
    console.error(`GLM report not found: ${glmReportPath}`)
    process.exit(1)
  }
  
  console.log('═══════════════════════════════════════════════════════════════')
  console.log('  PHASE 3 — INTERPRETATION: Rule-Based Analysis')
  console.log('═══════════════════════════════════════════════════════════════')
  console.log(`  GLM Report: ${glmReportPath}`)
  console.log(`  Rules Version: ${rulesVersion}`)
  console.log('')
  
  try {
    // Load GLM report
    const glmReport = JSON.parse(fs.readFileSync(glmReportPath, 'utf-8'))
    console.log(`📋 Loaded GLM report (${glmReport.results.length} screenshot results)`)
    
    // Get rules
    const rules = INTERPRETATION_RULES_V1 // TODO: support versioned rules files
    console.log(`📜 Using interpretation rules: ${rules.version}`)
    console.log('')
    
    // Interpret each screenshot
    console.log('🔍 Interpreting results...')
    const interpretations = []
    
    for (const result of glmReport.results) {
      if (result.error) {
        interpretations.push({
          screenshot: result.screenshot,
          classification: 'QC_INVALID',
          reason: `Processing error: ${result.error}`,
          findings: [],
        })
        console.log(`  ⚠️  ${result.screenshot}: QC_INVALID (processing error)`)
        continue
      }
      
      const interpretation = interpretScreenshot(result.answers, rules)
      interpretations.push({
        screenshot: result.screenshot,
        ...interpretation,
        answers: result.answers,
        observations: result.observations,
      })
      
      const icon = interpretation.classification === 'VERIFIED_OK' ? '✅' :
                   interpretation.classification === 'VERIFIED_NOT_OK' ? '❌' : '⚠️'
      console.log(`  ${icon} ${result.screenshot}: ${interpretation.classification}`)
    }
    
    // Aggregate results
    const aggregate = aggregateInterpretations(interpretations)
    
    // Build interpretation report
    const artifactDir = path.dirname(glmReportPath)
    const interpretation = {
      version: '1.0.0',
      phase: 'INTERPRETATION',
      generatedAt: new Date().toISOString(),
      glmReportPath,
      rulesVersion: rules.version,
      
      overall: aggregate,
      
      screenshots: interpretations,
      
      summary: {
        total: interpretations.length,
        verified_ok: interpretations.filter(i => i.classification === 'VERIFIED_OK').length,
        verified_not_ok: interpretations.filter(i => i.classification === 'VERIFIED_NOT_OK').length,
        qc_invalid: interpretations.filter(i => i.classification === 'QC_INVALID').length,
      },
      
      // If there are failures, generate fix tasks
      fixTasks: interpretations
        .filter(i => i.classification === 'VERIFIED_NOT_OK')
        .map(i => ({
          screenshot: i.screenshot,
          issue: i.reason,
          findings: i.findings,
          suggestedAction: generateFixSuggestion(i),
        })),
    }
    
    // Write interpretation
    const interpretationPath = path.join(artifactDir, 'qc_interpretation.json')
    fs.writeFileSync(interpretationPath, JSON.stringify(interpretation, null, 2))
    
    console.log('')
    console.log('═══════════════════════════════════════════════════════════════')
    console.log('  INTERPRETATION COMPLETE')
    console.log('═══════════════════════════════════════════════════════════════')
    console.log(`  Overall: ${aggregate.overall}`)
    console.log(`  Confidence: ${aggregate.confidence}`)
    console.log(`  Reason: ${aggregate.reason}`)
    console.log('')
    console.log(`  Summary:`)
    console.log(`    ✅ VERIFIED_OK: ${interpretation.summary.verified_ok}`)
    console.log(`    ❌ VERIFIED_NOT_OK: ${interpretation.summary.verified_not_ok}`)
    console.log(`    ⚠️  QC_INVALID: ${interpretation.summary.qc_invalid}`)
    console.log('')
    console.log(`  Report: ${interpretationPath}`)
    console.log('')
    
    // Output for orchestrator
    const output = {
      interpretationPath,
      overall: aggregate.overall,
      confidence: aggregate.confidence,
      fixTaskCount: interpretation.fixTasks.length,
    }
    
    fs.writeFileSync(path.join(artifactDir, 'phase3_output.json'), JSON.stringify(output, null, 2))
    console.log('OUTPUT_JSON:' + JSON.stringify(output))
    
    // Exit code based on classification
    const exitCode = aggregate.overall === 'VERIFIED_OK' ? 0 :
                     aggregate.overall === 'VERIFIED_NOT_OK' ? 1 : 2
    process.exit(exitCode)
    
  } catch (error) {
    console.error('❌ Interpretation failed:', error.message)
    console.error(error.stack)
    process.exit(1)
  }
}

/**
 * Generate fix suggestion based on interpretation
 */
function generateFixSuggestion(interpretation) {
  const findings = interpretation.findings || []
  
  if (findings.some(f => f.id === 'ui_elements_clipped')) {
    return 'Check CSS overflow properties and container dimensions'
  }
  
  if (findings.some(f => f.id === 'error_visible')) {
    return 'Investigate visible error state and resolve underlying issue'
  }
  
  if (findings.some(f => f.id === 'player_area' && !f.visible)) {
    return 'Verify player component mounting and visibility'
  }
  
  return 'Manual investigation required'
}

main()
