/**
 * Intent Runner
 * 
 * Loads and executes human workflow intents from docs/UI_WORKFLOW_INTENTS.md.
 * Maps semantic actions to real UI actions via action_trace.ts.
 * 
 * This is the binding layer between:
 * - Human-readable workflow specifications
 * - Automated QC execution
 * 
 * See: docs/UI_WORKFLOW_INTENTS.md for intent definitions
 */

import { Page } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import {
  instrumentCreateJobAction,
  inferWorkflowState,
  waitForUISettle,
  type WorkflowState,
  type ActionTrace,
} from '../../../qa/verify/ui/visual_regression/action_trace.js'

// ============================================================================
// TYPES
// ============================================================================

export interface Intent {
  intent_id: string
  human_goal: string
  preconditions: string[]
  action_sequence: SemanticAction[]
  expected_state_transitions: StateTransition[]
  required_ui_evidence: Record<string, string[]>
  acceptable_failures: Record<string, string>
  hard_failures: Record<string, string>
}

export interface SemanticAction {
  step: number
  action: string
  actor: 'User' | 'System'
}

export interface StateTransition {
  from: WorkflowState
  to: WorkflowState
  trigger: string
}

export interface IntentExecutionResult {
  intent_id: string
  success: boolean
  completed_steps: number
  total_steps: number
  action_traces: ActionTrace[]
  workflow_states: WorkflowState[]
  failure_reason?: string
  blocked_at?: string
}

export interface ActionDriver {
  selectRealSource: (page: Page) => Promise<void>
  clickCreateJob: (page: Page, artifactDir: string) => Promise<ActionTrace>
  waitForJobRunning: (page: Page, timeout?: number) => Promise<boolean>
  waitForJobComplete: (page: Page, timeout?: number) => Promise<boolean>
}

// ============================================================================
// INTENT LOADER
// ============================================================================

/**
 * Load and parse UI_WORKFLOW_INTENTS.md.
 * 
 * Extracts intent definitions from markdown structure.
 */
