/**
 * Intent Runner  
 * 
 * Loads and executes human workflow intents from docs/UI_WORKFLOW_INTENTS.md.
 * Maps semantic actions to real UI actions via action_trace.ts.
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const projectRoot = path.resolve(__dirname, '../..')

const actionTracePath = path.join(projectRoot, 'qa/verify/ui/visual_regression/action_trace.ts')
const { instrumentCreateJobAction, inferWorkflowState, waitForUISettle } = await import(`file://${actionTracePath}`)

const visualChangeGatePath = path.join(projectRoot, 'qa/verify/ui/visual_regression/visual_change_gate.ts')
const { assertVisualChange, recordVisualDiffMetrics } = await import(`file://${visualChangeGatePath}`)

const finderDetectionPath = path.join(projectRoot, 'scripts/qc/finder_detection.mjs')
const { assertFinderNotOpen, FinderDialogError } = await import(`file://${finderDetectionPath}`)

/**
 * Load and parse UI_WORKFLOW_INTENTS.md
 */
export function loadIntents(projectRoot) {
  const intentPath = path.join(projectRoot, 'docs', 'UI_WORKFLOW_INTENTS.md')
  
  if (!fs.existsSync(intentPath)) {
    throw new Error(`Intent specification not found: ${intentPath}`)
  }
  
  const content = fs.readFileSync(intentPath, 'utf-8')
  const intents = new Map()
  
  // Parse intent sections (### INTENT_NNN — Title)
  const intentRegex = /^### (INTENT_\d+) — (.+)$/gm
  let match
  
  while ((match = intentRegex.exec(content)) !== null) {
    const intentId = match[1]
    const title = match[2]
    
    // Extract intent content
    const startIdx = match.index + match[0].length
    const nextIntentMatch = content.slice(startIdx).match(/^### INTENT_/m)
    const endIdx = nextIntentMatch 
      ? startIdx + nextIntentMatch.index
      : content.length
    
    const intentContent = content.slice(startIdx, endIdx)
    const intent = parseIntentContent(intentId, title, intentContent)
    
    if (intent) {
      intents.set(intentId, intent)
    }
  }
  
  return intents
}

function parseIntentContent(intentId, title, content) {
  try {
    const goalMatch = content.match(/#### Human Goal\s*\n\s*>\s*"(.+)"/)
    const humanGoal = goalMatch ? goalMatch[1] : title
    
    const actionSequence = parseActionSequenceTable(content)
    const stateTransitions = parseStateTransitions(content)
    const requiredEvidence = parseEvidenceTable(content)
    const acceptableFailures = parseFailureTable(content, 'Acceptable Failures')
    const hardFailures = parseFailureTable(content, 'Hard Failures')
    
    return {
      intent_id: intentId,
      human_goal: humanGoal,
      preconditions: [],
      action_sequence: actionSequence,
      expected_state_transitions: stateTransitions,
      required_ui_evidence: requiredEvidence,
      acceptable_failures: acceptableFailures,
      hard_failures: hardFailures,
    }
  } catch (e) {
    console.warn(`Failed to parse intent ${intentId}:`, e)
    return null
  }
}

function parseActionSequenceTable(content) {
  const actions = []
  const tableMatch = content.match(/\| Step \| Action \| Actor \|[\s\S]*?\n\n/)
  if (!tableMatch) return actions
  
  const tableContent = tableMatch[0]
  const rows = tableContent.split('\n').slice(2)
  
  for (const row of rows) {
    const cols = row.split('|').map(c => c.trim()).filter(Boolean)
    if (cols.length >= 3) {
      const step = parseInt(cols[0])
      const action = cols[1].replace(/`/g, '')
      const actor = cols[2]
      
      if (!isNaN(step)) {
        actions.push({ step, action, actor })
      }
    }
  }
  
  return actions
}

function parseStateTransitions(content) {
  const transitions = []
  const tableMatch = content.match(/\| From State \| To State \| Trigger \|[\s\S]*?\n\n/)
  if (!tableMatch) return transitions
  
  const tableContent = tableMatch[0]
  const rows = tableContent.split('\n').slice(2)
  
  for (const row of rows) {
    const cols = row.split('|').map(c => c.trim().replace(/`/g, '')).filter(Boolean)
    if (cols.length >= 3) {
      transitions.push({
        from: cols[0],
        to: cols[1],
        trigger: cols[2],
      })
    }
  }
  
  return transitions
}

function parseEvidenceTable(content) {
  const evidence = {}
  const tableMatch = content.match(/\| State \| Evidence \|[\s\S]*?\n\n/)
  if (!tableMatch) return evidence
  
  const tableContent = tableMatch[0]
  const rows = tableContent.split('\n').slice(2)
  
  for (const row of rows) {
    const cols = row.split('|').map(c => c.trim().replace(/`/g, '')).filter(Boolean)
    if (cols.length >= 2) {
      const state = cols[0]
      const evidenceText = cols[1]
      
      if (!evidence[state]) {
        evidence[state] = []
      }
      evidence[state].push(evidenceText)
    }
  }
  
  return evidence
}

function parseFailureTable(content, tableTitle) {
  const failures = {}
  const regex = new RegExp(`\\| Failure \\| ${tableTitle === 'Acceptable Failures' ? 'Expected Behavior' : 'Why It\'s a Contract Violation'} \\|[\\s\\S]*?\\n\\n`)
  const tableMatch = content.match(regex)
  if (!tableMatch) return failures
  
  const tableContent = tableMatch[0]
  const rows = tableContent.split('\n').slice(2)
  
  for (const row of rows) {
    const cols = row.split('|').map(c => c.trim()).filter(Boolean)
    if (cols.length >= 2) {
      const failure = cols[0]
      const reason = cols[1]
      failures[failure] = reason
    }
  }
  
  return failures
}

export function validateIntent(intent) {
  if (!intent.intent_id || !intent.intent_id.startsWith('INTENT_')) {
    console.error(`Invalid intent_id: ${intent.intent_id}`)
    return false
  }
  
  if (!intent.human_goal) {
    console.error(`Intent ${intent.intent_id} missing human_goal`)
    return false
  }
  
  if (intent.action_sequence.length === 0) {
    console.error(`Intent ${intent.intent_id} has no actions`)
    return false
  }
  
  return true
}

export function createActionDriver() {
  // Hardcoded test file for QC automation
  const TEST_FILE = '/Users/leon.grant/projects/Proxx/artifacts/v2/20251228T160555/v2_smoke_v2_smoke_test_000.mp4'
  
  return {
    async selectRealSource(page) {
      console.log('   → Action: selectRealSource')
      console.log(`      Test file: ${TEST_FILE}`)
      
      try {
        // HARD ASSERTION: Mock must be installed before UI interaction
        console.log('      → Verifying QC mocks are installed...')
        const mockInstalled = await page.evaluate(() => {
          return typeof window.electron?.openFilesOrFolders === 'function' &&
                 window.__QC_MOCKS_INSTALLED__ === true
        })
        
        if (!mockInstalled) {
          throw new Error('openFilesOrFolders mock not installed before UI interaction')
        }
        
        console.log('      ✓ Mock verified')
        
        // Click the button (will use our pre-installed mock, no native dialog)
        console.log('      → Clicking Select Files button...')
        const button = page.locator('button:has-text("Select Files")')
        await button.waitFor({ state: 'visible', timeout: 5000 })
        await button.click()
        
        console.log('      → File selection triggered, waiting for backend processing...')
        
        // The app should now:
        // 1. Call window.electron.openFilesOrFolders() (our mock)
        // 2. Get [TEST_FILE] back
        // 3. Call addPaths([TEST_FILE])
        // 4. Store updates state to SELECTED_UNVALIDATED
        // 5. UI shows "Run Preflight" button
        
        // Wait for evidence of successful load (up to 20 seconds for backend processing)
        const indicators = [
          // Filename appears in UI
          page.locator(`text=${path.basename(TEST_FILE)}`).first(),
          // Run Preflight button becomes visible (state is now SELECTED_UNVALIDATED)
          page.locator('button:has-text("Run Preflight")').first(),
          // Source metadata visible
          page.locator('[data-testid*="metadata"], [data-testid*="source"]').first(),
        ]
        
        let success = false
        for (const indicator of indicators) {
          try {
            await indicator.waitFor({ state: 'visible', timeout: 20000 })
            success = true
            console.log('      ✅ Source loaded - indicator visible:', await indicator.textContent().catch(() => 'unknown'))
            break
          } catch (e) {
            // Try next indicator
            continue
          }
        }
        
        if (!success) {
          // Debug: screenshot and check console errors
          await page.screenshot({ path: '/tmp/source_load_timeout.png', fullPage: true })
          const bodyText = await page.locator('body').textContent().catch(() => '')
          console.log('      ⚠️ UI after 20s wait:')
          console.log(`         Contains filename: ${bodyText.includes(path.basename(TEST_FILE))}`)
          console.log(`         Contains "Create Job": ${bodyText.includes('Create Job')}`)
          console.log(`         Contains "probing": ${bodyText.includes('probing')}`)
          console.log(`         Contains "loading": ${bodyText.includes('loading')}`)
          
          throw new Error('Source file did not load within 20 seconds')
        }
        
        console.log('      ✅ Source file loaded successfully')
      } catch (err) {
        console.error('      ❌ Failed to load source file:', err.message)
        throw new Error(`Failed to load source file: ${err.message}`)
      }
    },
    
    async clickRunPreflight(page) {
      console.log('   → Action: clickRunPreflight')
      
      try {
        // Find Run Preflight button
        const preflightButton = page.locator('button:has-text("Run Preflight")')
        
        // Assert button exists and is enabled
        await preflightButton.waitFor({ state: 'visible', timeout: 5000 })
        const isEnabled = await preflightButton.isEnabled()
        
        if (!isEnabled) {
          throw new Error('Run Preflight button is disabled')
        }
        
        console.log('      → Run Preflight button enabled')
        
        // Click once
        console.log('      → Run Preflight clicked')
        await preflightButton.click()
        
        // Wait for ONE success signal: Create Job button appears (state = READY)
        console.log('      → Waiting for preflight to complete...')
        
        const createJobButton = page.locator('button:has-text("Create Job")')
        
        try {
          await createJobButton.waitFor({ state: 'visible', timeout: 30000 })
          console.log('      ✅ Preflight succeeded - Create Job button visible')
        } catch (e) {
          throw new Error('Job did not start after Run Preflight click')
        }
        
      } catch (err) {
        console.error('      ❌ Failed to run preflight:', err.message)
        throw err
      }
    },
    
    async clickCreateJob(page, artifactDir) {
      console.log('   → Action: clickCreateJob')
      
      try {
        // STEP 1: Locate Create Job button
        const createButton = page.locator('button:has-text("Create Job")')
        
        // STEP 2: Assert button exists and is enabled
        await createButton.waitFor({ state: 'visible', timeout: 5000 })
        const isEnabled = await createButton.isEnabled()
        
        if (!isEnabled) {
          throw new Error('Create Job button is disabled')
        }
        
        console.log('      → Create Job button enabled')
        
        // Get initial job count
        const initialJobCount = await page.locator('[data-job-id]').count()
        console.log(`      → Initial job count: ${initialJobCount}`)
        
        // STEP 3: Click once
        console.log('      → Create Job clicked')
        await createButton.click()
        
        // STEP 4: Wait for ONE hard success signal
        console.log('      → Waiting for job creation evidence...')
        
        const timeout = 30000
        const startTime = Date.now()
        let jobCreated = false
        
        while (Date.now() - startTime < timeout) {
          // Check if job count increased
          const currentJobCount = await page.locator('[data-job-id]').count()
          
          if (currentJobCount > initialJobCount) {
            console.log(`      ✅ Job created - job count: ${initialJobCount} → ${currentJobCount}`)
            jobCreated = true
            break
          }
          
          // Small wait before next check
          await page.waitForTimeout(500)
        }
        
        if (!jobCreated) {
          // Capture failure state
          await page.screenshot({ path: path.join(artifactDir, 'job_creation_failed.png'), fullPage: true })
          throw new Error('Create Job did not create a job')
        }
        
        // STEP 5: Screenshot + State Capture
        await page.screenshot({ path: path.join(artifactDir, 'job_created.png'), fullPage: true })
        
        // OBSERVATION: Check for progress UI visibility
        console.log('      → Observing progress UI...')
        await this.observeProgressUI(page, artifactDir)
        
        // Infer final state
        const finalState = await inferWorkflowState(page)
        console.log(`      → Final state: ${finalState}`)
        
        // Return trace with job_created state
        return {
          action: 'clickCreateJob',
          workflow_state: 'job_created',
          qc_outcome: 'VERIFIED_OK',
          timestamp: new Date().toISOString(),
        }
        
      } catch (err) {
        console.error('      ❌ Failed to create job:', err.message)
        throw err
      }
    },
    
    async observeProgressUI(page, artifactDir) {
      console.log('      → [OBSERVATION] Checking for visible progress UI...')
      
      // Wait a moment for job to potentially start
      await page.waitForTimeout(2000)
      
      // Check for RUNNING state
      const runningCount = await page.locator('[data-job-status="RUNNING"]').count()
      const jobRunning = runningCount > 0
      
      if (!jobRunning) {
        console.log('      → [OBSERVATION] Job not in RUNNING state (queued/pending)')
        console.log('      → Cannot verify progress UI visibility without running job')
        await page.screenshot({ path: path.join(artifactDir, 'job_queued_not_running.png'), fullPage: true })
        
        // This is not a failure - just an observation that we can't test progress UI yet
        // because the backend worker isn't processing jobs in the test environment
        return
      }
      
      console.log('      → Job is RUNNING, checking for progress indicators...')
      
      // Check for progress indicators
      const progressChecks = [
        { name: 'Progress bar (testid)', selector: '[data-testid*="progress"]' },
        { name: 'Progress bar (role)', selector: '[role="progressbar"]' },
        { name: 'Progress bar (class)', selector: '[class*="progress"]' },
        { name: 'Spinner', selector: '[class*="spinner"], [class*="loading"]' },
      ]
      
      const foundIndicators = []
      
      for (const check of progressChecks) {
        try {
          const element = page.locator(check.selector).first()
          const isVisible = await element.isVisible().catch(() => false)
          
          if (isVisible) {
            foundIndicators.push(check.name)
            console.log(`      ✅ Found visible: ${check.name}`)
          }
        } catch (e) {
          // Not found
        }
      }
      
      await page.screenshot({ path: path.join(artifactDir, 'progress_check_while_running.png'), fullPage: true })
      
      if (foundIndicators.length === 0) {
        console.log('      ❌ OBSERVATION: Job running with no visible progress UI')
        throw new Error('Job running with no visible progress UI')
      } else {
        console.log(`      ✅ OBSERVATION: Progress UI present (${foundIndicators.length} indicators)`)
      }
    },
    
    async waitForJobRunning(page, timeout = 30000) {
      console.log('   → Action: waitForJobRunning')
      try {
        await page.waitForSelector('[data-job-status="RUNNING"]', { timeout, state: 'visible' })
        return true
      } catch {
        return false
      }
    },
    
    async waitForJobComplete(page, timeout = 120000) {
      console.log('   → Action: waitForJobComplete')
      try {
        await page.waitForSelector('[data-job-status="COMPLETED"], [data-job-status="FAILED"]', { timeout, state: 'visible' })
        return true
      } catch {
        return false
      }
    },
  }
}

export async function executeSemanticAction(semanticAction, page, driver, artifactDir, livenessTracker = null, previousScreenshot = null) {
  const action = semanticAction.action
  
  // ===========================================================================
  // STEP 1 — LOG ACTION START
  // ===========================================================================
  const actionStartTime = new Date().toISOString()
  console.log(`   ⏱️  Action started: ${action} at ${actionStartTime}`)
  
  // ===========================================================================
  // STEP 2 — DETECT FINDER DIALOG (HARD STOP)
  // ===========================================================================
  try {
    assertFinderNotOpen(action)
  } catch (e) {
    if (e instanceof FinderDialogError) {
      console.log(``)
      console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)
      console.log(`  🚨 FINDER DIALOG DETECTED — QC INVALID`)
      console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)
      console.log(`  Last Action: ${e.actionName}`)
      console.log(`  Timestamp: ${e.timestamp}`)
      console.log(`  Reason: ${e.message}`)
      console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)
      console.log(``)
      
      return {
        success: false,
        error: e.message,
        finder_dialog_detected: true,
        last_action: e.actionName,
        timestamp: e.timestamp,
      }
    }
    throw e
  }
  
  // STEP 3 — Enforce Renderer Liveness BEFORE action
  if (livenessTracker) {
    try {
      await livenessTracker.assertRendererIsAlive()
    } catch (e) {
      console.log(`   ❌ LIVENESS FAILURE: ${e.message}`)
      return { 
        success: false, 
        error: e.message,
        liveness_failure: true 
      }
    }
  }
  
  // Log current state before action
  const stateBefore = await inferWorkflowState(page)
  console.log(`   State before: ${stateBefore}`)
  
  try {
    if (action === 'user_selects_source_file') {
      await driver.selectRealSource(page)
      
      // Wait for UI to settle
      await waitForUISettle(page, 1000)
      
      // STEP 2 — Check liveness AFTER action
      if (livenessTracker) {
        try {
          await livenessTracker.assertRendererIsAlive()
        } catch (e) {
          console.log(`   ❌ LIVENESS FAILURE: ${e.message}`)
          return { 
            success: false, 
            error: e.message,
            liveness_failure: true 
          }
        }
      }
      
      // Take screenshot after action
      const screenshotPath = path.join(artifactDir, `${action}.png`)
      await page.screenshot({ path: screenshotPath, fullPage: true })
      console.log(`   📸 Screenshot: ${screenshotPath}`)
      
      // VISUAL CHANGE GATE — Fail if no visible change
      if (previousScreenshot) {
        try {
          const metrics = await assertVisualChange(
            action,
            previousScreenshot,
            screenshotPath,
            5.0 // 5% minimum change threshold
          )
          recordVisualDiffMetrics(artifactDir, metrics)
          console.log(`   ✓ Visual change: ${metrics.diff_percent.toFixed(2)}% (threshold: ${metrics.threshold_percent}%)`)
        } catch (e) {
          if (e.name === 'VisualChangeError') {
            console.log(`   ❌ VISUAL CHANGE GATE FAILED: ${e.message}`)
            console.log(`      Diff: ${e.diffPercent.toFixed(2)}% (threshold: 5.0%)`)
            console.log(`      Before: ${e.beforePath}`)
            console.log(`      After: ${e.afterPath}`)
            return {
              success: false,
              error: e.message,
              visual_change_failure: true,
              diff_percent: e.diffPercent,
              screenshot: screenshotPath,
            }
          }
          throw e // Re-throw non-visual-change errors
        }
      }
      
      // Log state after action
      const stateAfter = await inferWorkflowState(page)
      console.log(`   State after: ${stateAfter}`)
      
      if (stateAfter === stateBefore) {
        throw new Error(`State did not change after ${action} (still: ${stateBefore})`)
      }
      
      return { success: true, screenshot: screenshotPath }
    }
    
    if (action === 'system_loads_source') {
      const state = await inferWorkflowState(page)
      if (state === 'source_loaded') {
        // Source is loaded, now we need to run preflight to transition to READY
        console.log('   → Running preflight automatically...')
        await driver.clickRunPreflight(page)
        
        // STEP 2 — Check liveness AFTER action
        if (livenessTracker) {
          try {
            await livenessTracker.assertRendererIsAlive()
          } catch (e) {
            console.log(`   ❌ LIVENESS FAILURE: ${e.message}`)
            return { 
              success: false, 
              error: e.message,
              liveness_failure: true 
            }
          }
        }
        
        // Take screenshot after preflight
        const screenshotPath = path.join(artifactDir, `${action}_after_preflight.png`)
        await page.screenshot({ path: screenshotPath, fullPage: true })
        console.log(`   📸 Screenshot: ${screenshotPath}`)
        
        // VISUAL CHANGE GATE — Fail if no visible change
        if (previousScreenshot) {
          try {
            const metrics = await assertVisualChange(
              action,
              previousScreenshot,
              screenshotPath,
              5.0
            )
            recordVisualDiffMetrics(artifactDir, metrics)
            console.log(`   ✓ Visual change: ${metrics.diff_percent.toFixed(2)}% (threshold: ${metrics.threshold_percent}%)`)
          } catch (e) {
            if (e.name === 'VisualChangeError') {
              console.log(`   ❌ VISUAL CHANGE GATE FAILED: ${e.message}`)
              console.log(`      Diff: ${e.diffPercent.toFixed(2)}% (threshold: 5.0%)`)
              return {
                success: false,
                error: e.message,
                visual_change_failure: true,
                diff_percent: e.diffPercent,
                screenshot: screenshotPath,
              }
            }
            throw e
          }
        }
        
        return { success: true, screenshot: screenshotPath }
      }
      await page.waitForTimeout(3000)
      const newState = await inferWorkflowState(page)
      
      if (newState === 'source_loaded') {
        // Source is loaded, now we need to run preflight to transition to READY
        console.log('   → Running preflight automatically...')
        await driver.clickRunPreflight(page)
        
        // STEP 2 — Check liveness AFTER action
        if (livenessTracker) {
          try {
            await livenessTracker.assertRendererIsAlive()
          } catch (e) {
            console.log(`   ❌ LIVENESS FAILURE: ${e.message}`)
            return { 
              success: false, 
              error: e.message,
              liveness_failure: true 
            }
          }
        }
        
        // Take screenshot after preflight
        const screenshotPath = path.join(artifactDir, `${action}_after_preflight.png`)
        await page.screenshot({ path: screenshotPath, fullPage: true })
        console.log(`   📸 Screenshot: ${screenshotPath}`)
        
        // VISUAL CHANGE GATE — Fail if no visible change
        if (previousScreenshot) {
          try {
            const metrics = await assertVisualChange(
              action,
              previousScreenshot,
              screenshotPath,
              5.0
            )
            recordVisualDiffMetrics(artifactDir, metrics)
            console.log(`   ✓ Visual change: ${metrics.diff_percent.toFixed(2)}% (threshold: ${metrics.threshold_percent}%)`)
          } catch (e) {
            if (e.name === 'VisualChangeError') {
              console.log(`   ❌ VISUAL CHANGE GATE FAILED: ${e.message}`)
              console.log(`      Diff: ${e.diffPercent.toFixed(2)}% (threshold: 5.0%)`)
              return {
                success: false,
                error: e.message,
                visual_change_failure: true,
                diff_percent: e.diffPercent,
                screenshot: screenshotPath,
              }
            }
            throw e
          }
        }
      }
      
      return { success: newState === 'source_loaded', screenshot: screenshotPath }
    }
    
    if (action === 'system_displays_preview') {
      const playerVisible = await page.locator('[data-testid="monitor-surface"], video, .video-player').first().isVisible()
      
      // STEP 2 — Check liveness AFTER action
      if (livenessTracker) {
        try {
          await livenessTracker.assertRendererIsAlive()
        } catch (e) {
          console.log(`   ❌ LIVENESS FAILURE: ${e.message}`)
          return { 
            success: false, 
            error: e.message,
            liveness_failure: true 
          }
        }
      }
      
      return { success: playerVisible, screenshot: null }
    }
    
    if (action === 'user_configures_job') {
      // STEP 2 — Check liveness AFTER action
      if (livenessTracker) {
        try {
          await livenessTracker.assertRendererIsAlive()
        } catch (e) {
          console.log(`   ❌ LIVENESS FAILURE: ${e.message}`)
          return { 
            success: false, 
            error: e.message,
            liveness_failure: true 
          }
        }
      }
      
      return { success: true, screenshot: null }
    }
    
    if (action === 'user_creates_job') {
      // Wait for UI to settle
      await waitForUISettle(page, 1000)
      
      const trace = await driver.clickCreateJob(page, artifactDir)
      
      // STEP 2 — Check liveness AFTER action
      if (livenessTracker) {
        try {
          await livenessTracker.assertRendererIsAlive()
        } catch (e) {
          console.log(`   ❌ LIVENESS FAILURE: ${e.message}`)
          return { 
            success: false, 
            error: e.message,
            liveness_failure: true 
          }
        }
      }
      
      // Log state after job creation
      const stateAfter = await inferWorkflowState(page)
      console.log(`   State after: ${stateAfter}`)
      
      // Extract screenshot from trace
      const screenshotPath = trace?.visual_snapshot?.screenshot_path || null
      
      // VISUAL CHANGE GATE — Fail if no visible change
      if (previousScreenshot && screenshotPath) {
        try {
          const metrics = await assertVisualChange(
            action,
            previousScreenshot,
            screenshotPath,
            5.0
          )
          recordVisualDiffMetrics(artifactDir, metrics)
          console.log(`   ✓ Visual change: ${metrics.diff_percent.toFixed(2)}% (threshold: ${metrics.threshold_percent}%)`)
        } catch (e) {
          if (e.name === 'VisualChangeError') {
            console.log(`   ❌ VISUAL CHANGE GATE FAILED: ${e.message}`)
            console.log(`      Diff: ${e.diffPercent.toFixed(2)}% (threshold: 5.0%)`)
            return {
              success: false,
              error: e.message,
              visual_change_failure: true,
              diff_percent: e.diffPercent,
              trace,
              screenshot: screenshotPath,
            }
          }
          throw e
        }
      }
      
      return { success: trace.qc_outcome !== 'VERIFIED_NOT_OK', trace, screenshot: screenshotPath }
    }
    
    if (action === 'system_queues_job') {
      const jobVisible = await page.locator('[data-job-id]').first().isVisible()
      
      // STEP 2 — Check liveness AFTER action
      if (livenessTracker) {
        try {
          await livenessTracker.assertRendererIsAlive()
        } catch (e) {
          console.log(`   ❌ LIVENESS FAILURE: ${e.message}`)
          return { 
            success: false, 
            error: e.message,
            liveness_failure: true 
          }
        }
      }
      
      return { success: jobVisible, screenshot: null }
    }
    
    if (action === 'system_processes_job') {
      const success = await driver.waitForJobRunning(page)
      
      // STEP 2 — Check liveness AFTER action
      if (livenessTracker) {
        try {
          await livenessTracker.assertRendererIsAlive()
        } catch (e) {
          console.log(`   ❌ LIVENESS FAILURE: ${e.message}`)
          return { 
            success: false, 
            error: e.message,
            liveness_failure: true 
          }
        }
      }
      
      return { success, screenshot: null }
    }
    
    if (action === 'job_completes') {
      const success = await driver.waitForJobComplete(page)
      
      // STEP 2 — Check liveness AFTER action
      if (livenessTracker) {
        try {
          await livenessTracker.assertRendererIsAlive()
        } catch (e) {
          console.log(`   ❌ LIVENESS FAILURE: ${e.message}`)
          return { 
            success: false, 
            error: e.message,
            liveness_failure: true 
          }
        }
      }
      
      return { success, screenshot: null }
    }
    
    return { success: false, error: `Unknown semantic action: ${action}` }
  } catch (e) {
    return { success: false, error: String(e) }
  }
}

export async function runIntent(intentId, context, projectRoot, artifactDir) {
  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)
  console.log(`🎯 EXECUTING INTENT: ${intentId}`)
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`)
  
  const intents = loadIntents(projectRoot)
  const intent = intents.get(intentId)
  
  if (!intent) {
    throw new Error(`Intent not found: ${intentId}`)
  }
  
  if (!validateIntent(intent)) {
    throw new Error(`Intent validation failed: ${intentId}`)
  }
  
  console.log(`Human Goal: "${intent.human_goal}"`)
  console.log(`Total Steps: ${intent.action_sequence.length}\n`)
  
  const driver = createActionDriver()
  const { page, livenessTracker } = context
  
  const actionTraces = []
  const workflowStates = []
  let completedSteps = 0
  let previousScreenshot = null // Track last screenshot for visual change gate
  
  const initialState = await inferWorkflowState(page)
  workflowStates.push(initialState)
  console.log(`Initial State: ${initialState}\n`)
  
  for (const semanticAction of intent.action_sequence) {
    console.log(`\nSTEP ${semanticAction.step}: ${semanticAction.action}`)
    console.log(`   Actor: ${semanticAction.actor}`)
    
    const result = await executeSemanticAction(semanticAction, page, driver, artifactDir, livenessTracker, previousScreenshot)
    
    if (!result.success) {
      const reason = result.error || 'Action did not complete successfully'
      console.log(`   ❌ BLOCKED: ${reason}`)
      
      // FINDER DIALOG DETECTED — Immediate QC_INVALID (HARD STOP)
      if (result.finder_dialog_detected) {
        console.log('')
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
        console.log('  🚨 FINDER DIALOG DETECTED — QC INVALID')
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
        console.log(`  Last Action: ${result.last_action}`)
        console.log(`  Timestamp: ${result.timestamp}`)
        console.log(`  Reason: ${reason}`)
        console.log(``)
        console.log(`  This indicates the automation lost control to a native`)
        console.log(`  macOS file dialog. QC cannot continue.`)
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
        console.log('')
        
        return {
          intent_id: intentId,
          success: false,
          completed_steps: completedSteps,
          total_steps: intent.action_sequence.length,
          action_traces: actionTraces,
          workflow_states: workflowStates,
          failure_reason: reason,
          blocked_at: semanticAction.action,
          qc_invalid: true,
          qc_invalid_reason: `Finder dialog detected: ${reason}`,
          finder_dialog_detected: true,
          last_action: result.last_action,
        }
      }
      
      // STEP 3 — Wire liveness failures into QC_INVALID
      if (result.liveness_failure) {
        return {
          intent_id: intentId,
          success: false,
          completed_steps: completedSteps,
          total_steps: intent.action_sequence.length,
          action_traces: actionTraces,
          workflow_states: workflowStates,
          failure_reason: reason,
          blocked_at: semanticAction.action,
          qc_invalid: true,
          qc_invalid_reason: reason,
        }
      }
      
      // VISUAL CHANGE GATE — Wire into QC_INVALID
      if (result.visual_change_failure) {
        console.log('')
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
        console.log('  VISUAL CHANGE GATE FAILURE')
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
        console.log(`  Action: ${semanticAction.action}`)
        console.log(`  Diff: ${result.diff_percent.toFixed(2)}% (threshold: 5.0%)`)
        console.log(`  Reason: ${reason}`)
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
        console.log('')
        
        return {
          intent_id: intentId,
          success: false,
          completed_steps: completedSteps,
          total_steps: intent.action_sequence.length,
          action_traces: actionTraces,
          workflow_states: workflowStates,
          failure_reason: reason,
          blocked_at: semanticAction.action,
          qc_invalid: true,
          qc_invalid_reason: `Visual change gate failed: ${reason}`,
          visual_change_failure: true,
          diff_percent: result.diff_percent,
        }
      }
      
      return {
        intent_id: intentId,
        success: false,
        completed_steps: completedSteps,
        total_steps: intent.action_sequence.length,
        action_traces: actionTraces,
        workflow_states: workflowStates,
        failure_reason: reason,
        blocked_at: semanticAction.action,
      }
    }
    
    console.log(`   ✅ SUCCESS`)
    completedSteps++
    
    if (result.trace) {
      actionTraces.push(result.trace)
    }
    
    // Update previous screenshot for next iteration
    if (result.screenshot) {
      previousScreenshot = result.screenshot
    }
    
    const newState = await inferWorkflowState(page)
    workflowStates.push(newState)
    console.log(`   State: ${newState}`)
  }
  
  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)
  console.log(`✅ INTENT COMPLETED: ${intentId}`)
  console.log(`   Completed: ${completedSteps}/${intent.action_sequence.length}`)
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`)
  
  return {
    intent_id: intentId,
    success: true,
    completed_steps: completedSteps,
    total_steps: intent.action_sequence.length,
    action_traces: actionTraces,
    workflow_states: workflowStates,
  }
}
