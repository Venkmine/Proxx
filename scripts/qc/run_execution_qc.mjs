#!/usr/bin/env node
/**
 * Execution QC Runner — INTENT_006
 * 
 * Headless job execution validation.
 * No Electron. No Playwright. No UI.
 * 
 * This validates the execution pipeline:
 * - FFmpeg invocation
 * - Output file generation
 * - Job completion semantics
 * 
 * CONTRACT BOUNDARY:
 * - UI QC ends at system_queues_job
 * - Execution QC starts at system_processes_job
 * - This script validates INTENT_006 only
 * 
 * RULES:
 * - No mocks
 * - No retries
 * - No GLM
 * - Fail fast
 */

import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const projectRoot = path.resolve(__dirname, '../..')

// =============================================================================
// EXECUTION EVIDENCE SCHEMA
// =============================================================================
// Evidence required to verify job execution:
// 1. output_exists: boolean — Output file was created
// 2. output_size_bytes: number — File size > 0
// 3. output_duration_seconds: number — Media duration > 0
// 4. exit_code: number — FFmpeg exit code (0 = success)
// 5. error_propagated: boolean — Errors surfaced correctly
// =============================================================================

/**
 * @typedef {Object} ExecutionEvidence
 * @property {boolean} output_exists - Output file was created
 * @property {number|null} output_size_bytes - File size in bytes
 * @property {number|null} output_duration_seconds - Media duration
 * @property {number} exit_code - Process exit code
 * @property {boolean} error_propagated - Errors surfaced correctly
 * @property {string|null} error_message - Error message if failed
 */

/**
 * @typedef {Object} ExecutionQCResult
 * @property {string} intent_id - Always "INTENT_006"
 * @property {boolean} success - Overall pass/fail
 * @property {string} job_id - Job ID that was executed
 * @property {ExecutionEvidence} evidence - Execution evidence
 * @property {string} started_at - ISO timestamp
 * @property {string} completed_at - ISO timestamp
 * @property {number} duration_ms - Total execution time
 */

// =============================================================================
// TEST FIXTURES
// =============================================================================

const FIXTURES = {
  single_proxy: {
    name: 'Single Proxy Generation',
    source: path.join(projectRoot, 'artifacts/v2/20251228T160555/v2_smoke_v2_smoke_test_000.mp4'),
    output_dir: '/tmp/execution_qc_output',
    codec: 'prores_proxy',
    container: 'mov',
    resolution: 'half',
    expected_duration_min: 0.5, // At least 0.5 seconds
  },
}

// =============================================================================
// CORE EXECUTION
// =============================================================================

/**
 * Run ffprobe to get media duration
 * @param {string} filePath 
 * @returns {Promise<number|null>}
 */
async function getMediaDuration(filePath) {
  return new Promise((resolve) => {
    const proc = spawn('ffprobe', [
      '-v', 'quiet',
      '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1',
      filePath
    ])
    
    let stdout = ''
    proc.stdout.on('data', (data) => { stdout += data.toString() })
    
    proc.on('close', (code) => {
      if (code === 0 && stdout.trim()) {
        const duration = parseFloat(stdout.trim())
        resolve(isNaN(duration) ? null : duration)
      } else {
        resolve(null)
      }
    })
    
    proc.on('error', () => resolve(null))
  })
}

/**
 * Execute a JobSpec via Python backend (headless)
 * @param {Object} jobSpec 
 * @returns {Promise<{exit_code: number, stdout: string, stderr: string, result: Object|null}>}
 */
async function executeJobSpec(jobSpec) {
  const jobSpecPath = '/tmp/execution_qc_jobspec.json'
  fs.writeFileSync(jobSpecPath, JSON.stringify(jobSpec, null, 2))
  
  return new Promise((resolve) => {
    const proc = spawn('python', [
      '-m', 'backend.headless_execute',
      jobSpecPath
    ], {
      cwd: projectRoot,
      env: {
        ...process.env,
        PYTHONPATH: projectRoot,
      }
    })
    
    let stdout = ''
    let stderr = ''
    
    proc.stdout.on('data', (data) => { stdout += data.toString() })
    proc.stderr.on('data', (data) => { stderr += data.toString() })
    
    proc.on('close', (exit_code) => {
      let result = null
      try {
        // Try to parse JSON result from stdout
        const jsonMatch = stdout.match(/\{[\s\S]*"job_id"[\s\S]*\}/)
        if (jsonMatch) {
          result = JSON.parse(jsonMatch[0])
        }
      } catch (e) {
        // JSON parsing failed
      }
      
      resolve({ exit_code, stdout, stderr, result })
    })
    
    proc.on('error', (err) => {
      resolve({
        exit_code: 1,
        stdout: '',
        stderr: err.message,
        result: null
      })
    })
  })
}

