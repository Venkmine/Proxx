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
 * - 1 = QC FAIL (VERIFIED_NOT_OK or HIGH severity usability failure)
 * - 2 = QC INVALID (re-run required) or MEDIUM severity usability failure
 * - 3 = BLOCKED_PRECONDITION (backend/dependencies unavailable)
 * 
 * INTENT_010 USABILITY GATE:
 * - HIGH severity → exit code 1 (blocking)
 * - MEDIUM severity → exit code 2 (warning, re-run required)
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
 * Check for INTENT_010 usability result and determine exit code
 * 
 * @param {string} artifactPath - Path to the artifact directory
 * @returns {{ found: boolean, verdict?: string, severity?: string, failed_check_id?: string, report_path?: string, exitCode?: number }}
 */
function checkIntent010Result(artifactPath) {
  if (!artifactPath) return { found: false }
  
  // Search for intent_010_result.json in artifact directory and subdirectories
  const possiblePaths = [
    path.join(artifactPath, 'intent_010_result.json'),
    path.join(artifactPath, 'verify_layout_sanity_at_1440x900', 'intent_010_result.json'),
  ]
  
  // Also search subdirectories
  try {
    const subdirs = fs.readdirSync(artifactPath, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => path.join(artifactPath, d.name, 'intent_010_result.json'))
    possiblePaths.push(...subdirs)
  } catch (e) {
    // Ignore read errors
  }
  
  for (const resultPath of possiblePaths) {
    if (fs.existsSync(resultPath)) {
      try {
        const result = JSON.parse(fs.readFileSync(resultPath, 'utf-8'))
        
        if (result.intent_id === 'INTENT_010') {
          const response = {
            found: true,
            verdict: result.verdict,
            severity: result.severity,
            failed_check_id: result.failure_payload?.check_id || result.failed_at,
            report_path: result.report_path || resultPath.replace('_result.json', '_usability_report.md'),
          }
          
          // Determine exit code based on severity
          if (result.verdict === 'VERIFIED_OK') {
            response.exitCode = 0
          } else if (result.severity === 'HIGH') {
            response.exitCode = 1 // Blocking failure
          } else if (result.severity === 'MEDIUM') {
            response.exitCode = 2 // Warning, re-run required
          } else {
            response.exitCode = 1 // Default to fail if severity unknown
          }
          
          return response
        }
      } catch (e) {
        // Ignore parse errors
      }
    }
  }
  
  return { found: false }
}

/**
 * Check for INTENT_020 accessibility result and determine exit code
 * 
 * @param {string} artifactPath - Path to the artifact directory
 * @returns {{ found: boolean, verdict?: string, severity?: string, failed_check_id?: string, report_path?: string, exitCode?: number }}
 */
function checkIntent020Result(artifactPath) {
  if (!artifactPath) return { found: false }
  
  // Search for intent_020_result.json in artifact directory and subdirectories
  const possiblePaths = [
    path.join(artifactPath, 'intent_020_result.json'),
  ]
  
  // Also search subdirectories
  try {
    const subdirs = fs.readdirSync(artifactPath, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => path.join(artifactPath, d.name, 'intent_020_result.json'))
    possiblePaths.push(...subdirs)
  } catch (e) {
    // Ignore read errors
  }
  
  for (const resultPath of possiblePaths) {
    if (fs.existsSync(resultPath)) {
      try {
        const result = JSON.parse(fs.readFileSync(resultPath, 'utf-8'))
        
        if (result.intent_id === 'INTENT_020') {
          const response = {
            found: true,
            verdict: result.verdict,
            severity: result.severity,
            failed_check_id: result.failure_payload?.check_id || result.failed_at,
            report_path: result.report_path || resultPath.replace('_result.json', '_report.md'),
          }
          
          // Determine exit code based on severity
          if (result.verdict === 'VERIFIED_OK') {
            response.exitCode = 0
          } else if (result.severity === 'HIGH') {
            response.exitCode = 1 // Blocking failure
          } else if (result.severity === 'MEDIUM') {
            response.exitCode = 2 // Warning, re-run required
          } else {
            response.exitCode = 1 // Default to fail if severity unknown
          }
          
          return response
        }
      } catch (e) {
        // Ignore parse errors
      }
    }
  }
  
  return { found: false }
}

