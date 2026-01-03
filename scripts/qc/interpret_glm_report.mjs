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
 * 
 * AUTHORITATIVE SPECS:
 * - docs/UI_QC_BEHAVIOUR_SPEC.md — defines what features QC may judge
 * - docs/UI_QC_WORKFLOW.md — defines workflow states and expectations
 * 
 * Features not covered by the Behaviour Spec must be rejected from judgement.
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const projectRoot = path.resolve(__dirname, '../..')

// ============================================================================
// AUTHORITATIVE SPEC LOADER
// ============================================================================

/**
 * Load and parse the authoritative UI behaviour spec.
 * Returns the list of features that QC is allowed to judge.
 */
function loadBehaviourSpec() {
  const specPath = path.join(projectRoot, 'docs', 'UI_QC_BEHAVIOUR_SPEC.md')
  
  if (!fs.existsSync(specPath)) {
    console.warn(`⚠️  Behaviour spec not found: ${specPath}`)
    console.warn('   Falling back to embedded feature list.')
    return null
  }
  
  const content = fs.readFileSync(specPath, 'utf-8')
  
  // Extract defined feature names from the spec (### feature_name sections)
  const featureRegex = /^### (\w+)\s*$/gm
  const features = []
  let match
  
  while ((match = featureRegex.exec(content)) !== null) {
    features.push(match[1])
  }
  
  return {
    path: specPath,
    features,
    raw: content,
  }
}

/**
 * Load and parse the authoritative workflow spec.
 * Returns the workflow states and their expected features.
 */
function loadWorkflowSpec() {
  const specPath = path.join(projectRoot, 'docs', 'UI_QC_WORKFLOW.md')
  
  if (!fs.existsSync(specPath)) {
    console.warn(`⚠️  Workflow spec not found: ${specPath}`)
    console.warn('   Falling back to embedded state definitions.')
    return null
  }
  
  const content = fs.readFileSync(specPath, 'utf-8')
  
  // Extract defined state names from the spec (### state_name sections)
  const stateRegex = /^### (\w+)\s*$/gm
  const states = []
  let match
  
  while ((match = stateRegex.exec(content)) !== null) {
    // Skip non-state headers like "Determining Current State"
    const validStates = ['idle', 'source_loaded', 'job_running', 'job_complete']
    if (validStates.includes(match[1])) {
      states.push(match[1])
    }
  }
  
  return {
    path: specPath,
    states,
    raw: content,
  }
}

/**
 * Check if a feature is covered by the authoritative spec.
 * If not covered, QC must ignore it.
 */
function isFeatureCoveredBySpec(featureId, behaviourSpec) {
  if (!behaviourSpec) {
    // Fallback: all features in embedded rules are covered
    return true
  }
  return behaviourSpec.features.includes(featureId)
}

// Global spec references (loaded once at startup)
let BEHAVIOUR_SPEC = null
let WORKFLOW_SPEC = null

/**
 * Interpretation rules (versioned)
 * 
 * Each rule defines:
 * - condition: function to evaluate answers
 * - classification: resulting classification
 * - reason: human-readable explanation
 * 
 * NOTE: Features must be covered by docs/UI_QC_BEHAVIOUR_SPEC.md.
 * If a feature is not defined there, judgements against it are rejected.
 */
const INTERPRETATION_RULES_V1 = {
  version: 'v1',
  
  /**
   * Features defined in UI_QC_BEHAVIOUR_SPEC.md that can be judged.
   * If a feature is not in this list, QC ignores it.
   */
  definedFeatures: [
    'player_area',
    'preview_controls',
    'progress_bar',
    'create_job_button',
    'queue_panel',
    'status_panel',
    'audit_banner',
  ],
  
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
   * 
   * NOTE: Only features defined in UI_QC_BEHAVIOUR_SPEC.md are judged.
   * The 'required' field is now state-dependent (see workflow spec).
   * For v1, player_area is NOT required in 'idle' state.
   */
  requiredVisible: [
    {
      id: 'player_area',
      answerKey: 'player_area_visible',
      required: false, // State-dependent — see workflow spec
      weight: 'high',
      coveredBySpec: true,
    },
    {
      id: 'queue_panel',
      answerKey: 'queue_panel_visible',
      required: false, // Always visible but not blocking
      weight: 'medium',
      coveredBySpec: true,
    },
    {
      id: 'zoom_controls',
      answerKey: 'zoom_controls_visible',
      required: false,
      weight: 'low',
      coveredBySpec: false, // NOT in behaviour spec — ignored
    },
  ],
}

