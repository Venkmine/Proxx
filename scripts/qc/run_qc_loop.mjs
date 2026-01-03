#!/usr/bin/env node
/**
 * QC LOOP ORCHESTRATOR
 * 
 * Orchestrates the complete visual QC pipeline:
 *   PHASE 0: Preconditions (backend, GLM API key)
 *   PHASE 1: run_visual_qc.mjs (Playwright execution)
 *   PHASE 2: run_glm_visual_judge.mjs (GLM analysis)
 *   PHASE 3: interpret_glm_report.mjs (Rule-based interpretation)
 *   PHASE 4: Decision output
 * 
 * EXIT CODES:
 * - 0 = QC PASS (VERIFIED_OK)
 * - 1 = QC FAIL (VERIFIED_NOT_OK)
 * - 2 = QC INVALID (re-run required)
 * - 3 = BLOCKED_PRECONDITION (backend/dependencies unavailable)
 * 
 * REVERSIBILITY:
 * - Can skip phases (e.g., re-run interpretation on existing GLM report)
 * - Can re-run GLM analysis on existing screenshots
 * - All artifacts are timestamped and preserved
 */

import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { config } from 'dotenv'
import { startBackend, waitForHealthy, stopBackend, setupCleanupHandler } from './backend_controller.mjs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const projectRoot = path.resolve(__dirname, '../..')

/**
 * Run a phase script and capture output
 */
function runPhase(scriptPath, args = [], options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn('node', [scriptPath, ...args], {
      cwd: projectRoot,
      env: { ...process.env, ...options.env },
      stdio: 'pipe',
    })

    let stdout = ''
    let stderr = ''
    let outputJson = null

    child.stdout.on('data', (data) => {
      const text = data.toString()
      stdout += text
      
      // Extract OUTPUT_JSON lines
      const lines = text.split('\n')
      for (const line of lines) {
        if (line.startsWith('OUTPUT_JSON:')) {
          try {
            outputJson = JSON.parse(line.substring('OUTPUT_JSON:'.length))
          } catch (e) {
            // Ignore parse errors
          }
        } else {
          process.stdout.write(line + '\n')
        }
      }
    })

    child.stderr.on('data', (data) => {
      const text = data.toString()
      stderr += text
      process.stderr.write(text)
    })

    child.on('close', (code) => {
      resolve({
        exitCode: code,
        stdout,
        stderr,
        output: outputJson,
      })
    })

    child.on('error', (err) => {
      reject(err)
    })
  })
}

/**
 * Find the latest artifact directory
 */
function findLatestArtifact() {
  const visualDir = path.join(projectRoot, 'artifacts/ui/visual')
  if (!fs.existsSync(visualDir)) return null
  
  const dirs = fs.readdirSync(visualDir, { withFileTypes: true })
    .filter(d => d.isDirectory() && /^\d{4}-\d{2}-\d{2}T/.test(d.name))
    .map(d => d.name)
    .sort()
    .reverse()
  
  return dirs.length > 0 ? path.join(visualDir, dirs[0]) : null
}

/**
 * Print banner
 */
function printBanner(text) {
  console.log('')
  console.log('═══════════════════════════════════════════════════════════════')
  console.log(`  ${text}`)
  console.log('═══════════════════════════════════════════════════════════════')
  console.log('')
}

/**
 * Parse command line arguments
 */
function parseArgs() {
  const args = process.argv.slice(2)
  const options = {
    skipExecution: false,
    skipGlm: false,
    artifactPath: null,
    questionSet: 'v1',
    rulesVersion: 'v1',
    dryRun: false,
  }
  
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--skip-execution':
        options.skipExecution = true
        break
      case '--skip-glm':
        options.skipGlm = true
        break
      case '--artifact-path':
        options.artifactPath = args[++i]
        break
      case '--question-set':
        options.questionSet = args[++i]
        break
      case '--rules':
        options.rulesVersion = args[++i]
        break
      case '--dry-run':
        options.dryRun = true
        break
      case '--help':
        printHelp()
        process.exit(0)
        break
    }
  }
  
  return options
}

