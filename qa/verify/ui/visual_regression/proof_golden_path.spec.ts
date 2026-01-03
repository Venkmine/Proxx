/**
 * PROOF TEST: Full Golden Path (File Load + Job Start)
 *
 * PURPOSE: Prove that Electron automation can execute the full golden path:
 *   1. Load a real source file (via file chooser interception)
 *   2. Create a job (click button, verify job starts)
 * 
 * NO human input required. NO Finder interaction.
 * UI must react visibly at each step.
 *
 * EXPECTED OUTCOME:
 *   - Source file loads (Create Job button appears/enabled)
 *   - Job creation starts (job ID appears, status visible)
 *   - Screenshots captured at each step
 * 
 * If this test passes, golden path automation is working end-to-end.
 */

import { test, expect } from './helpers'
import { waitForAppReady } from './helpers'
import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'

// Get correct path to project root
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const projectRoot = path.resolve(__dirname, '../../../..')

// Import intent driver to reuse its automation logic  
import { executeSemanticAction } from '../../../../scripts/qc/intent_runner.mjs'

test.describe('Manual Proof: Full Golden Path', () => {
  test('Golden path: load file → start job', async ({ page }) => {
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log('🔍 PROOF TEST: Full Golden Path')
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')

    console.log('Step 1: Waiting for app to be ready...')
    await waitForAppReady(page)
    console.log('✅ App ready\n')

    // Create artifact directory for screenshots
    const artifactDir = '/tmp/proof_golden_path'
    fs.mkdirSync(artifactDir, { recursive: true })

    // === STEP 1: Load Source File ===
    console.log('Step 2: Loading source file...')
    console.log('   (Watch for automatic file selection - NO Finder dialog)\n')

    try {
      // Create driver stub with just the methods we need
      const driver = {
        selectRealSource: async (page) => {
          const TEST_FILE = path.join(
            projectRoot,
            'artifacts/v2/20251228T160555/v2_smoke_v2_smoke_test_000.mp4'
          )

          console.log('   → Intercepting file chooser...')
          const fileChooserPromise = page.waitForEvent('filechooser', { timeout: 5000 })

          const selectButton = page.locator('button:has-text("Select Files")')
          await selectButton.waitFor({ state: 'visible', timeout: 5000 })
          await selectButton.click()

          console.log('   → Setting file via file chooser...')
          const fileChooser = await fileChooserPromise
          await fileChooser.setFiles(TEST_FILE)

          // Wait for UI to react
          await page.waitForTimeout(2000)
          
          // Verify Create Job button appeared/enabled
          const createJobButton = page.locator('button:has-text("Create Job")')
          await createJobButton.waitFor({ state: 'visible', timeout: 5000 })
          const isEnabled = await createJobButton.isEnabled()
          
          if (!isEnabled) {
            throw new Error('Create Job button not enabled after file selection')
          }

          console.log('   ✅ Source file loaded, Create Job button enabled\n')
          await page.screenshot({ path: path.join(artifactDir, 'step1_file_loaded.png') })
        },

        clickCreateJob: async (page) => {
          console.log('   → Asserting Create Job button is enabled...')
          const createJobButton = page.locator('button:has-text("Create Job")')
          const isEnabled = await createJobButton.isEnabled()
          
          if (!isEnabled) {
            throw new Error('Create Job button is disabled')
          }

          await page.screenshot({ path: path.join(artifactDir, 'step2_before_create_job.png') })

          console.log('   → Clicking Create Job button...')
          await createJobButton.click()

          // Wait for job indicators to appear
          console.log('   → Waiting for job to start...')
          try {
            // Look for any job indicator: job ID attribute, status text, etc.
            await Promise.race([
              page.locator('[data-job-id]').waitFor({ state: 'visible', timeout: 10000 }),
              page.locator('text=/Job.*started/i').waitFor({ state: 'visible', timeout: 10000 }),
              page.locator('text=/Processing/i').waitFor({ state: 'visible', timeout: 10000 }),
            ])
            console.log('   ✅ Job started successfully\n')
          } catch (e) {
            throw new Error('Create Job did not start job (no job indicators appeared)')
          }

          await page.screenshot({ path: path.join(artifactDir, 'step3_job_started.png') })
        },
      }

      // Execute: user_selects_source_file
      await executeSemanticAction('user_selects_source_file', page, driver, artifactDir)

      // === STEP 2: Create Job ===
      console.log('Step 3: Creating job...')
      console.log('   (Watch for automatic job creation - button click + job start)\n')

      await executeSemanticAction('user_creates_job', page, driver, artifactDir)

      console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
      console.log('✅ PROOF TEST COMPLETE: GOLDEN PATH WORKS')
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')
      console.log('✓ Source file loaded automatically')
      console.log('✓ Job created and started automatically')
      console.log(`\n📸 Screenshots saved to: ${artifactDir}/\n`)

      expect(true).toBe(true) // Test passes if we got here

    } catch (error) {
      console.error('\n❌ PROOF TEST FAILED:', error.message)
      await page.screenshot({ path: path.join(artifactDir, 'error_state.png') })
      throw error
    }
  })
})