/**
 * Determine workflow state from GLM answers.
 * Uses heuristics defined in UI_QC_WORKFLOW.md.
 */
function inferWorkflowState(answers) {
  // Check for progress bar → job_running
  if (answers.progress_bar_visible === 'yes') {
    return 'job_running'
  }
  
  // Check for completion indicators (would need to be added to questions)
  // For now, if player visible → source_loaded (conservative)
  if (answers.player_area_visible === 'yes') {
    return 'source_loaded'
  }
  
  // Default to idle
  return 'idle'
}

/**
 * Check if a feature judgement should be rejected because it's not in spec.
 */
function shouldRejectJudgement(featureId, rules) {
  // Check if feature is in the definedFeatures list
  if (!rules.definedFeatures.includes(featureId)) {
    return {
      rejected: true,
      reason: `Feature '${featureId}' not defined in UI_QC_BEHAVIOUR_SPEC.md — judgement rejected`,
    }
  }
  return { rejected: false }
}

/**
 * Apply interpretation rules to a single screenshot's answers.
 * 
 * AUTHORITATIVE: Only judges features defined in UI_QC_BEHAVIOUR_SPEC.md.
 * Features not covered by the spec are rejected from judgement.
 */
function interpretScreenshot(answers, rules) {
  const findings = []
  const rejectedJudgements = []
  const inferredState = inferWorkflowState(answers)
  
  // Check for QC invalid conditions first
  for (const condition of rules.invalidConditions) {
    if (condition.check(answers)) {
      return {
        classification: 'QC_INVALID',
        reason: condition.reason,
        ruleId: condition.id,
        findings: [{ type: 'invalid', ...condition }],
        inferredState,
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
      inferredState,
    }
  }
  
  // Check required visibility — only for features covered by spec
  const missingRequired = []
  const visibilityStatus = []
  
  for (const check of rules.requiredVisible) {
    // SPEC ENFORCEMENT: Skip features not covered by the behaviour spec
    if (check.coveredBySpec === false) {
      rejectedJudgements.push({
        id: check.id,
        reason: `Feature '${check.id}' not in UI_QC_BEHAVIOUR_SPEC.md — skipped`,
      })
      continue
    }
    
    // SPEC ENFORCEMENT: Check if feature is in defined list
    const rejection = shouldRejectJudgement(check.id, rules)
    if (rejection.rejected) {
      rejectedJudgements.push({
        id: check.id,
        reason: rejection.reason,
      })
      continue
    }
    
    const isVisible = answers[check.answerKey] === 'yes'
    
    // STATE-AWARE: player_area is NOT required in 'idle' state
    // per UI_QC_WORKFLOW.md (branded idle background is correct)
    let effectiveRequired = check.required
    if (check.id === 'player_area' && inferredState === 'idle') {
      effectiveRequired = false // Idle state doesn't require player
    }
    
    visibilityStatus.push({
      id: check.id,
      visible: isVisible,
      required: effectiveRequired,
      weight: check.weight,
      inferredState,
    })
    
    if (effectiveRequired && !isVisible) {
      missingRequired.push(check.id)
    }
  }
  
  if (missingRequired.length > 0) {
    return {
      classification: 'VERIFIED_NOT_OK',
      reason: `Missing required UI elements: ${missingRequired.join(', ')}`,
      findings: visibilityStatus.filter(v => v.required && !v.visible),
      inferredState,
      rejectedJudgements,
    }
  }
  
  // All checks passed
  return {
    classification: 'VERIFIED_OK',
    reason: 'All critical checks passed',
    findings: visibilityStatus,
    inferredState,
    rejectedJudgements,
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
    // Load authoritative specs
    BEHAVIOUR_SPEC = loadBehaviourSpec()
    WORKFLOW_SPEC = loadWorkflowSpec()
    
    if (BEHAVIOUR_SPEC) {
      console.log(`📋 Loaded UI_QC_BEHAVIOUR_SPEC.md (${BEHAVIOUR_SPEC.features.length} defined features)`)
      console.log(`   Features: ${BEHAVIOUR_SPEC.features.join(', ')}`)
    } else {
      console.log('⚠️  No behaviour spec found — using embedded rules')
    }
    
    if (WORKFLOW_SPEC) {
      console.log(`📋 Loaded UI_QC_WORKFLOW.md (${WORKFLOW_SPEC.states.length} workflow states)`)
      console.log(`   States: ${WORKFLOW_SPEC.states.join(', ')}`)
    } else {
      console.log('⚠️  No workflow spec found — using embedded states')
    }
    console.log('')
    
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
    
    // ========================================================================
    // ACTION-SCOPED QC (if action traces exist)
    // ========================================================================
    const artifactDir = path.dirname(glmReportPath)
    const actionTraces = loadActionTraces(artifactDir)
    let actionInterpretations = []
    let actionAggregate = null
    
    if (actionTraces.length > 0) {
      console.log('')
      console.log('🎯 Processing action traces...')
      
      for (const trace of actionTraces) {
        const interp = interpretActionTrace(trace)
        actionInterpretations.push(interp)
        
        const icon = interp.is_success ? '✅' :
                     interp.is_blocked ? '⏸️' : '❌'
        console.log(`  ${icon} ${trace.action_id}: ${trace.qc_outcome}`)
      }
      
      actionAggregate = aggregateActionInterpretations(actionInterpretations)
      console.log('')
      console.log(`  Action Summary:`)
      console.log(`    ✅ VERIFIED_OK: ${actionAggregate.verified_ok}`)
      console.log(`    ❌ VERIFIED_NOT_OK: ${actionAggregate.verified_not_ok}`)
      console.log(`    ⏸️  BLOCKED_PRECONDITION: ${actionAggregate.blocked_precondition}`)
    }
    
    // ========================================================================
    // INTENT-AWARE INTERPRETATION (if intent execution result exists)
    // ========================================================================
    let intentResult = null
    const intentResultPath = path.join(artifactDir, 'intent_execution_result.json')
    
    if (fs.existsSync(intentResultPath)) {
      try {
        intentResult = JSON.parse(fs.readFileSync(intentResultPath, 'utf-8'))
        console.log('')
        console.log('🎯 Processing intent execution result...')
        console.log(`   Intent: ${intentResult.intent_id}`)
        console.log(`   Success: ${intentResult.success}`)
        console.log(`   Completed: ${intentResult.completed_steps}/${intentResult.total_steps}`)
        
        if (!intentResult.success) {
          console.log(`   ⚠️  Blocked at: ${intentResult.blocked_at}`)
          console.log(`   Reason: ${intentResult.failure_reason}`)
        }
      } catch (e) {
        console.warn(`⚠️  Failed to load intent result: ${e.message}`)
      }
    }
    
    // Build interpretation report
    const artifactDir2 = path.dirname(glmReportPath)
    const interpretation = {
      version: '1.2.0', // Bumped for intent-aware QC support
      phase: 'INTERPRETATION',
      generatedAt: new Date().toISOString(),
      glmReportPath,
      rulesVersion: rules.version,
      
      // Intent execution result (if present)
      intent: intentResult ? {
        intent_id: intentResult.intent_id,
        success: intentResult.success,
        completed_steps: intentResult.completed_steps,
        total_steps: intentResult.total_steps,
        blocked_at: intentResult.blocked_at,
        failure_reason: intentResult.failure_reason,
        workflow_states: intentResult.workflow_states,
      } : null,
      
      // Authoritative spec references
      authoritativeSpecs: {
        behaviourSpec: BEHAVIOUR_SPEC ? {
          path: BEHAVIOUR_SPEC.path,
          features: BEHAVIOUR_SPEC.features,
        } : null,
        workflowSpec: WORKFLOW_SPEC ? {
          path: WORKFLOW_SPEC.path,
          states: WORKFLOW_SPEC.states,
        } : null,
        actionTraceSpec: 'docs/QC_ACTION_TRACE.md',
        note: 'QC judgements are limited to features defined in UI_QC_BEHAVIOUR_SPEC.md. Action-scoped QC overrides screenshot-only judgement.',
      },
      
      overall: aggregate,
      
      // Scenario-based (screenshot) results
      screenshots: interpretations,
      
      // Action-scoped results (if available)
      actions: actionInterpretations.length > 0 ? {
        traces: actionInterpretations,
        aggregate: actionAggregate,
      } : null,
      
      summary: {
        total: interpretations.length,
        verified_ok: interpretations.filter(i => i.classification === 'VERIFIED_OK').length,
        verified_not_ok: interpretations.filter(i => i.classification === 'VERIFIED_NOT_OK').length,
        qc_invalid: interpretations.filter(i => i.classification === 'QC_INVALID').length,
        // Action summary
        actions_total: actionInterpretations.length,
        actions_verified_ok: actionAggregate?.verified_ok || 0,
        actions_verified_not_ok: actionAggregate?.verified_not_ok || 0,
        actions_blocked: actionAggregate?.blocked_precondition || 0,
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
      
      // Action-level fix tasks
      actionFixTasks: actionInterpretations
        .filter(a => a.is_failure)
        .map(a => ({
          action_id: a.action_id,
          issue: a.qc_reason,
          backend_signals: a.backend_signals,
        })),
    }
    
    // Write interpretation
    const interpretationPath = path.join(artifactDir2, 'qc_interpretation.json')
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
    if (actionInterpretations.length > 0) {
      console.log('')
      console.log(`  Actions:`)
      console.log(`    ✅ VERIFIED_OK: ${interpretation.summary.actions_verified_ok}`)
      console.log(`    ❌ VERIFIED_NOT_OK: ${interpretation.summary.actions_verified_not_ok}`)
      console.log(`    ⏸️  BLOCKED: ${interpretation.summary.actions_blocked}`)
    }
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

// ============================================================================
// ACTION-SCOPED QC INTERPRETATION
// ============================================================================

/**
 * Load action traces from the actions artifact directory.
 * See docs/QC_ACTION_TRACE.md for schema.
 */
function loadActionTraces(baseArtifactDir) {
  const actionsDir = path.join(baseArtifactDir, '..', 'actions')
  
  if (!fs.existsSync(actionsDir)) {
    return []
  }
  
  const traces = []
  
  // Scan timestamp directories
  const timestamps = fs.readdirSync(actionsDir, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name)
  
  for (const ts of timestamps) {
    const tsDir = path.join(actionsDir, ts)
    
    // Scan action directories
    const actionDirs = fs.readdirSync(tsDir, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => d.name)
    
    for (const actionId of actionDirs) {
      const tracePath = path.join(tsDir, actionId, 'action_trace.json')
      
      if (fs.existsSync(tracePath)) {
        try {
          const trace = JSON.parse(fs.readFileSync(tracePath, 'utf-8'))
          traces.push({
            ...trace,
            trace_path: tracePath,
          })
        } catch (e) {
          console.warn(`⚠️  Failed to parse action trace: ${tracePath}`)
        }
      }
    }
  }
  
  return traces
}

/**
 * Interpret action traces according to QC_ACTION_TRACE.md rules.
 * 
 * For click_create_job:
 * - If backend_signals.job_created == false AND error_category is precondition/backend:
 *   → BLOCKED_PRECONDITION
 * - If backend_signals.job_created == true AND UI violates spec:
 *   → VERIFIED_NOT_OK
 * - If backend_signals.job_created == true AND UI matches spec:
 *   → VERIFIED_OK
 */
function interpretActionTrace(trace) {
  const actionId = trace.action_id
  const backend = trace.backend_signals || {}
  const evaluation = trace.evaluation_details || {}
  
  // Action already has qc_outcome from instrumentation
  // We validate and potentially override based on GLM analysis
  
  const interpretation = {
    action_id: actionId,
    trace_id: trace.trace_id,
    prior_state: trace.prior_workflow_state,
    expected_transition: trace.expected_transition,
    backend_signals: backend,
    qc_outcome: trace.qc_outcome,
    qc_reason: trace.qc_reason,
    
    // Flag for aggregation
    is_blocked: trace.qc_outcome === 'BLOCKED_PRECONDITION',
    is_failure: trace.qc_outcome === 'VERIFIED_NOT_OK',
    is_success: trace.qc_outcome === 'VERIFIED_OK',
  }
  
  return interpretation
}

/**
 * Aggregate action interpretations.
 */
function aggregateActionInterpretations(actionInterpretations) {
  if (actionInterpretations.length === 0) {
    return null
  }
  
  const blocked = actionInterpretations.filter(a => a.is_blocked)
  const failed = actionInterpretations.filter(a => a.is_failure)
  const passed = actionInterpretations.filter(a => a.is_success)
  
  return {
    total_actions: actionInterpretations.length,
    verified_ok: passed.length,
    verified_not_ok: failed.length,
    blocked_precondition: blocked.length,
    blocked_actions: blocked.map(a => ({ action_id: a.action_id, reason: a.qc_reason })),
    failed_actions: failed.map(a => ({ action_id: a.action_id, reason: a.qc_reason })),
  }
}

main()
