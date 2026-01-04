/**
 * INTENT_010 Human Confirmation Module
 * 
 * Provides human-in-the-loop confirmation for QC results.
 * When enabled, pauses execution on failure and prompts for review.
 * 
 * Usage:
 *   INTENT_010_HUMAN_CONFIRM=1 npx playwright test intent_010_usability.spec.ts
 * 
 * Or in CI:
 *   npx playwright test intent_010_usability.spec.ts -- --human-confirm
 */

import readline from 'node:readline'
import fs from 'node:fs'
import path from 'node:path'

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export interface HumanConfirmation {
  timestamp: string
  check_id: string
  check_name: string
  automated_verdict: 'PASS' | 'FAIL'
  human_response?: 'ACCEPT' | 'REJECT' | 'SKIPPED'
  human_notes?: string
  response_time_ms?: number
}

export interface ConfirmationSession {
  session_id: string
  started_at: string
  ended_at?: string
  confirmations: HumanConfirmation[]
  final_decision?: 'APPROVED' | 'REJECTED' | 'PARTIAL'
}

// ============================================================================
// ENVIRONMENT DETECTION
// ============================================================================

/**
 * Check if human confirmation mode is enabled
 */
export function isHumanConfirmEnabled(): boolean {
  return process.env.INTENT_010_HUMAN_CONFIRM === '1' ||
         process.argv.includes('--human-confirm')
}

/**
 * Check if running in CI (where interactive prompts are not possible)
 */
export function isCI(): boolean {
  return process.env.CI === 'true' || 
         process.env.GITHUB_ACTIONS === 'true' ||
         process.env.JENKINS_URL !== undefined
}

// ============================================================================
// PROMPT UTILITIES
// ============================================================================

/**
 * Create readline interface for interactive prompts
 */
function createReadlineInterface(): readline.Interface {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  })
}

/**
 * Prompt user for YES/NO response
 */
async function promptYesNo(question: string): Promise<boolean> {
  const rl = createReadlineInterface()
  
  return new Promise((resolve) => {
    rl.question(`${question} [Y/n]: `, (answer) => {
      rl.close()
      const normalized = answer.trim().toLowerCase()
      resolve(normalized === '' || normalized === 'y' || normalized === 'yes')
    })
  })
}

/**
 * Prompt user for optional notes
 */
async function promptNotes(question: string): Promise<string | undefined> {
  const rl = createReadlineInterface()
  
  return new Promise((resolve) => {
    rl.question(`${question}: `, (answer) => {
      rl.close()
      const trimmed = answer.trim()
      resolve(trimmed || undefined)
    })
  })
}

// ============================================================================
// CONFIRMATION FLOW
// ============================================================================

/**
 * Request human confirmation for a failed check
 * Returns the human's decision and any notes
 */
export async function requestConfirmation(
  checkId: string,
  checkName: string,
  reason: string,
  screenshotPath?: string
): Promise<HumanConfirmation> {
  const startTime = Date.now()
  
  console.log('\n' + '═'.repeat(70))
  console.log('  🤔 HUMAN CONFIRMATION REQUIRED')
  console.log('═'.repeat(70))
  console.log(`\n  Check: ${checkName}`)
  console.log(`  ID: ${checkId}`)
  console.log(`  Reason: ${reason}`)
  
  if (screenshotPath) {
    console.log(`\n  📸 Screenshot saved at:`)
    console.log(`     ${screenshotPath}`)
    console.log(`\n  Please review the screenshot before confirming.`)
  }
  
  console.log('')
  
  // If in CI, skip interactive prompt and mark as SKIPPED
  if (isCI()) {
    console.log('  ⚠️  Running in CI - cannot prompt for confirmation.')
    console.log('  ⚠️  Marking as SKIPPED. Review artifacts manually.')
    console.log('')
    
    return {
      timestamp: new Date().toISOString(),
      check_id: checkId,
      check_name: checkName,
      automated_verdict: 'FAIL',
      human_response: 'SKIPPED',
      human_notes: 'CI environment - interactive prompt skipped',
      response_time_ms: Date.now() - startTime,
    }
  }
  
  // Interactive prompt
  const accepted = await promptYesNo('  Do you ACCEPT this as valid (not a real failure)?')
  
  let notes: string | undefined
  if (!accepted) {
    notes = await promptNotes('  Optional notes (or press Enter to skip)')
  }
  
  const confirmation: HumanConfirmation = {
    timestamp: new Date().toISOString(),
    check_id: checkId,
    check_name: checkName,
    automated_verdict: 'FAIL',
    human_response: accepted ? 'ACCEPT' : 'REJECT',
    human_notes: notes,
    response_time_ms: Date.now() - startTime,
  }
  
  console.log('')
  if (accepted) {
    console.log('  ✅ Human ACCEPTED - treating as non-blocking')
  } else {
    console.log('  ❌ Human REJECTED - failure confirmed')
  }
  console.log('═'.repeat(70) + '\n')
  
  return confirmation
}