export function loadIntents(projectRoot: string): Map<string, Intent> {
  const intentPath = path.join(projectRoot, 'docs', 'UI_WORKFLOW_INTENTS.md')
  
  if (!fs.existsSync(intentPath)) {
    throw new Error(`Intent specification not found: ${intentPath}`)
  }
  
  const content = fs.readFileSync(intentPath, 'utf-8')
  const intents = new Map<string, Intent>()
  
  // Parse intent sections (### INTENT_NNN — Title)
  const intentRegex = /^### (INTENT_\d+) — (.+)$/gm
  let match
  
  while ((match = intentRegex.exec(content)) !== null) {
    const intentId = match[1]
    const title = match[2]
    
    // Extract intent content (everything until next ### or end)
    const startIdx = match.index + match[0].length
    const nextIntentMatch = content.slice(startIdx).match(/^### INTENT_/m)
    const endIdx = nextIntentMatch 
      ? startIdx + nextIntentMatch.index!
      : content.length
    
    const intentContent = content.slice(startIdx, endIdx)
    
    // Parse intent structure
    const intent = parseIntentContent(intentId, title, intentContent)
    
    if (intent) {
      intents.set(intentId, intent)
    }
  }
  
  return intents
}

/**
 * Parse individual intent content from markdown.
 */
function parseIntentContent(intentId: string, title: string, content: string): Intent | null {
  try {
    // Extract human goal
    const goalMatch = content.match(/#### Human Goal\s*\n\s*>\s*"(.+)"/)
    const humanGoal = goalMatch ? goalMatch[1] : title
    
    // Extract action sequence table
    const actionSequence = parseActionSequenceTable(content)
    
    // Extract state transitions
    const stateTransitions = parseStateTransitions(content)
    
    // Extract required UI evidence table
    const requiredEvidence = parseEvidenceTable(content)
    
    // Extract failure tables
    const acceptableFailures = parseFailureTable(content, 'Acceptable Failures')
    const hardFailures = parseFailureTable(content, 'Hard Failures')
    
    return {
      intent_id: intentId,
      human_goal: humanGoal,
      preconditions: [], // Could parse from Preconditions section
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

/**
 * Parse action sequence table from markdown.
 */
function parseActionSequenceTable(content: string): SemanticAction[] {
  const actions: SemanticAction[] = []
  
  // Find Action Sequence table
  const tableMatch = content.match(/\| Step \| Action \| Actor \|[\s\S]*?\n\n/)
  if (!tableMatch) return actions
  
  const tableContent = tableMatch[0]
  const rows = tableContent.split('\n').slice(2) // Skip header and separator
  
  for (const row of rows) {
    const cols = row.split('|').map(c => c.trim()).filter(Boolean)
    if (cols.length >= 3) {
      const step = parseInt(cols[0])
      const action = cols[1].replace(/`/g, '')
      const actor = cols[2] as 'User' | 'System'
      
      if (!isNaN(step)) {
        actions.push({ step, action, actor })
      }
    }
  }
  
  return actions
}

/**
 * Parse state transitions from markdown.
 */
function parseStateTransitions(content: string): StateTransition[] {
  const transitions: StateTransition[] = []
  
  // Find state transition table
  const tableMatch = content.match(/\| From State \| To State \| Trigger \|[\s\S]*?\n\n/)
  if (!tableMatch) return transitions
  
  const tableContent = tableMatch[0]
  const rows = tableContent.split('\n').slice(2) // Skip header and separator
  
  for (const row of rows) {
    const cols = row.split('|').map(c => c.trim().replace(/`/g, '')).filter(Boolean)
    if (cols.length >= 3) {
      transitions.push({
        from: cols[0] as WorkflowState,
        to: cols[1] as WorkflowState,
        trigger: cols[2],
      })
    }
  }
  
  return transitions
}

/**
 * Parse required UI evidence table.
 */
function parseEvidenceTable(content: string): Record<string, string[]> {
  const evidence: Record<string, string[]> = {}
  
  // Find Required UI Evidence table
  const tableMatch = content.match(/\| State \| Evidence \|[\s\S]*?\n\n/)
  if (!tableMatch) return evidence
  
  const tableContent = tableMatch[0]
  const rows = tableContent.split('\n').slice(2) // Skip header and separator
  
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

/**
 * Parse failure table (Acceptable or Hard).
 */
function parseFailureTable(content: string, tableTitle: string): Record<string, string> {
  const failures: Record<string, string> = {}
  
  // Find failure table
  const regex = new RegExp(`\\| Failure \\| ${tableTitle === 'Acceptable Failures' ? 'Expected Behavior' : 'Why It\'s a Contract Violation'} \\|[\\s\\S]*?\\n\\n`)
  const tableMatch = content.match(regex)
  if (!tableMatch) return failures
  
  const tableContent = tableMatch[0]
  const rows = tableContent.split('\n').slice(2) // Skip header and separator
  
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

/**
 * Validate intent schema.
 */
export function validateIntent(intent: Intent): boolean {
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
  
  if (intent.expected_state_transitions.length === 0) {
    console.error(`Intent ${intent.intent_id} has no state transitions`)
    return false
  }
  
  return true
}

// ============================================================================
// ACTION DRIVER IMPLEMENTATION
// ============================================================================

/**
 * Create action driver with real UI interactions.
 */
export function createActionDriver(): ActionDriver {
  return {
    /**
     * Select a real source file via UI.
     */
    async selectRealSource(page: Page): Promise<void> {
      console.log('   → Action: selectRealSource')
      
      // Look for file input or select button
      const fileInput = page.locator('input[type="file"]').first()
      const selectButton = page.locator('button:has-text("Select"), button:has-text("Browse")').first()
      
      // Use environment variable for test file path (set by test runner)
      const testFile = process.env.QC_TEST_FILE || '<QC_TEST_FILE_NOT_SET>'
      
      if (await fileInput.isVisible()) {
        await fileInput.setInputFiles(testFile)
      } else if (await selectButton.isVisible()) {
        // Some UIs have a button that opens file picker
        // For QC, we inject the file path directly
        await page.evaluate((filePath) => {
          // Simulate file selection (this is a test helper)
          const event = new CustomEvent('file-selected', { detail: { path: filePath } })
          document.dispatchEvent(event)
        }, testFile)
      }
      
      // Wait for source to load
      await page.waitForTimeout(2000) // Give time for probing
    },
    
    /**
     * Click Create Job button with full instrumentation.
     */
    async clickCreateJob(page: Page, artifactDir: string): Promise<ActionTrace> {
      console.log('   → Action: clickCreateJob')
      return await instrumentCreateJobAction(page, artifactDir)
    },
    
    /**
     * Wait for job to enter running state.
     */
    async waitForJobRunning(page: Page, timeout = 30000): Promise<boolean> {
      console.log('   → Action: waitForJobRunning')
      try {
        await page.waitForSelector('[data-job-status="RUNNING"]', { timeout, state: 'visible' })
        return true
      } catch {
        return false
      }
    },
    
    /**
     * Wait for job to complete.
     */
    async waitForJobComplete(page: Page, timeout = 120000): Promise<boolean> {
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

// ============================================================================
// SEMANTIC ACTION → UI ACTION MAPPING
// ============================================================================

/**
 * Execute a semantic action using the action driver.
 */
export async function executeSemanticAction(
  semanticAction: SemanticAction,
  page: Page,
  driver: ActionDriver,
  artifactDir: string
): Promise<{ success: boolean; trace?: ActionTrace; error?: string }> {
  const action = semanticAction.action
  
  try {
    // Map semantic action to UI action
    if (action === 'user_selects_source_file') {
      await driver.selectRealSource(page)
      return { success: true }
    }
    
    if (action === 'system_loads_source') {
      // Wait for source_loaded state
      const state = await inferWorkflowState(page)
      if (state === 'source_loaded') {
        return { success: true }
      }
      // Wait a bit and check again
      await page.waitForTimeout(3000)
      const newState = await inferWorkflowState(page)
      return { success: newState === 'source_loaded' }
    }
    
    if (action === 'system_displays_preview') {
      // Check for video player visibility
      const playerVisible = await page.locator('[data-testid="monitor-surface"], video, .video-player').first().isVisible()
      return { success: playerVisible }
    }
    
    if (action === 'user_configures_job') {
      // Optional step - skip for now
      return { success: true }
    }
    
    if (action === 'user_creates_job') {
      const trace = await driver.clickCreateJob(page, artifactDir)
      return { success: trace.qc_outcome !== 'VERIFIED_NOT_OK', trace }
    }
    
    if (action === 'system_queues_job') {
      // Job should appear in queue
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
    
    // Unknown action
    return { success: false, error: `Unknown semantic action: ${action}` }
  } catch (e) {
    return { success: false, error: String(e) }
  }
}

// ============================================================================
// INTENT RUNNER
// ============================================================================

/**
 * Run a workflow intent end-to-end.
 * 
 * Executes each semantic action in sequence, capturing:
 * - Workflow states after each step
 * - Action traces for instrumented actions
 * - Success/failure reasons
 */
export async function runIntent(
  intentId: string,
  context: { page: Page; backend?: any },
  projectRoot: string,
  artifactDir: string
): Promise<IntentExecutionResult> {
  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)
  console.log(`🎯 EXECUTING INTENT: ${intentId}`)
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`)
  
  // Load intents
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
  
  // Create action driver
  const driver = createActionDriver()
  const { page } = context
  
  // Execution state
  const actionTraces: ActionTrace[] = []
  const workflowStates: WorkflowState[] = []
  let completedSteps = 0
  
  // Record initial state
  const initialState = await inferWorkflowState(page)
  workflowStates.push(initialState)
  console.log(`Initial State: ${initialState}\n`)
  
  // Execute each semantic action
  for (const semanticAction of intent.action_sequence) {
    console.log(`\nSTEP ${semanticAction.step}: ${semanticAction.action}`)
    console.log(`   Actor: ${semanticAction.actor}`)
    
    // Execute action
    const result = await executeSemanticAction(semanticAction, page, driver, artifactDir)
    
    if (!result.success) {
      // Action failed or blocked
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
    
    // Action succeeded
    console.log(`   ✅ SUCCESS`)
    completedSteps++
    
    // Record trace if available
    if (result.trace) {
      actionTraces.push(result.trace)
    }
    
    // Record new workflow state
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