/**
 * Build a JobSpec from fixture configuration
 * @param {Object} fixture 
 * @returns {Object}
 */
function buildJobSpec(fixture) {
  const jobId = `exec_qc_${Date.now()}`
  
  return {
    job_id: jobId,
    sources: [fixture.source],
    output_directory: fixture.output_dir,
    codec: fixture.codec,
    container: fixture.container,
    resolution: fixture.resolution,
    naming_template: '{source_name}_exec_qc',
    created_at: new Date().toISOString(),
  }
}

/**
 * Validate execution evidence against requirements
 * @param {ExecutionEvidence} evidence 
 * @param {Object} fixture 
 * @returns {{valid: boolean, failures: string[]}}
 */
function validateEvidence(evidence, fixture) {
  const failures = []
  
  // 1. Output must exist
  if (!evidence.output_exists) {
    failures.push('Output file does not exist')
  }
  
  // 2. Output must have size > 0
  if (evidence.output_size_bytes === null || evidence.output_size_bytes <= 0) {
    failures.push(`Output file size invalid: ${evidence.output_size_bytes} bytes`)
  }
  
  // 3. Output must have duration
  if (evidence.output_duration_seconds === null || evidence.output_duration_seconds < fixture.expected_duration_min) {
    failures.push(`Output duration invalid: ${evidence.output_duration_seconds}s (min: ${fixture.expected_duration_min}s)`)
  }
  
  // 4. Exit code must be 0
  if (evidence.exit_code !== 0) {
    failures.push(`Non-zero exit code: ${evidence.exit_code}`)
  }
  
  return {
    valid: failures.length === 0,
    failures
  }
}

/**
 * Run Execution QC for a specific fixture
 * @param {string} fixtureName 
 * @returns {Promise<ExecutionQCResult>}
 */
