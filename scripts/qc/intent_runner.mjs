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
        // STEP 1: Mock window.electron.openFilesOrFolders() BEFORE clicking button
        // CRITICAL: Must mock openFilesOrFolders, NOT openFiles!
        // The UI calls openFilesOrFolders() (see SourceSelectionPanel.tsx)
        console.log('      → Setting up mock for window.electron.openFilesOrFolders()...')
        await page.evaluate((filePath) => {
          if (!window.electron) {
            window.electron = {}
          }
          // Replace with mock that returns our test file (NO native dialog)
          // This EXACTLY replicates what Electron's dialog.showOpenDialog returns
          window.electron.openFilesOrFolders = async () => {
            console.log('[TEST] openFilesOrFolders() mocked, returning:', [filePath])
            return [filePath]
          }
        }, TEST_FILE)
        
        // STEP 2: Now click the button (will use our mock, no native dialog)
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
    
    async clickCreateJob(page, artifactDir) {
      console.log('   → Action: clickCreateJob')
      
      try {
        // Find Create Job button
        const createButton = page.locator('button:has-text("Create Job")')
        
        // Assert button is enabled
        await createButton.waitFor({ state: 'visible', timeout: 5000 })
        const isEnabled = await createButton.isEnabled()
        
        if (!isEnabled) {
          throw new Error('Create Job button is disabled')
        }
        
        console.log('      → Create Job button is enabled')
        
        // Take screenshot before click
        await page.screenshot({ path: path.join(artifactDir, 'before_create_job.png'), fullPage: true })
        
        // Click once
        console.log('      → Clicking Create Job...')
        await createButton.click()
        
        // Wait for evidence of job creation (at least one must happen)
        console.log('      → Waiting for job to appear...')
        
        const jobIndicators = [
          page.locator('[data-job-id], [data-testid*="job"]'),
          page.locator('text=/Job.*created|queued|running/i'),
          page.locator('[data-testid="status-panel"] >> text=/processing|rendering/i'),
        ]
        
        let jobStarted = false
        for (const indicator of jobIndicators) {
          try {
            await indicator.waitFor({ state: 'visible', timeout: 10000 })
            jobStarted = true
            console.log('      ✅ Job started - indicator visible:', await indicator.textContent().catch(() => 'job visible'))
            break
          } catch (e) {
            continue
          }
        }
        
        if (!jobStarted) {
          await page.screenshot({ path: path.join(artifactDir, 'job_start_failed.png'), fullPage: true })
          throw new Error('Create Job did not start job')
        }
        
        // Take screenshot after job creation
        await page.screenshot({ path: path.join(artifactDir, 'after_create_job.png'), fullPage: true })
        
        // Use instrumented action for detailed trace
        const trace = await instrumentCreateJobAction(page, artifactDir)
        return trace
        
      } catch (err) {
        console.error('      ❌ Failed to create job:', err.message)
        throw err
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

export async function executeSemanticAction(semanticAction, page, driver, artifactDir) {
  const action = semanticAction.action
  
  // Log current state before action
  const stateBefore = await inferWorkflowState(page)
  console.log(`   State before: ${stateBefore}`)
  
  try {
    if (action === 'user_selects_source_file') {
      await driver.selectRealSource(page)
      
      // Wait for UI to settle
      await waitForUISettle(page, 1000)
      
      // Take screenshot after action
      const screenshotPath = path.join(artifactDir, `${action}.png`)
      await page.screenshot({ path: screenshotPath, fullPage: true })
      console.log(`   📸 Screenshot: ${screenshotPath}`)
      
      // Log state after action
      const stateAfter = await inferWorkflowState(page)
      console.log(`   State after: ${stateAfter}`)
      
      if (stateAfter === stateBefore) {
        throw new Error(`State did not change after ${action} (still: ${stateBefore})`)
      }
      
      return { success: true }
    }
    
    if (action === 'system_loads_source') {
      const state = await inferWorkflowState(page)
      if (state === 'source_loaded') {
        return { success: true }
      }
      await page.waitForTimeout(3000)
      const newState = await inferWorkflowState(page)
      return { success: newState === 'source_loaded' }
    }
    
    if (action === 'system_displays_preview') {
      const playerVisible = await page.locator('[data-testid="monitor-surface"], video, .video-player').first().isVisible()
      return { success: playerVisible }
    }
    
    if (action === 'user_configures_job') {
      return { success: true }
    }
    
    if (action === 'user_creates_job') {
      // Wait for UI to settle
      await waitForUISettle(page, 1000)
      
      const trace = await driver.clickCreateJob(page, artifactDir)
      
      // Log state after job creation
      const stateAfter = await inferWorkflowState(page)
      console.log(`   State after: ${stateAfter}`)
      
      return { success: trace.qc_outcome !== 'VERIFIED_NOT_OK', trace }
    }
    
    if (action === 'system_queues_job') {
      const jobVisible = await page.locator('[data-job-id]').first().isVisible()
      return { success: jobVisible }
    }
    
    if (action === 'system_processes_job') {
      const success = await driver.waitForJobRunning(page)
      return { success }
    }
    
    if (action === 'job_completes') {
      const success = await driver.waitForJobComplete(page)
      return { success }
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
  const { page } = context
  
  const actionTraces = []
  const workflowStates = []
  let completedSteps = 0
  
  const initialState = await inferWorkflowState(page)
  workflowStates.push(initialState)
  console.log(`Initial State: ${initialState}\n`)
  
  for (const semanticAction of intent.action_sequence) {
    console.log(`\nSTEP ${semanticAction.step}: ${semanticAction.action}`)
    console.log(`   Actor: ${semanticAction.actor}`)
    
    const result = await executeSemanticAction(semanticAction, page, driver, artifactDir)
    
    if (!result.success) {
      const reason = result.error || 'Action did not complete successfully'
      console.log(`   ❌ BLOCKED: ${reason}`)
      
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
