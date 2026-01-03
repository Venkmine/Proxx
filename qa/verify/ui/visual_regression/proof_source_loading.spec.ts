/**
 * Manual Proof Test: Source File Loading
 * 
 * This test ONLY verifies that selectRealSource() can:
 * 1. Open the file chooser
 * 2. Set a file path
 * 3. Cause the UI to acknowledge the source
 * 
 * Run with:
 *   cd qa/verify/ui/visual_regression
 *   npx playwright test proof_source_loading.spec.ts --headed
 * 
 * Expected visible result:
 * - File picker opens
 * - UI changes after file selection (metadata, enabled button, etc.)
 */

import { test, expect } from './helpers'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const projectRoot = path.resolve(__dirname, '../../../..')

// Import action driver
const intentRunnerPath = path.join(projectRoot, 'scripts/qc/intent_runner.mjs')
const { createActionDriver, loadIntents } = await import(`file://${intentRunnerPath}`)

test.describe('Manual Proof: Source File Loading', () => {
  test('selectRealSource() loads file and UI acknowledges', async ({ page }) => {
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log('🔍 PROOF TEST: Source File Loading')
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')
    
    // Create action driver
    const driver = createActionDriver()
    
    console.log('Step 1: Waiting for app to be ready...')
    await page.waitForTimeout(2000)
    
    console.log('\nStep 2: Running selectRealSource()...')
    console.log('   (Watch for file picker interaction)\n')
    
    // This should:
    // - Open file chooser
    // - Set the file
    // - Wait for UI to acknowledge
    await driver.selectRealSource(page)
    
    console.log('\n✅ SUCCESS: selectRealSource() completed without error')
    console.log('   UI should now show evidence of loaded source\n')
    
    // Take a screenshot for manual verification
    await page.screenshot({ path: '/tmp/proof_source_loaded.png', fullPage: true })
    console.log('📸 Screenshot saved: /tmp/proof_source_loaded.png')
    
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log('✅ PROOF TEST COMPLETE')
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')
    
    // Optional: verify at least one success indicator
    const createJobEnabled = await page.locator('button:has-text("Create Job"):not([disabled])').isVisible().catch(() => false)
    const metadataVisible = await page.locator('[data-testid="source-metadata"]').isVisible().catch(() => false)
    const filenameVisible = await page.locator('text=/v2_smoke/i').isVisible().catch(() => false)
    
    const anyIndicator = createJobEnabled || metadataVisible || filenameVisible
    expect(anyIndicator).toBe(true)
    
    console.log('✓ At least one success indicator confirmed:')
    if (createJobEnabled) console.log('  - Create Job button enabled')
    if (metadataVisible) console.log('  - Source metadata visible')
    if (filenameVisible) console.log('  - Filename visible in UI')
  })
})