/**
 * Check for INTENT_030 state integrity result and determine exit code
 * 
 * @param {string} artifactPath - Path to the artifact directory
 * @returns {{ found: boolean, verdict?: string, severity?: string, failed_check_id?: string, report_path?: string, exitCode?: number }}
 */
function checkIntent030Result(artifactPath) {
  if (!artifactPath) return { found: false }
  
  // Search for intent_030_result.json in artifact directory and subdirectories
  const possiblePaths = [
    path.join(artifactPath, 'intent_030_result.json'),
  ]
  
  // Also search subdirectories
  try {
    const subdirs = fs.readdirSync(artifactPath, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => path.join(artifactPath, d.name, 'intent_030_result.json'))
    possiblePaths.push(...subdirs)
  } catch (e) {
    // Ignore read errors
  }
  
  for (const resultPath of possiblePaths) {
    if (fs.existsSync(resultPath)) {
      try {
        const result = JSON.parse(fs.readFileSync(resultPath, 'utf-8'))
        
        if (result.intent_id === 'INTENT_030') {
          const response = {
            found: true,
            verdict: result.verdict,
            severity: result.severity,
            failed_check_id: result.failure_payload?.check_id || result.failed_at,
            report_path: result.report_path || resultPath.replace('_result.json', '_report.md'),
          }
          
          // Determine exit code based on severity
          if (result.verdict === 'VERIFIED_OK') {
            response.exitCode = 0
          } else if (result.severity === 'HIGH') {
            response.exitCode = 1 // Blocking failure
          } else if (result.severity === 'MEDIUM') {
            response.exitCode = 2 // Warning, re-run required
          } else {
            response.exitCode = 1 // Default to fail if severity unknown
          }
          
          return response
        }
      } catch (e) {
        // Ignore parse errors
      }
    }
  }
  
  return { found: false }
}

/**
 * Check for INTENT_040 settings sanity result and determine exit code
 * 
 * @param {string} artifactPath - Path to the artifact directory
 * @returns {{ found: boolean, verdict?: string, severity?: string, failed_check_id?: string, report_path?: string, exitCode?: number }}
 */
function checkIntent040Result(artifactPath) {
  if (!artifactPath) return { found: false }
  
  // Search for intent_040_result.json in artifact directory and subdirectories
  const possiblePaths = [
    path.join(artifactPath, 'intent_040_result.json'),
  ]
  
  // Also search subdirectories
  try {
    const subdirs = fs.readdirSync(artifactPath, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => path.join(artifactPath, d.name, 'intent_040_result.json'))
    possiblePaths.push(...subdirs)
  } catch (e) {
    // Ignore read errors
  }
  
  for (const resultPath of possiblePaths) {
    if (fs.existsSync(resultPath)) {
      try {
        const result = JSON.parse(fs.readFileSync(resultPath, 'utf-8'))
        
        if (result.intent_id === 'INTENT_040') {
          const response = {
            found: true,
            verdict: result.verdict,
            severity: result.severity,
            failed_check_id: result.failure_payload?.check_id || result.failed_at,
            report_path: result.report_path || resultPath.replace('_result.json', '_report.md'),
          }
          
          // Determine exit code based on severity
          if (result.verdict === 'VERIFIED_OK') {
            response.exitCode = 0
          } else if (result.severity === 'HIGH') {
            response.exitCode = 1 // Blocking failure
          } else if (result.severity === 'MEDIUM') {
            response.exitCode = 2 // Warning, re-run required
          } else {
            response.exitCode = 1 // Default to fail if severity unknown
          }
          
          return response
        }
      } catch (e) {
        // Ignore parse errors
      }
    }
  }
  
  return { found: false }
}

/**
 * Print INTENT_010 summary to terminal
 */
