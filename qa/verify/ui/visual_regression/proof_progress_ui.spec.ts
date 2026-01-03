/**
 * PROOF TEST: Progress UI Visibility During Job Execution
 *
 * PURPOSE: Observe whether visible progress indicators appear when a job is running.
 * This is OBSERVATION ONLY - not fixing anything.
 *
 * WORKFLOW:
 *   1. Load file → Run preflight → Create job
 *   2. Wait for job to enter RUNNING state
 *   3. Check for visible progress UI (progress bar, spinner, percentage)
 *   4. Report findings with screenshot
 * 
 * EXPECTED OUTCOME:
 *   - Job enters RUNNING state
 *   - Progress UI is visible (or we report it's missing)
 *   - Screenshot captures the state
 */

import { test, expect } from './helpers'
import { waitForAppReady } from './helpers'
import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const projectRoot = path.resolve(__dirname, '../../../..')

test.describe('Proof: Progress UI Observation', () => {
  test('observe progress UI during job execution', async ({ page }) => {
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log('🔍 PROOF TEST: Progress UI Visibility')
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')

    await waitForAppReady(page)

    const artifactDir = '/tmp/proof_progress_ui'
    fs.mkdirSync(artifactDir, { recursive: true })

    const TEST_FILE = path.join(
      projectRoot,
      'artifacts/v2/20251228T160555/v2_smoke_v2_smoke_test_000.mp4'
    )

    // === STEP 1: Advance to job_running ===
    console.log('STEP 1: Advancing to job_running state...\n')

    // Load file using file chooser (like golden path test)
    console.log('   → Loading source file...')
    const fileChooserPromise = page.waitForEvent('filechooser', { timeout: 5000 })
    
    const selectButton = page.locator('button:has-text("Select Files")')
    await selectButton.waitFor({ state: 'visible', timeout: 5000 })
    await selectButton.click()
    
    const fileChooser = await fileChooserPromise
    await fileChooser.setFiles(TEST_FILE)
    
    // Wait for Create Job button to appear (may take time for backend processing)
    console.log('   → Waiting for Create Job button...')
    const createJobButton = page.locator('button:has-text("Create Job")')
    await createJobButton.waitFor({ state: 'visible', timeout: 30000 })
    
    // Create job
    console.log('   → Creating job...')
    await createJobButton.click()
    
    // Wait for job to appear
    console.log('   → Waiting for job to appear in queue...')
    const jobElement = page.locator('[data-job-id]').first()
    await jobElement.waitFor({ state: 'visible', timeout: 10000 })
    console.log('   ✅ Job created\n')
    
    await page.screenshot({ path: path.join(artifactDir, 'job_created.png') })

    // Wait for job to enter RUNNING state
    console.log('   → Waiting for job to enter RUNNING state...')
    const timeout = 60000 // 60 seconds
    const startTime = Date.now()
    let jobRunning = false
    
    while (Date.now() - startTime < timeout) {
      // Check for RUNNING status attribute
      const runningJob = await page.locator('[data-job-status="RUNNING"]').count()
      if (runningJob > 0) {
        console.log('   ✅ Job entered RUNNING state (via data-job-status)\n')
        jobRunning = true
        break
      }
      
      // Alternative: Check for "processing" or "rendering" text
      const processingText = await page.locator('text=/processing|rendering|running/i').count()
      if (processingText > 0) {
        console.log('   ✅ Job entered RUNNING state (via status text)\n')
        jobRunning = true
        break
      }
      
      await page.waitForTimeout(500)
    }
    
    if (!jobRunning) {
      await page.screenshot({ path: path.join(artifactDir, 'job_never_running.png') })
      throw new Error('Job never entered running state')
    }

    await page.screenshot({ path: path.join(artifactDir, 'job_running.png') })

    // === STEP 2: Look for progress UI ===
    console.log('STEP 2: Looking for visible progress UI...\n')

    // Check for progress indicators
    const progressIndicators = [
      { name: 'Progress bar (testid)', selector: '[data-testid*="progress"]' },
      { name: 'Progress bar (role)', selector: '[role="progressbar"]' },
      { name: 'Progress bar (class)', selector: '[class*="progress"]' },
      { name: 'Spinner', selector: '[class*="spinner"], [class*="loading"]' },
      { name: 'Percentage indicator', selector: 'text=/\\d+%/' },
      { name: 'Time remaining', selector: 'text=/\\d+:\\d+|time remaining/i' },
    ]

    let progressFound = false
    const foundIndicators = []

    for (const indicator of progressIndicators) {
      try {
        const element = page.locator(indicator.selector).first()
        const isVisible = await element.isVisible({ timeout: 1000 })
        
        if (isVisible) {
          foundIndicators.push(indicator.name)
          console.log(`   ✅ Found: ${indicator.name}`)
          progressFound = true
        }
      } catch (e) {
        // Not found or not visible
      }
    }

    console.log('')

    // === STEP 3: Decide ===
    await page.screenshot({ path: path.join(artifactDir, 'progress_check_complete.png') })

    if (progressFound) {
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
      console.log('✅ OBSERVATION: Progress UI present')
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')
      console.log('Found indicators:')
      foundIndicators.forEach(name => console.log(`  - ${name}`))
      console.log(`\n📸 Screenshots: ${artifactDir}/\n`)
      
      expect(progressFound).toBe(true)
    } else {
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
      console.log('❌ OBSERVATION: Job running with no visible progress UI')
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')
      console.log('Checked for:')
      progressIndicators.forEach(ind => console.log(`  - ${ind.name}`))
      console.log(`\n📸 Screenshot: ${artifactDir}/progress_check_complete.png`)
      console.log('📸 Screenshot: ${artifactDir}/job_running.png\n')
      
      throw new Error('Job running with no visible progress UI')
    }
  })
})
