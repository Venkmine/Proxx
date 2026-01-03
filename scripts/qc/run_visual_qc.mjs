#!/usr/bin/env node
/**
 * PHASE 1 — EXECUTION
 * 
 * Runs Playwright Electron visual tests and captures artifacts.
 * 
 * OUTPUT:
 * - Screenshots in artifacts/ui/visual/<timestamp>/
 * - DOM snapshots alongside screenshots
 * - Returns artifact path for downstream processing
 * 
 * EXIT CODES:
 * - 0 = Tests completed (may have failures)
 * - 1 = Execution error (Electron/Playwright failure)
 */

import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const projectRoot = path.resolve(__dirname, '../..')

/**
 * Generates ISO timestamp safe for filesystem
 */
function generateTimestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-')
}

/**
 * Ensures artifact directory exists and returns path
 */
function prepareArtifactDir(timestamp) {
  const artifactDir = path.join(projectRoot, 'artifacts/ui/visual', timestamp)
  fs.mkdirSync(artifactDir, { recursive: true })
  return artifactDir
}

/**
 * Runs Playwright tests for visual regression
 */
async function runPlaywrightVisualTests(artifactDir, timestamp) {
  return new Promise((resolve, reject) => {
    const testDir = path.join(projectRoot, 'qa/verify/ui/visual_regression')
    
    console.log('📸 Running Playwright visual regression tests...')
    console.log(`   Test directory: ${testDir}`)
    console.log(`   Artifact directory: ${artifactDir}`)
    
    const env = {
      ...process.env,
      VISUAL_QC_TIMESTAMP: timestamp,
      VISUAL_QC_ARTIFACT_DIR: artifactDir,
      E2E_TEST: 'true',
    }

    const child = spawn('npx', ['playwright', 'test'], {
      cwd: testDir,
      env,
      stdio: 'pipe',
    })

    let stdout = ''
    let stderr = ''

    child.stdout.on('data', (data) => {
      const text = data.toString()
      stdout += text
      process.stdout.write(text)
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
      })
    })

    child.on('error', (err) => {
      reject(err)
    })
  })
}

/**
 * Collects screenshot files from artifact directory
 * Also checks sibling timestamp directories created during test run
 */
function collectScreenshots(artifactDir, startTime) {
  const screenshots = []
  const visualDir = path.dirname(artifactDir)
  
  // Get all timestamp directories created after startTime
  const dirsToScan = [artifactDir]
  
  if (fs.existsSync(visualDir)) {
    const siblings = fs.readdirSync(visualDir, { withFileTypes: true })
      .filter(d => d.isDirectory() && /^\d{4}-\d{2}-\d{2}T/.test(d.name))
      .map(d => ({
        name: d.name,
        path: path.join(visualDir, d.name),
      }))
      .filter(d => {
        // Include directories created after our start time
        const dirTime = new Date(d.name.replace(/-/g, (m, i) => i < 10 ? '-' : i < 13 ? 'T' : i < 16 ? ':' : i < 19 ? ':' : '.').replace('T', 'T').slice(0, -1) + 'Z')
        return !isNaN(dirTime.getTime()) && dirTime >= startTime && d.path !== artifactDir
      })
    
    for (const sibling of siblings) {
      dirsToScan.push(sibling.path)
    }
  }
  
  function walk(dir, baseDir) {
    if (!fs.existsSync(dir)) return
    
    const entries = fs.readdirSync(dir, { withFileTypes: true })
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        walk(fullPath, baseDir)
      } else if (entry.name.endsWith('.png')) {
        screenshots.push({
          path: fullPath,
          relativePath: path.relative(baseDir, fullPath),
          sourceDir: baseDir,
          size: fs.statSync(fullPath).size,
        })
      }
    }
  }
  
  for (const dir of dirsToScan) {
    walk(dir, dir)
  }
  
  return screenshots
}

/**
 * Analyzes test failure to determine if it's splash-related
 * Returns true if failure indicates splash screen timeout/visibility
 */
function isSplashRelatedFailure(stderr, stdout) {
  const combinedOutput = (stdout + '\n' + stderr).toLowerCase()
  
  // Check for splash-related error messages from assertNoSplashBeforeCapture
  if (combinedOutput.includes('pre-capture gate failed')) return true
  if (combinedOutput.includes('splash screen is still visible')) return true
  if (combinedOutput.includes('splash_only.png')) return true
  
  // Check for waitForAppReady timeout from page fixture
  if (combinedOutput.includes('splash dismissal timeout')) return true
  if (combinedOutput.includes('timeout: 30000ms exceeded')) {
    // Only if related to splash detection
    if (combinedOutput.includes('data-testid="splash-screen"')) return true
    if (combinedOutput.includes('waitforfunction')) return true
  }
  
  return false
}

/**
 * Writes execution metadata
 */