function printHelp() {
  console.log(`
QC Loop Orchestrator - Reversible Visual QC Pipeline

USAGE:
  node run_qc_loop.mjs [options]

OPTIONS:
  --skip-execution       Skip Phase 1 (use existing screenshots)
  --skip-glm             Skip Phase 2 (use existing GLM report)
  --artifact-path <path> Use specific artifact directory
  --question-set <ver>   GLM question set version (default: v1)
  --rules <ver>          Interpretation rules version (default: v1)
  --dry-run              Show what would be done without executing
  --help                 Show this help

EXAMPLES:
  # Full QC loop
  node run_qc_loop.mjs

  # Re-run interpretation on existing GLM report
  node run_qc_loop.mjs --skip-execution --skip-glm --artifact-path ./artifacts/ui/visual/2026-01-03T12-00-00

  # Re-run GLM analysis on existing screenshots
  node run_qc_loop.mjs --skip-execution --artifact-path ./artifacts/ui/visual/2026-01-03T12-00-00

EXIT CODES:
  0 = QC PASS (VERIFIED_OK)
  1 = QC FAIL (VERIFIED_NOT_OK)
  2 = QC INVALID (re-run required)
`)
}

/**
 * Main execution
 */
async function main() {
  const options = parseArgs()
  
  // Setup cleanup handler for graceful shutdown
  setupCleanupHandler()
  
  // Load environment variables
  config()
  
  // PHASE 0: PRECONDITIONS
  printBanner('PHASE 0 — PRECONDITIONS')
  console.log('  Checking environment and dependencies...')
  console.log('')
  
  // Check GLM_API_KEY
  if (!process.env.GLM_API_KEY) {
    console.error('  ❌ BLOCKED: GLM_API_KEY not found')
    console.error('')
    console.error('  The visual QC loop requires a GLM API key for visual verification.')
    console.error('  Please create a .env file in the project root with:')
    console.error('    GLM_API_KEY=<your-glm-api-key>')
    console.error('')
    process.exit(3)
  }
  console.log('  ✓ GLM_API_KEY loaded')
  
  // Start backend (required for UI testing)
  console.log('  Starting backend...')
  try {
    const { pid, timestamp } = await startBackend()
    console.log(`    ✓ Backend started (PID: ${pid}, started: ${timestamp})`)
    
    // Wait for backend to be healthy
    const healthLatency = await waitForHealthy()
    console.log(`    ✓ Backend healthy (latency: ${healthLatency}ms)`)
  } catch (error) {
    console.error(`  ❌ BLOCKED: Backend failed to start`)
    console.error(`     ${error.message}`)
    console.error('')
    process.exit(3)
  }
  console.log('')
  
  printBanner('VISUAL QC LOOP ORCHESTRATOR')
  console.log('  Mode:')
  console.log(`    Skip Execution: ${options.skipExecution}`)
  console.log(`    Skip GLM: ${options.skipGlm}`)
  console.log(`    Artifact Path: ${options.artifactPath || '(auto)'}`)
  console.log(`    Question Set: ${options.questionSet}`)
  console.log(`    Rules: ${options.rulesVersion}`)
  console.log(`    Dry Run: ${options.dryRun}`)
  console.log('')
  
  let artifactPath = options.artifactPath
  let glmReportPath = null
  
  // PHASE 1: Execution
  if (!options.skipExecution) {
    printBanner('PHASE 1 — EXECUTION')
    
    if (options.dryRun) {
      console.log('  [DRY RUN] Would run: scripts/qc/run_visual_qc.mjs')
    } else {
      const phase1 = await runPhase(
        path.join(__dirname, 'run_visual_qc.mjs'),
        [],
        {}
      )
      
      if (phase1.output) {
        artifactPath = phase1.output.artifactPath
        
        // Check for QC_INVALID due to splash failure
        if (phase1.output.qcInvalid || phase1.output.splashFailure) {
          console.log('')
          console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
          console.log('  ⚠️  QC RUN MARKED AS INVALID')
          console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
          console.log('')
          console.log('Reason: Splash screen did not dismiss within timeout')
          console.log('')
          console.log('This QC run is INVALID because:')
          console.log('  • Screenshots were taken with splash screen visible')
          console.log('  • GLM-4.6V cannot interpret whether splash "should" be visible')
          console.log('  • Visual QC requires ACTUAL application UI, not startup states')
          console.log('')
          console.log('The pipeline will STOP here. GLM analysis will NOT run.')
          console.log('')
          console.log('What to do:')
          console.log('  1. Check application startup performance')
          console.log('  2. Verify splash dismissal logic is working')
          console.log('  3. Look for SPLASH_ONLY.png in artifact directory')
          console.log('  4. Check backend/dependency availability')
          console.log('')
          console.log(`Artifact directory: ${artifactPath}`)
          console.log('')
          console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
          
          // Exit with QC_INVALID code
          process.exit(2)
        }
      }
      
      if (phase1.exitCode === 2) {
        // Exit code 2 = QC_INVALID
        console.log('')
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
        console.log('  ⚠️  QC RUN MARKED AS INVALID (Exit Code 2)')
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
        console.log('')
        console.log('The execution phase returned exit code 2, indicating QC_INVALID.')
        console.log('This typically means the test environment is not ready for visual QC.')
        console.log('')
        console.log('Common causes:')
        console.log('  • Splash screen timeout (app startup >30 seconds)')
        console.log('  • Application failed to load properly')
        console.log('  • Test environment misconfiguration')
        console.log('')
        console.log(`Artifact directory: ${artifactPath || '(not created)'}`)
        console.log('')
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
        
        process.exit(2)
      }
      
      if (phase1.exitCode !== 0 && !artifactPath) {
        console.error('❌ Phase 1 failed and no artifacts were produced')
        process.exit(1)
      }
    }
  } else {
    // Use existing artifacts
    if (!artifactPath) {
      artifactPath = findLatestArtifact()
      if (!artifactPath) {
        console.error('❌ No artifact path specified and no existing artifacts found')
        process.exit(1)
      }
      console.log(`  Using latest artifact: ${artifactPath}`)
    }
  }
  
  // Validate artifact path
  if (!options.dryRun && !fs.existsSync(artifactPath)) {
    console.error(`❌ Artifact path not found: ${artifactPath}`)
    process.exit(1)
  }
  
  // PHASE 2: GLM Visual Judgment
  if (!options.skipGlm) {
    printBanner('PHASE 2 — VISUAL JUDGMENT (GLM)')
    
    if (options.dryRun) {
      console.log(`  [DRY RUN] Would run: scripts/qc/run_glm_visual_judge.mjs ${artifactPath}`)
    } else {
      const phase2 = await runPhase(
        path.join(__dirname, 'run_glm_visual_judge.mjs'),
        [artifactPath, '--question-set', options.questionSet],
        {}
      )
      
      if (phase2.output) {
        glmReportPath = phase2.output.glmReportPath
      } else {
        glmReportPath = path.join(artifactPath, 'glm_report.json')
      }
      
      if (phase2.exitCode !== 0) {
        console.warn('⚠️  Phase 2 completed with errors')
      }
    }
  } else {
    // Use existing GLM report
    glmReportPath = path.join(artifactPath, 'glm_report.json')
    if (!options.dryRun && !fs.existsSync(glmReportPath)) {
      console.error(`❌ GLM report not found: ${glmReportPath}`)
      console.error('   Cannot skip GLM phase without existing report')
      process.exit(1)
    }
    console.log(`  Using existing GLM report: ${glmReportPath}`)
  }
  
  // PHASE 3: Interpretation
  printBanner('PHASE 3 — INTERPRETATION')
  
  let interpretationResult = null
  
  if (options.dryRun) {
    console.log(`  [DRY RUN] Would run: scripts/qc/interpret_glm_report.mjs ${glmReportPath}`)
    interpretationResult = { overall: 'UNKNOWN', exitCode: 0 }
  } else {
    const phase3 = await runPhase(
      path.join(__dirname, 'interpret_glm_report.mjs'),
      [glmReportPath, '--rules', options.rulesVersion],
      {}
    )
    
    interpretationResult = {
      overall: phase3.output?.overall || 'UNKNOWN',
      confidence: phase3.output?.confidence || 'unknown',
      fixTaskCount: phase3.output?.fixTaskCount || 0,
      exitCode: phase3.exitCode,
    }
  }
  
  // PHASE 4: Decision
  printBanner('PHASE 4 — DECISION')
  
  // Load full interpretation to get action-scoped data
  let actionSummary = null
  if (artifactPath) {
    const interpPath = path.join(artifactPath, 'qc_interpretation.json')
    if (fs.existsSync(interpPath)) {
      try {
        const interpData = JSON.parse(fs.readFileSync(interpPath, 'utf-8'))
        if (interpData.actions) {
          actionSummary = interpData.actions.aggregate
        }
      } catch (e) {
        // Ignore parse errors
      }
    }
  }
  
  const decision = {
    classification: interpretationResult.overall,
    confidence: interpretationResult.confidence,
    artifactPath,
    glmReportPath,
    timestamp: new Date().toISOString(),
    // Action-scoped QC summary
    actions: actionSummary ? {
      total: actionSummary.total_actions,
      verified_ok: actionSummary.verified_ok,
      verified_not_ok: actionSummary.verified_not_ok,
      blocked_precondition: actionSummary.blocked_precondition,
      blocked_actions: actionSummary.blocked_actions,
      failed_actions: actionSummary.failed_actions,
    } : null,
  }
  
  if (interpretationResult.overall === 'VERIFIED_OK') {
    console.log('  ✅ QC PASS')
    console.log('')
    console.log('  All visual checks passed.')
    if (actionSummary && actionSummary.blocked_precondition > 0) {
      console.log(`  ⏸️  ${actionSummary.blocked_precondition} action(s) blocked by preconditions (not failures).`)
      for (const blocked of actionSummary.blocked_actions || []) {
        console.log(`     - ${blocked.action_id}: ${blocked.reason}`)
      }
    }
    console.log('  No action required.')
    decision.action = 'NONE'
    decision.exitCode = 0
    
  } else if (interpretationResult.overall === 'VERIFIED_NOT_OK') {
    console.log('  ❌ QC FAIL')
    console.log('')
    console.log(`  ${interpretationResult.fixTaskCount} issue(s) detected.`)
    console.log('  Fix tasks have been generated.')
    console.log('')
    console.log('  Next steps:')
    console.log('    1. Review qc_interpretation.json for details')
    console.log('    2. Apply fixes')
    console.log('    3. Re-run QC loop')
    decision.action = 'FIX_REQUIRED'
    decision.exitCode = 1
    
  } else if (interpretationResult.overall === 'QC_INVALID') {
    console.log('  ⚠️  QC INVALID')
    console.log('')
    console.log('  Cannot assess screenshots (e.g., splash-only or processing error).')
    console.log('')
    console.log('  Next steps:')
    console.log('    1. Ensure app is fully loaded before capturing')
    console.log('    2. Check backend connectivity')
    console.log('    3. Re-run QC loop')
    decision.action = 'RERUN_REQUIRED'
    decision.exitCode = 2
    
  } else {
    console.log('  ❓ UNKNOWN')
    console.log('')
    console.log('  Could not determine QC status.')
    decision.action = 'MANUAL_REVIEW'
    decision.exitCode = 1
  }
  
  // Write decision
  if (!options.dryRun && artifactPath) {
    const decisionPath = path.join(artifactPath, 'qc_decision.json')
    fs.writeFileSync(decisionPath, JSON.stringify(decision, null, 2))
    console.log('')
    console.log(`  Decision written to: ${decisionPath}`)
  }
  
  console.log('')
  console.log('═══════════════════════════════════════════════════════════════')
  console.log(`  QC LOOP COMPLETE — Exit Code: ${decision.exitCode}`)
  console.log('═══════════════════════════════════════════════════════════════')
  console.log('')
  
  // Stop backend before exit
  await stopBackend()
  
  process.exit(decision.exitCode)
}

main().catch(async (error) => {
  console.error('❌ QC Loop failed:', error.message)
  console.error(error.stack)
  
  // Stop backend before exit
  await stopBackend()
  
  process.exit(1)
})
