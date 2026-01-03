/**
 * PROOF TEST: Create Job Click + Job Verification
 *
 * PURPOSE: Prove that clickCreateJob() works in isolation:
 *   1. Start from a state where Create Job button is enabled
 *   2. Click it
 *   3. Verify a job appears in the UI
 * 
 * This test focuses ONLY on the Create Job action, assuming:
 *   - File is already loaded
 *   - Preflight already run
 *   - Create Job button is enabled and ready
 *
 * EXPECTED OUTCOME:
 *   - Create Job button is clicked
 *   - Job count increases from 0 to 1
 *   - Job row becomes visible with [data-job-id]
 *   - Screenshot proves job appeared
 */

import { test, expect } from './helpers'
import { waitForAppReady } from './helpers'
import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const projectRoot = path.resolve(__dirname, '../../../..')

test.describe('Proof: Create Job Only', () => {
  test('clickCreateJob() creates visible job in UI', async ({ page }) => {
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log('🔍 PROOF TEST: Create Job Only')
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')

    await waitForAppReady(page)

    const artifactDir = '/tmp/proof_create_job_only'
    fs.mkdirSync(artifactDir, { recursive: true })

    // === STEP 1: Get to READY state (file loaded + preflight run) ===
    console.log('Step 1: Preparing Create Job button...')
    
    const TEST_FILE = path.join(
      projectRoot,
      'artifacts/v2/20251228T160555/v2_smoke_v2_smoke_test_000.mp4'
    )

    // Load file using mock (like other tests do)
    console.log('   → Loading source file via mock...')
    await page.evaluate((filePath) => {
      if (!window.electron) {
        window.electron = {}
      }
      window.electron.openFilesOrFolders = async () => {
        return [filePath]
      }
    }, TEST_FILE)
    
    await page.locator('button:has-text("Select Files")').click()
    
    // Wait for Run Preflight button
    console.log('   → Waiting for Run Preflight button...')
    const preflightButton = page.locator('button:has-text("Run Preflight")')
    await preflightButton.waitFor({ state: 'visible', timeout: 30000 })
    
    // Click Run Preflight
    console.log('   → Running preflight...')
    await preflightButton.click()
    
    // Wait for Create Job button to appear
    console.log('   → Waiting for Create Job button...')
    const createJobButton = page.locator('button:has-text("Create Job")')
    await createJobButton.waitFor({ state: 'visible', timeout: 30000 })
    
    const isEnabled = await createJobButton.isEnabled()
    if (!isEnabled) {
      await page.screenshot({ path: path.join(artifactDir, 'create_job_not_enabled.png') })
      throw new Error('Create Job button not enabled after preflight')
    }
    
    console.log('   ✅ Create Job button is enabled\n')
    await page.screenshot({ path: path.join(artifactDir, 'ready_state.png') })

    // === STEP 2: Test clickCreateJob() ===
    console.log('Step 2: Clicking Create Job and verifying job appears...\n')
    
    // Get initial job count
    const initialJobCount = await page.locator('[data-job-id]').count()
    console.log(`   → Initial job count: ${initialJobCount}`)
    
    // Take before screenshot
    await page.screenshot({ path: path.join(artifactDir, 'before_create_job.png') })
    
    // Click Create Job
    console.log('   → Clicking Create Job...')
    await createJobButton.click()
    
    // Wait for job to appear (30s timeout)
    console.log('   → Waiting for job to appear...')
    const timeout = 30000
    const startTime = Date.now()
    let jobCreated = false
    
    while (Date.now() - startTime < timeout) {
      const currentJobCount = await page.locator('[data-job-id]').count()
      
      if (currentJobCount > initialJobCount) {
        console.log(`   ✅ Job created - job count: ${initialJobCount} → ${currentJobCount}`)
        jobCreated = true
        break
      }
      
      await page.waitForTimeout(500)
    }
    
    if (!jobCreated) {
      await page.screenshot({ path: path.join(artifactDir, 'job_not_created.png') })
      throw new Error('Create Job did not create a job within 30 seconds')
    }
    
    // Take after screenshot
    await page.screenshot({ path: path.join(artifactDir, 'after_create_job.png') })
    
    // Verify job is actually visible
    const jobElement = page.locator('[data-job-id]').first()
    await expect(jobElement).toBeVisible()
    
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log('✅ PROOF TEST COMPLETE: CREATE JOB WORKS')
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')
    console.log('✓ Create Job button clicked')
    console.log('✓ Job appeared in UI')
    console.log('✓ Job count increased')
    console.log('✓ Job element is visible\n')
    console.log(`📸 Screenshots: ${artifactDir}/\n`)
  })
})