/**
 * Request final approval for the entire QC run
 */
export async function requestFinalApproval(
  passedChecks: number,
  failedChecks: number,
  artifactDir: string
): Promise<HumanConfirmation> {
  const startTime = Date.now()
  
  console.log('\n' + '═'.repeat(70))
  console.log('  📋 FINAL QC REVIEW')
  console.log('═'.repeat(70))
  console.log(`\n  Results: ${passedChecks} passed, ${failedChecks} failed`)
  console.log(`  Artifacts: ${artifactDir}`)
  console.log('')
  
  if (isCI()) {
    return {
      timestamp: new Date().toISOString(),
      check_id: 'FINAL_APPROVAL',
      check_name: 'Final QC Approval',
      automated_verdict: failedChecks > 0 ? 'FAIL' : 'PASS',
      human_response: 'SKIPPED',
      human_notes: 'CI environment - interactive prompt skipped',
      response_time_ms: Date.now() - startTime,
    }
  }
  
  const approved = await promptYesNo('  Do you APPROVE this QC run for shipping?')
  const notes = await promptNotes('  Optional reviewer notes')
  
  return {
    timestamp: new Date().toISOString(),
    check_id: 'FINAL_APPROVAL',
    check_name: 'Final QC Approval',
    automated_verdict: failedChecks > 0 ? 'FAIL' : 'PASS',
    human_response: approved ? 'ACCEPT' : 'REJECT',
    human_notes: notes,
    response_time_ms: Date.now() - startTime,
  }
}

// ============================================================================
// SESSION MANAGEMENT
// ============================================================================

/**
 * Save confirmation session to artifact directory
 */
export function saveConfirmationSession(
  artifactDir: string,
  session: ConfirmationSession
): string {
  const filename = 'human_confirmations.json'
  const filepath = path.join(artifactDir, filename)
  
  fs.writeFileSync(filepath, JSON.stringify(session, null, 2))
  
  return filepath
}

/**
 * Load existing confirmation session from artifact directory
 */
export function loadConfirmationSession(
  artifactDir: string
): ConfirmationSession | null {
  const filepath = path.join(artifactDir, 'human_confirmations.json')
  
  if (!fs.existsSync(filepath)) {
    return null
  }
  
  try {
    const content = fs.readFileSync(filepath, 'utf-8')
    return JSON.parse(content) as ConfirmationSession
  } catch {
    return null
  }
}

/**
 * Create a new confirmation session
 */
export function createSession(): ConfirmationSession {
  return {
    session_id: `confirm_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    started_at: new Date().toISOString(),
    confirmations: [],
  }
}

/**
 * Finalize session with overall decision
 */
export function finalizeSession(session: ConfirmationSession): ConfirmationSession {
  session.ended_at = new Date().toISOString()
  
  const responses = session.confirmations.map(c => c.human_response)
  const hasReject = responses.includes('REJECT')
  const hasAccept = responses.includes('ACCEPT')
  const allSkipped = responses.every(r => r === 'SKIPPED')
  
  if (allSkipped) {
    session.final_decision = 'PARTIAL' // No human input received
  } else if (hasReject) {
    session.final_decision = 'REJECTED'
  } else if (hasAccept) {
    session.final_decision = 'APPROVED'
  } else {
    session.final_decision = 'PARTIAL'
  }
  
  return session
}

// ============================================================================
// REPORT INTEGRATION
// ============================================================================

/**
 * Generate markdown section for human confirmations
 */
export function generateConfirmationSection(session: ConfirmationSession): string {
  const lines: string[] = []
  
  lines.push('### 👤 Human Confirmations')
  lines.push('')
  lines.push(`**Session ID:** ${session.session_id}`)
  lines.push(`**Started:** ${session.started_at}`)
  if (session.ended_at) {
    lines.push(`**Ended:** ${session.ended_at}`)
  }
  
  if (session.final_decision) {
    const emoji = session.final_decision === 'APPROVED' ? '✅' : 
                  session.final_decision === 'REJECTED' ? '❌' : '⚠️'
    lines.push(`**Final Decision:** ${emoji} ${session.final_decision}`)
  }
  
  lines.push('')
  
  if (session.confirmations.length === 0) {
    lines.push('*No human confirmations recorded.*')
    lines.push('')
    return lines.join('\n')
  }
  
  lines.push('| Check | Automated | Human | Notes |')
  lines.push('|-------|-----------|-------|-------|')
  
  for (const c of session.confirmations) {
    const autoEmoji = c.automated_verdict === 'PASS' ? '✅' : '❌'
    const humanEmoji = c.human_response === 'ACCEPT' ? '✅' : 
                       c.human_response === 'REJECT' ? '❌' : '⏭️'
    const notes = c.human_notes ? c.human_notes.slice(0, 50) : '-'
    
    lines.push(`| ${c.check_name.slice(0, 30)} | ${autoEmoji} | ${humanEmoji} ${c.human_response || '-'} | ${notes} |`)
  }
  
  lines.push('')
  
  return lines.join('\n')
}
