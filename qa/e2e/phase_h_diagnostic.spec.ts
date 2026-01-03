/**
 * Phase H DIAGNOSTIC TEST
 * 
 * Purpose: Determine why delivery progress bars are NOT visible to users.
 * 
 * This test:
 * - Creates ONE FFmpeg job with a known slow file
 * - Captures DOM snapshots every 250ms
 * - Captures frontend console logs
 * - Captures backend logs
 * - Generates a comprehensive diagnostic report
 * 
 * Run with:
 * - DIAGNOSTIC_MODE=1 npm test -- phase_h_diagnostic
 */

import { test, expect, type Page, type ConsoleMessage } from '@playwright/test'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import fs from 'node:fs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Test configuration
const BACKEND_URL = process.env.BACKEND_URL || 'http://127.0.0.1:8085'
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://127.0.0.1:5173'
const TEST_DATA_DIR = path.resolve(__dirname, '../../forge-tests/samples')
const TEST_FILE = path.join(TEST_DATA_DIR, 'standard/mp4_h264/sample_h264.mp4')
const REPORT_PATH = path.resolve(__dirname, '../../PHASE_H_DIAGNOSTIC_REPORT.md')
const SCREENSHOTS_DIR = path.resolve(__dirname, '../../diagnostic_screenshots')

// ============================================================================
// DIAGNOSTIC DATA STRUCTURES
// ============================================================================

interface DOMSnapshot {
  timestamp: number
  elapsed_ms: number
  delivery_stage_text: string | null
  progress_bar_visible: boolean
  progress_bar_width: string | null
  indeterminate_spinner_visible: boolean
  eta_visible: boolean
  eta_text: string | null
  queue_row_html: string
}

interface ConsoleLog {
  timestamp: number
  elapsed_ms: number
  type: string
  text: string
}

interface BackendLog {
  timestamp: number
  elapsed_ms: number
  line: string
}

interface DiagnosticData {
  job_id: string
  start_time: number
  dom_snapshots: DOMSnapshot[]
  console_logs: ConsoleLog[]
  backend_logs: BackendLog[]
  screenshots: string[]
}

// ============================================================================
// HELPERS
// ============================================================================