function printIntent010Summary(intent010Result) {
  console.log('')
  console.log('┌──────────────────────────────────────────────────────────────┐')
  console.log('│  INTENT_010 — Usability Gate                                 │')
  console.log('└──────────────────────────────────────────────────────────────┘')
  console.log('')
  
  if (intent010Result.verdict === 'VERIFIED_OK') {
    console.log('  ✅ USABILITY: PASS')
    console.log('     All layout and usability checks passed.')
  } else {
    const severityEmoji = intent010Result.severity === 'HIGH' ? '🔴' : '🟡'
    console.log(`  ❌ USABILITY: FAIL`)
    console.log(`     Severity: ${severityEmoji} ${intent010Result.severity}`)
    console.log(`     Failed Check: ${intent010Result.failed_check_id}`)
    console.log('')
    console.log(`  📝 Report: ${intent010Result.report_path}`)
  }
  
  console.log('')
}

/**
 * Print INTENT_020 summary to terminal
 */
function printIntent020Summary(intent020Result) {
  console.log('')
  console.log('┌──────────────────────────────────────────────────────────────┐')
  console.log('│  INTENT_020 — Accessibility Gate                             │')
  console.log('└──────────────────────────────────────────────────────────────┘')
  console.log('')
  
  if (intent020Result.verdict === 'VERIFIED_OK') {
    console.log('  ✅ ACCESSIBILITY: PASS')
    console.log('     All accessibility and interaction checks passed.')
  } else {
    const severityEmoji = intent020Result.severity === 'HIGH' ? '🔴' : '🟡'
    console.log(`  ❌ ACCESSIBILITY: FAIL`)
    console.log(`     Severity: ${severityEmoji} ${intent020Result.severity}`)
    console.log(`     Failed Check: ${intent020Result.failed_check_id}`)
    console.log('')
    console.log(`  📝 Report: ${intent020Result.report_path}`)
  }
  
  console.log('')
}

/**
 * Print INTENT_030 summary to terminal
 */
function printIntent030Summary(intent030Result) {
  console.log('')
  console.log('┌──────────────────────────────────────────────────────────────┐')
  console.log('│  INTENT_030 — State Integrity Gate                          │')
  console.log('└──────────────────────────────────────────────────────────────┘')
  console.log('')
  
  if (intent030Result.verdict === 'VERIFIED_OK') {
    console.log('  ✅ STATE INTEGRITY: PASS')
    console.log('     All state and store integrity checks passed.')
  } else {
    const severityEmoji = intent030Result.severity === 'HIGH' ? '🔴' : '🟡'
    console.log(`  ❌ STATE INTEGRITY: FAIL`)
    console.log(`     Severity: ${severityEmoji} ${intent030Result.severity}`)
    console.log(`     Failed Check: ${intent030Result.failed_check_id}`)
    console.log('')
    console.log(`  📝 Report: ${intent030Result.report_path}`)
  }
  
  console.log('')
}

/**
 * Print INTENT_040 summary to terminal
 */