function writeExecutionMetadata(artifactDir, timestamp, testResult, screenshots, isSplashFailure = false) {
  const metadata = {
    version: '1.0.0',
    phase: 'EXECUTION',
    timestamp,
    artifactDir,
    testResult: {
      exitCode: testResult.exitCode,
      passed: testResult.exitCode === 0,
      splashFailure: isSplashFailure,
    },
    qcInvalid: isSplashFailure,
    screenshots: screenshots.map(s => ({
      relativePath: s.relativePath,
      size: s.size,
    })),
    executedAt: new Date().toISOString(),
  }
  
  const metadataPath = path.join(artifactDir, 'execution_metadata.json')
  fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2))
  console.log(`📝 Execution metadata written to: ${metadataPath}`)
  
  return metadata
}

/**
 * Main execution
 */
async function main() {
  const startTime = new Date()
  const timestamp = generateTimestamp()
  console.log('═══════════════════════════════════════════════════════════════')
  console.log('  PHASE 1 — EXECUTION: Visual QC Test Runner')
  console.log('═══════════════════════════════════════════════════════════════')
  console.log(`  Timestamp: ${timestamp}`)
  console.log('')
  
  try {
    const artifactDir = prepareArtifactDir(timestamp)
    
    // Run Playwright visual tests
    const testResult = await runPlaywrightVisualTests(artifactDir, timestamp)
    
    // Collect screenshots (including from sibling dirs created during tests)
    const screenshots = collectScreenshots(artifactDir, startTime)
    console.log('')
    console.log(`📸 Collected ${screenshots.length} screenshot(s)`)
    
    // Check if failure was splash-related
    const isSplashFailure = isSplashRelatedFailure(testResult.stderr, testResult.stdout)
    
    if (isSplashFailure) {
      console.log('')
      console.log('⚠️⚠️⚠️  SPLASH-RELATED FAILURE DETECTED  ⚠️⚠️⚠️')
      console.log('')
      console.log('The test failed because the splash screen did not dismiss within the timeout.')
      console.log('This invalidates the QC run because:')
      console.log('  1. Screenshots taken with splash visible cannot be visually interpreted')
      console.log('  2. GLM-4.6V cannot determine if splash "should" be visible')
      console.log('  3. Visual QC requires ACTUAL application UI, not startup states')
      console.log('')
      console.log('Possible causes:')
      console.log('  - Application startup is too slow (>30 seconds)')
      console.log('  - Splash dismissal logic is broken')
      console.log('  - Backend/dependencies not available')
      console.log('')
      console.log('Check for SPLASH_ONLY.png in the artifact directory for evidence.')
      console.log('')
      
      // Mark as QC_INVALID
      const metadata = writeExecutionMetadata(artifactDir, timestamp, testResult, screenshots, true)
      
      const output = {
        artifactPath: artifactDir,
        timestamp,
        screenshotCount: screenshots.length,
        testPassed: false,
        qcInvalid: true,
        splashFailure: true,
      }
      
      const outputPath = path.join(artifactDir, 'phase1_output.json')
      fs.writeFileSync(outputPath, JSON.stringify(output, null, 2))
      console.log('OUTPUT_JSON:' + JSON.stringify(output))
      
      // Exit with QC_INVALID code
      process.exit(2)
    }
    
    if (screenshots.length === 0) {
      console.warn('⚠️  No screenshots captured. Check test execution.')
    } else {
      // Copy screenshots from sibling directories to main artifact dir
      for (const screenshot of screenshots) {
        if (screenshot.sourceDir !== artifactDir) {
          const targetDir = path.join(artifactDir, path.dirname(screenshot.relativePath))
          const targetPath = path.join(artifactDir, screenshot.relativePath)
          fs.mkdirSync(targetDir, { recursive: true })
          fs.copyFileSync(screenshot.path, targetPath)
          console.log(`  📋 Copied: ${screenshot.relativePath}`)
        }
      }
    }
    
    // Write metadata
    const metadata = writeExecutionMetadata(artifactDir, timestamp, testResult, screenshots)
    
    // Output artifact path for downstream use
    console.log('')
    console.log('═══════════════════════════════════════════════════════════════')
    console.log('  EXECUTION COMPLETE')
    console.log('═══════════════════════════════════════════════════════════════')
    console.log(`  Artifact Path: ${artifactDir}`)
    console.log(`  Screenshots: ${screenshots.length}`)
    console.log(`  Test Exit Code: ${testResult.exitCode}`)
    console.log('')
    
    // Write artifact path to stdout for piping
    // Format: JSON line that can be parsed by downstream scripts
    const output = {
      artifactPath: artifactDir,
      timestamp,
      screenshotCount: screenshots.length,
      testPassed: testResult.exitCode === 0,
    }
    
    // Write to a well-known location for the orchestrator
    const outputPath = path.join(artifactDir, 'phase1_output.json')
    fs.writeFileSync(outputPath, JSON.stringify(output, null, 2))
    
    // Also echo to stdout for piping
    console.log('OUTPUT_JSON:' + JSON.stringify(output))
    
    // Exit with test exit code
    process.exit(testResult.exitCode === 0 ? 0 : 1)
    
  } catch (error) {
    console.error('❌ Execution failed:', error.message)
    process.exit(1)
  }
}

main()