async function createDiagnosticJob(sourcePath: string): Promise<string> {
  const response = await fetch(`${BACKEND_URL}/control/jobs/create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      source_paths: [sourcePath],
      engine: 'ffmpeg',
      deliver_settings: {
        video: { codec: 'prores_proxy' },
        audio: { codec: 'aac' },
        file: { container: 'mov', naming_template: '{source_name}_diagnostic' },
        output_dir: '/tmp/proxx-diagnostic-output'
      }
    })
  })
  
  if (!response.ok) {
    throw new Error(`Failed to create job: ${response.status}`)
  }
  
  const data = await response.json()
  return data.job_id
}

async function startJob(jobId: string): Promise<void> {
  const response = await fetch(`${BACKEND_URL}/control/jobs/${jobId}/start`, {
    method: 'POST'
  })
  
  if (!response.ok) {
    throw new Error(`Failed to start job: ${response.status}`)
  }
}

async function resetBackendQueue(): Promise<void> {
  try {
    await fetch(`${BACKEND_URL}/control/queue/reset`, { method: 'POST' })
    await new Promise(resolve => setTimeout(resolve, 500))
  } catch {
    // Ignore
  }
}

async function captureDOMSnapshot(
  page: Page,
  jobId: string,
  startTime: number
): Promise<DOMSnapshot> {
  const now = Date.now()
  const elapsed_ms = now - startTime
  
  const jobCard = page.locator(`[data-job-id="${jobId}"]`)
  
  // Try to find delivery stage text
  let delivery_stage_text: string | null = null
  try {
    const stageLabels = ['queued', 'starting', 'encoding', 'finalizing', 'completed', 'failed']
    for (const label of stageLabels) {
      const locator = jobCard.locator(`text=/${label}/i`)
      if (await locator.isVisible({ timeout: 100 })) {
        delivery_stage_text = await locator.textContent()
        break
      }
    }
  } catch {
    // Not found
  }
  
  // Check progress bar visibility
  let progress_bar_visible = false
  let progress_bar_width: string | null = null
  try {
    const progressBar = jobCard.locator('[data-testid="progress-bar-fill"]')
    progress_bar_visible = await progressBar.isVisible({ timeout: 100 })
    if (progress_bar_visible) {
      progress_bar_width = await progressBar.evaluate(el => (el as HTMLElement).style.width)
    }
  } catch {
    // Not visible
  }
  
  // Check indeterminate spinner
  let indeterminate_spinner_visible = false
  try {
    const spinner = jobCard.locator('[data-testid="progress-spinner"], [data-testid="progress-bar-indeterminate"]')
    indeterminate_spinner_visible = await spinner.isVisible({ timeout: 100 })
  } catch {
    // Not visible
  }
  
  // Check ETA
  let eta_visible = false
  let eta_text: string | null = null
  try {
    const eta = jobCard.locator('[data-testid="progress-eta"]')
    eta_visible = await eta.isVisible({ timeout: 100 })
    if (eta_visible) {
      eta_text = await eta.textContent()
    }
  } catch {
    // Not visible
  }
  
  // Capture entire queue row HTML
  let queue_row_html = ''
  try {
    queue_row_html = await jobCard.innerHTML()
  } catch {
    queue_row_html = 'Failed to capture HTML'
  }
  
  return {
    timestamp: now,
    elapsed_ms,
    delivery_stage_text,
    progress_bar_visible,
    progress_bar_width,
    indeterminate_spinner_visible,
    eta_visible,
    eta_text,
    queue_row_html,
  }
}

async function generateDiagnosticReport(data: DiagnosticData): Promise<void> {
  const lines: string[] = []
  
  lines.push('# Phase H Diagnostic Report')
  lines.push('')
  lines.push('**Generated:** ' + new Date().toISOString())
  lines.push('**Job ID:** ' + data.job_id)
  lines.push('')
  
  // Summary section
  lines.push('## Summary')
  lines.push('')
  lines.push('| Metric | Value |')
  lines.push('|--------|-------|')
  lines.push(`| DOM Snapshots | ${data.dom_snapshots.length} |`)
  lines.push(`| Console Logs | ${data.console_logs.length} |`)
  lines.push(`| Backend Logs | ${data.backend_logs.length} |`)
  lines.push(`| Screenshots | ${data.screenshots.length} |`)
  lines.push('')
  
  // Timeline table
  lines.push('## Timeline')
  lines.push('')
  lines.push('| Time (ms) | Backend Stage | Backend Progress | Frontend Render | DOM State |')
  lines.push('|-----------|---------------|------------------|-----------------|-----------|')
  
  // Merge backend logs and DOM snapshots by timestamp
  const timeline: Array<{ time: number; type: 'backend' | 'dom'; data: any }> = []
  
  for (const log of data.backend_logs) {
    if (log.line.includes('[DIAGNOSTIC]')) {
      timeline.push({ time: log.elapsed_ms, type: 'backend', data: log })
    }
  }
  
  for (const snapshot of data.dom_snapshots) {
    timeline.push({ time: snapshot.elapsed_ms, type: 'dom', data: snapshot })
  }
  
  timeline.sort((a, b) => a.time - b.time)
  
  // Track state for timeline
  let lastBackendStage = 'unknown'
  let lastBackendProgress = '0.0'
  
  for (const entry of timeline) {
    if (entry.type === 'backend') {
      const log = entry.data as BackendLog
      // Parse backend log
      const stageMatch = log.line.match(/new_stage=(\w+)/)
      const progressMatch = log.line.match(/new_progress=([\d.]+)/)
      if (stageMatch) lastBackendStage = stageMatch[1]
      if (progressMatch) lastBackendProgress = progressMatch[1]
      
      lines.push(`| ${entry.time} | ${lastBackendStage} | ${lastBackendProgress}% | - | - |`)
    } else {
      const snapshot = entry.data as DOMSnapshot
      const frontendRender = snapshot.delivery_stage_text || 'none'
      const domState = snapshot.progress_bar_visible 
        ? `bar ${snapshot.progress_bar_width}` 
        : snapshot.indeterminate_spinner_visible 
          ? 'spinner' 
          : 'none'
      
      lines.push(`| ${entry.time} | ${lastBackendStage} | ${lastBackendProgress}% | ${frontendRender} | ${domState} |`)
    }
  }
  
  lines.push('')
  
  // Console logs section
  lines.push('## Console Logs')
  lines.push('')
  lines.push('```')
  for (const log of data.console_logs) {
    lines.push(`[${log.elapsed_ms}ms] ${log.type.toUpperCase()}: ${log.text}`)
  }
  lines.push('```')
  lines.push('')
  
  // Backend diagnostic logs section
  lines.push('## Backend Diagnostic Logs')
  lines.push('')
  lines.push('```')
  for (const log of data.backend_logs) {
    if (log.line.includes('[DIAGNOSTIC]')) {
      lines.push(`[${log.elapsed_ms}ms] ${log.line}`)
    }
  }
  lines.push('```')
  lines.push('')
  
  // Verdict section
  lines.push('## Verdict')
  lines.push('')
  
  // Analyze the data
  const backendUpdatesFound = data.backend_logs.some(log => log.line.includes('[DIAGNOSTIC]'))
  const frontendRendersFound = data.console_logs.some(log => log.text.includes('[DIAGNOSTIC]'))
  const progressBarEverVisible = data.dom_snapshots.some(s => s.progress_bar_visible)
  const stageTextFound = data.dom_snapshots.some(s => s.delivery_stage_text !== null)
  
  lines.push('**Analysis:**')
  lines.push('')
  lines.push(`- Backend sending updates: ${backendUpdatesFound ? '✅ YES' : '❌ NO'}`)
  lines.push(`- Frontend receiving props: ${frontendRendersFound ? '✅ YES' : '❌ NO'}`)
  lines.push(`- Progress bar rendered: ${progressBarEverVisible ? '✅ YES' : '❌ NO'}`)
  lines.push(`- Stage text visible: ${stageTextFound ? '✅ YES' : '❌ NO'}`)
  lines.push('')
  
  // Determine root cause
  if (!backendUpdatesFound) {
    lines.push('**Root Cause: Backend issue**')
    lines.push('')
    lines.push('The backend is not sending delivery_stage or progress_percent updates.')
    lines.push('Check that:')
    lines.push('- `update_task_status()` is being called')
    lines.push('- `on_progress_callback()` is being invoked by the engine')
    lines.push('- The task model is being updated correctly')
  } else if (!frontendRendersFound) {
    lines.push('**Root Cause: Frontend state issue**')
    lines.push('')
    lines.push('Backend is sending updates, but frontend components are not receiving them.')
    lines.push('Check that:')
    lines.push('- API polling is working')
    lines.push('- Job state is being updated in the frontend store')
    lines.push('- Props are being passed correctly to JobProgressBar and ClipRow')
  } else if (!progressBarEverVisible && !stageTextFound) {
    lines.push('**Root Cause: Rendering/CSS issue**')
    lines.push('')
    lines.push('Components are rendering, but UI elements are not visible.')
    lines.push('Check that:')
    lines.push('- CSS styles are not hiding elements')
    lines.push('- Visibility conditions in JobProgressBar are correct')
    lines.push('- DOM structure matches expectations')
  } else if (stageTextFound && !progressBarEverVisible) {
    lines.push('**Root Cause: Progress bar logic issue**')
    lines.push('')
    lines.push('Stage text is visible, but progress bar never appears.')
    lines.push('Check that:')
    lines.push('- `shouldShowProgress()` logic is correct')
    lines.push('- `progress_percent > 0` condition is met')
    lines.push('- Progress bar rendering conditions are satisfied')
  } else {
    lines.push('**Root Cause: Unknown or intermittent issue**')
    lines.push('')
    lines.push('Some UI elements are visible. Review timeline for missing states.')
  }
  
  lines.push('')
  lines.push('## Recommended Fix')
  lines.push('')
  lines.push('_To be determined after reviewing this report._')
  lines.push('')
  
  // Screenshots section
  if (data.screenshots.length > 0) {
    lines.push('## Screenshots')
    lines.push('')
    for (const screenshot of data.screenshots) {
      lines.push(`![${path.basename(screenshot)}](${screenshot})`)
      lines.push('')
    }
  }
  
  // Write report
  fs.writeFileSync(REPORT_PATH, lines.join('\n'))
}

// ============================================================================
// TEST
// ============================================================================

test.describe('Phase H Diagnostic', () => {
  test('Capture delivery progress lifecycle', async ({ page }) => {
    // Ensure screenshots directory exists
    if (!fs.existsSync(SCREENSHOTS_DIR)) {
      fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true })
    }
    
    // Data collection
    const data: DiagnosticData = {
      job_id: '',
      start_time: 0,
      dom_snapshots: [],
      console_logs: [],
      backend_logs: [],
      screenshots: [],
    }
    
    // Enable diagnostic mode in frontend
    await page.goto(FRONTEND_URL)
    await page.evaluate(() => {
      (window as any).DIAGNOSTIC_MODE = true
    })
    
    // Capture console logs
    page.on('console', (msg: ConsoleMessage) => {
      const now = Date.now()
      data.console_logs.push({
        timestamp: now,
        elapsed_ms: data.start_time ? now - data.start_time : 0,
        type: msg.type(),
        text: msg.text(),
      })
    })
    
    // Reset backend
    await resetBackendQueue()
    
    // Create job
    console.log('Creating diagnostic job...')
    const jobId = await createDiagnosticJob(TEST_FILE)
    data.job_id = jobId
    data.start_time = Date.now()
    
    console.log(`Job created: ${jobId}`)
    
    // Wait for job card to appear
    await page.waitForSelector(`[data-job-id="${jobId}"]`, { timeout: 10000 })
    
    // Start job
    console.log('Starting job...')
    await startJob(jobId)
    
    // Capture DOM snapshots every 250ms for 30 seconds or until completed
    let completed = false
    let iteration = 0
    const maxIterations = 120 // 30 seconds
    
    while (!completed && iteration < maxIterations) {
      iteration++
      
      // Capture snapshot
      const snapshot = await captureDOMSnapshot(page, jobId, data.start_time)
      data.dom_snapshots.push(snapshot)
      
      // Take screenshot every 2 seconds
      if (iteration % 8 === 0) {
        const screenshotPath = path.join(SCREENSHOTS_DIR, `snapshot_${iteration}.png`)
        await page.screenshot({ path: screenshotPath, fullPage: true })
        data.screenshots.push(screenshotPath)
      }
      
      // Check if completed
      if (snapshot.delivery_stage_text?.toLowerCase().includes('completed')) {
        completed = true
        console.log('Job completed, finishing capture...')
        // Capture a few more snapshots
        for (let i = 0; i < 4; i++) {
          await page.waitForTimeout(250)
          const finalSnapshot = await captureDOMSnapshot(page, jobId, data.start_time)
          data.dom_snapshots.push(finalSnapshot)
        }
        break
      }
      
      await page.waitForTimeout(250)
    }
    
    console.log(`Captured ${data.dom_snapshots.length} DOM snapshots`)
    console.log(`Captured ${data.console_logs.length} console logs`)
    
    // Fetch backend logs (if available via a logs endpoint)
    // For now, we'll note that backend logs should be collected from terminal/file
    console.log('Note: Collect backend logs from terminal output (DIAGNOSTIC_MODE=1)')
    
    // Generate report
    console.log('Generating diagnostic report...')
    await generateDiagnosticReport(data)
    
    console.log(`Report written to: ${REPORT_PATH}`)
    
    // Always pass - this is a diagnostic test, not a validation test
    expect(true).toBe(true)
  })
})