function printIntent040Summary(intent040Result) {
  console.log('')
  console.log('┌──────────────────────────────────────────────────────────────┐')
  console.log('│  INTENT_040 — Settings Panel Sanity                         │')
  console.log('└──────────────────────────────────────────────────────────────┘')
  console.log('')
  
  if (intent040Result.verdict === 'VERIFIED_OK') {
    console.log('  ✅ SETTINGS SANITY: PASS')
    console.log('     Settings panel structural safety verified.')
  } else {
    const severityEmoji = intent040Result.severity === 'HIGH' ? '🔴' : '🟡'
    console.log(`  ❌ SETTINGS SANITY: FAIL`)
    console.log(`     Severity: ${severityEmoji} ${intent040Result.severity}`)
    console.log(`     Failed Check: ${intent040Result.failed_check_id}`)
    console.log('')
    console.log(`  📝 Report: ${intent040Result.report_path}`)
  }
  
  console.log('')
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
    intentId: null, // Add intentId support
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
      case '--intent':
        options.intentId = args[++i]
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
  
  // Create QC output directory (required for mock output directory selection)
  const qcOutputDir = '/tmp/qc_output'
  if (!fs.existsSync(qcOutputDir)) {
    fs.mkdirSync(qcOutputDir, { recursive: true })
    console.log(`  ✓ Created QC output directory: ${qcOutputDir}`)
  } else {
    console.log(`  ✓ QC output directory exists: ${qcOutputDir}`)
  }
  
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
  if (options.intentId) {
    console.log(`    Intent ID: ${options.intentId}`)
  }
  console.log('')
  
  let artifactPath = options.artifactPath
  let glmReportPath = null
  
  // PHASE 1: Execution
  if (!options.skipExecution) {
    printBanner('PHASE 1 — EXECUTION')
    
    if (options.dryRun) {
      console.log('  [DRY RUN] Would run: scripts/qc/run_visual_qc.mjs')
    } else {
      // Build args for run_visual_qc.mjs
      const phase1Args = []
      if (options.intentId) {
        phase1Args.push('--intent', options.intentId)
      }
      
      const phase1 = await runPhase(
        path.join(__dirname, 'run_visual_qc.mjs'),
        phase1Args,
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
  
  // Check for INTENT_010 usability result (takes precedence)
  const intent010Result = checkIntent010Result(artifactPath)
  
  if (intent010Result.found) {
    printIntent010Summary(intent010Result)
    
    // If INTENT_010 failed, it takes precedence over other QC decisions
    if (intent010Result.verdict !== 'VERIFIED_OK') {
      const decision = {
        classification: 'VERIFIED_NOT_OK',
        source: 'INTENT_010',
        severity: intent010Result.severity,
        failed_check: intent010Result.failed_check_id,
        report_path: intent010Result.report_path,
        artifactPath,
        timestamp: new Date().toISOString(),
        exitCode: intent010Result.exitCode,
      }
      
      // Write decision
      if (!options.dryRun && artifactPath) {
        const decisionPath = path.join(artifactPath, 'qc_decision.json')
        fs.writeFileSync(decisionPath, JSON.stringify(decision, null, 2))
        console.log(`  Decision written to: ${decisionPath}`)
      }
      
      console.log('')
      console.log('═══════════════════════════════════════════════════════════════')
      console.log(`  QC LOOP COMPLETE — Exit Code: ${decision.exitCode}`)
      if (intent010Result.severity === 'HIGH') {
        console.log('  ⛔ BLOCKING: HIGH severity usability failure')
      } else {
        console.log('  ⚠️  WARNING: MEDIUM severity usability failure')
      }
      console.log('═══════════════════════════════════════════════════════════════')
      console.log('')
      
      // Stop backend before exit
      await stopBackend()
      
      process.exit(decision.exitCode)
    }
  }
  
  // Check for INTENT_020 accessibility result (also takes precedence)
  const intent020Result = checkIntent020Result(artifactPath)
  
  if (intent020Result.found) {
    printIntent020Summary(intent020Result)
    
    // If INTENT_020 failed, it takes precedence over other QC decisions
    if (intent020Result.verdict !== 'VERIFIED_OK') {
      const decision = {
        classification: 'VERIFIED_NOT_OK',
        source: 'INTENT_020',
        severity: intent020Result.severity,
        failed_check: intent020Result.failed_check_id,
        report_path: intent020Result.report_path,
        artifactPath,
        timestamp: new Date().toISOString(),
        exitCode: intent020Result.exitCode,
      }
      
      // Write decision
      if (!options.dryRun && artifactPath) {
        const decisionPath = path.join(artifactPath, 'qc_decision.json')
        fs.writeFileSync(decisionPath, JSON.stringify(decision, null, 2))
        console.log(`  Decision written to: ${decisionPath}`)
      }
      
      console.log('')
      console.log('═══════════════════════════════════════════════════════════════')
      console.log(`  QC LOOP COMPLETE — Exit Code: ${decision.exitCode}`)
      if (intent020Result.severity === 'HIGH') {
        console.log('  ⛔ BLOCKING: HIGH severity accessibility failure')
      } else {
        console.log('  ⚠️  WARNING: MEDIUM severity accessibility failure')
      }
      console.log('═══════════════════════════════════════════════════════════════')
      console.log('')
      
      // Stop backend before exit
      await stopBackend()
      
      process.exit(decision.exitCode)
    }
  }
  
  // Check for INTENT_030 state integrity result (also takes precedence)
  const intent030Result = checkIntent030Result(artifactPath)
  
  if (intent030Result.found) {
    printIntent030Summary(intent030Result)
    
    // If INTENT_030 failed, it takes precedence over other QC decisions
    if (intent030Result.verdict !== 'VERIFIED_OK') {
      const decision = {
        classification: 'VERIFIED_NOT_OK',
        source: 'INTENT_030',
        severity: intent030Result.severity,
        failed_check: intent030Result.failed_check_id,
        report_path: intent030Result.report_path,
        artifactPath,
        timestamp: new Date().toISOString(),
        exitCode: intent030Result.exitCode,
      }
      
      // Write decision
      if (!options.dryRun && artifactPath) {
        const decisionPath = path.join(artifactPath, 'qc_decision.json')
        fs.writeFileSync(decisionPath, JSON.stringify(decision, null, 2))
        console.log(`  Decision written to: ${decisionPath}`)
      }
      
      console.log('')
      console.log('═══════════════════════════════════════════════════════════════')
      console.log(`  QC LOOP COMPLETE — Exit Code: ${decision.exitCode}`)
      if (intent030Result.severity === 'HIGH') {
        console.log('  ⛔ BLOCKING: HIGH severity state integrity failure')
      } else {
        console.log('  ⚠️  WARNING: MEDIUM severity state integrity failure')
      }
      console.log('═══════════════════════════════════════════════════════════════')
      console.log('')
      
      // Stop backend before exit
      await stopBackend()
      
      process.exit(decision.exitCode)
    }
  }
  
  // Check for INTENT_040 settings sanity result (also takes precedence)
  const intent040Result = checkIntent040Result(artifactPath)
  
  if (intent040Result.found) {
    printIntent040Summary(intent040Result)
    
    // If INTENT_040 failed, it takes precedence over other QC decisions
    if (intent040Result.verdict !== 'VERIFIED_OK') {
      const decision = {
        classification: 'VERIFIED_NOT_OK',
        source: 'INTENT_040',
        severity: intent040Result.severity,
        failed_check: intent040Result.failed_check_id,
        report_path: intent040Result.report_path,
        artifactPath,
        timestamp: new Date().toISOString(),
        exitCode: intent040Result.exitCode,
      }
      
      // Write decision
      if (!options.dryRun && artifactPath) {
        const decisionPath = path.join(artifactPath, 'qc_decision.json')
        fs.writeFileSync(decisionPath, JSON.stringify(decision, null, 2))
        console.log(`  Decision written to: ${decisionPath}`)
      }
      
      console.log('')
      console.log('═══════════════════════════════════════════════════════════════')
      console.log(`  QC LOOP COMPLETE — Exit Code: ${decision.exitCode}`)
      if (intent040Result.severity === 'HIGH') {
        console.log('  ⛔ BLOCKING: HIGH severity settings sanity failure')
      } else {
        console.log('  ⚠️  WARNING: MEDIUM severity settings sanity failure')
      }
      console.log('═══════════════════════════════════════════════════════════════')
      console.log('')
      
      // Stop backend before exit
      await stopBackend()
      
      process.exit(decision.exitCode)
    }
  }
  
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
  
  // Generate consolidated QC_SUMMARY.md
  if (artifactPath) {
    try {
      const { generateQCSummary, printQCSummary } = await import('./generate_qc_summary.mjs')
      const { summaryPath, data } = generateQCSummary(artifactPath)
      
      console.log('')
      printQCSummary(data)
      console.log(`  📝 QC Summary: ${summaryPath}`)
    } catch (err) {
      console.error(`  ⚠️  Could not generate QC summary: ${err.message}`)
    }
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