async function runExecutionQC(fixtureName) {
  const fixture = FIXTURES[fixtureName]
  if (!fixture) {
    throw new Error(`Unknown fixture: ${fixtureName}. Available: ${Object.keys(FIXTURES).join(', ')}`)
  }
  
  const startedAt = new Date()
  console.log(`\n${'━'.repeat(60)}`)
  console.log(`🔧 EXECUTION QC: INTENT_006`)
  console.log(`${'━'.repeat(60)}`)
  console.log(`Fixture: ${fixture.name}`)
  console.log(`Source: ${fixture.source}`)
  console.log(`Started: ${startedAt.toISOString()}`)
  console.log(`${'━'.repeat(60)}\n`)
  
  // Validate source exists
  if (!fs.existsSync(fixture.source)) {
    const evidence = {
      output_exists: false,
      output_size_bytes: null,
      output_duration_seconds: null,
      exit_code: 1,
      error_propagated: true,
      error_message: `Source file not found: ${fixture.source}`
    }
    
    return {
      intent_id: 'INTENT_006',
      success: false,
      job_id: 'N/A',
      evidence,
      started_at: startedAt.toISOString(),
      completed_at: new Date().toISOString(),
      duration_ms: Date.now() - startedAt.getTime(),
    }
  }
  
  // Prepare output directory
  if (fs.existsSync(fixture.output_dir)) {
    fs.rmSync(fixture.output_dir, { recursive: true })
  }
  fs.mkdirSync(fixture.output_dir, { recursive: true })
  
  // Build and execute JobSpec
  const jobSpec = buildJobSpec(fixture)
  console.log(`📋 JobSpec:`)
  console.log(`   job_id: ${jobSpec.job_id}`)
  console.log(`   codec: ${jobSpec.codec}`)
  console.log(`   container: ${jobSpec.container}`)
  console.log(`   resolution: ${jobSpec.resolution}\n`)
  
  console.log(`⚙️  Executing FFmpeg (headless)...`)
  const execResult = await executeJobSpec(jobSpec)
  
  console.log(`   Exit code: ${execResult.exit_code}`)
  
  // Collect evidence
  const expectedOutputName = path.basename(fixture.source, path.extname(fixture.source)) + '_exec_qc.' + fixture.container
  const expectedOutputPath = path.join(fixture.output_dir, expectedOutputName)
  
  const outputExists = fs.existsSync(expectedOutputPath)
  let outputSizeBytes = null
  let outputDurationSeconds = null
  
  if (outputExists) {
    const stats = fs.statSync(expectedOutputPath)
    outputSizeBytes = stats.size
    outputDurationSeconds = await getMediaDuration(expectedOutputPath)
  }
  
  const evidence = {
    output_exists: outputExists,
    output_size_bytes: outputSizeBytes,
    output_duration_seconds: outputDurationSeconds,
    exit_code: execResult.exit_code,
    error_propagated: execResult.exit_code !== 0 ? execResult.stderr.length > 0 : true,
    error_message: execResult.exit_code !== 0 ? execResult.stderr.slice(0, 500) : null,
  }
  
  // Validate evidence
  const validation = validateEvidence(evidence, fixture)
  const completedAt = new Date()
  
  console.log(`\n📊 Evidence:`)
  console.log(`   Output exists: ${evidence.output_exists}`)
  console.log(`   Output size: ${evidence.output_size_bytes} bytes`)
  console.log(`   Output duration: ${evidence.output_duration_seconds}s`)
  console.log(`   Exit code: ${evidence.exit_code}`)
  console.log(`   Error propagated: ${evidence.error_propagated}`)
  
  if (!validation.valid) {
    console.log(`\n❌ VALIDATION FAILURES:`)
    for (const failure of validation.failures) {
      console.log(`   • ${failure}`)
    }
  }
  
  const result = {
    intent_id: 'INTENT_006',
    success: validation.valid,
    job_id: jobSpec.job_id,
    evidence,
    validation_failures: validation.failures,
    started_at: startedAt.toISOString(),
    completed_at: completedAt.toISOString(),
    duration_ms: completedAt.getTime() - startedAt.getTime(),
  }
  
  console.log(`\n${'━'.repeat(60)}`)
  if (result.success) {
    console.log(`✅ EXECUTION QC PASSED: INTENT_006`)
  } else {
    console.log(`❌ EXECUTION QC FAILED: INTENT_006`)
  }
  console.log(`   Duration: ${result.duration_ms}ms`)
  console.log(`${'━'.repeat(60)}\n`)
  
  return result
}

// =============================================================================
// CLI
// =============================================================================

async function main() {
  const args = process.argv.slice(2)
  
  // Parse arguments
  let fixtureName = 'single_proxy'
  let outputPath = null
  
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--fixture' && args[i + 1]) {
      fixtureName = args[i + 1]
      i++
    } else if (args[i] === '--output' && args[i + 1]) {
      outputPath = args[i + 1]
      i++
    } else if (args[i] === '--help') {
      console.log(`
Execution QC Runner — INTENT_006

Usage:
  node run_execution_qc.mjs [options]

Options:
  --fixture <name>   Fixture to run (default: single_proxy)
  --output <path>    Write result JSON to path
  --help             Show this help

Available Fixtures:
  single_proxy       Generate a single proxy file

Examples:
  node run_execution_qc.mjs --fixture single_proxy
  node run_execution_qc.mjs --output /tmp/exec_qc_result.json
`)
      process.exit(0)
    }
  }
  
  try {
    const result = await runExecutionQC(fixtureName)
    
    if (outputPath) {
      fs.writeFileSync(outputPath, JSON.stringify(result, null, 2))
      console.log(`📄 Result written to: ${outputPath}`)
    }
    
    process.exit(result.success ? 0 : 1)
  } catch (err) {
    console.error(`\n❌ EXECUTION QC ERROR: ${err.message}`)
    process.exit(2)
  }
}

main()
