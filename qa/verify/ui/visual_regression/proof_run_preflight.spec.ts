/**
 * Proof Test: Run Preflight Button Click
 * 
 * This test verifies that the clickRunPreflight() action:
 * 1. Finds the "Run Preflight" button
 * 2. Verifies it's enabled
 * 3. Clicks it once
 * 4. Waits for "Create Job" button to appear (state = READY)
 * 
 * Run with:
 *   cd qa/verify/ui/visual_regression
 *   npx playwright test proof_run_preflight.spec.ts --headed
 */

import { test } from './helpers'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const projectRoot = path.resolve(__dirname, '../../../..')

// Import action driver
const intentRunnerPath = path.join(projectRoot, 'scripts/qc/intent_runner.mjs')
const { createActionDriver } = await import(`file://${intentRunnerPath}`)

test.describe('Proof: Run Preflight Button', () => {
  test('clickRunPreflight() clicks button and waits for Create Job', async ({ page }) => {
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log('🔍 PROOF TEST: Run Preflight Button Click')
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')
    
    const driver = createActionDriver()
    
    console.log('Step 1: Loading source file...')
    await driver.selectRealSource(page)
    console.log('✅ Source file loaded\n')
    
    // Take screenshot before preflight
    await page.screenshot({ path: '/tmp/before_preflight.png', fullPage: true })
    console.log('📸 Screenshot: /tmp/before_preflight.png\n')
    
    console.log('Step 2: Running preflight...')
    await driver.clickRunPreflight(page)
    console.log('✅ Preflight completed\n')
    
    // Take screenshot after preflight
    await page.screenshot({ path: '/tmp/after_preflight.png', fullPage: true })
    console.log('📸 Screenshot: /tmp/after_preflight.png\n')
    
    // Verify Create Job button is visible
    const createJobButton = page.locator('button:has-text("Create Job")')
    const isVisible = await createJobButton.isVisible()
    
    console.log(`Create Job button visible: ${isVisible}`)
    
    if (!isVisible) {
      console.error('❌ FAIL: Create Job button not visible after preflight')
      throw new Error('Create Job button not visible after preflight')
    }
    
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log('✅ PROOF TEST COMPLETE')
    console.log('   - Run Preflight clicked')
    console.log('   - Create Job button appeared')
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')
  })
})
