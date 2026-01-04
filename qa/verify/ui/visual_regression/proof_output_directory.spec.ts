/**
 * PROOF: Output Directory Setting
 * 
 * Verify that clicking "Select Folder" properly sets the output directory
 * and the value persists in the UI.
 */

import { test } from './helpers'

test.describe('Output Directory Proof', () => {
  test('verify openFolder mock sets output directory', async ({ page }) => {
    console.log('\n🔬 PROOF: Testing output directory setting...\n')
    
    // Wait for app to be ready
    await page.waitForSelector('[data-testid="create-job-panel"]', { timeout: 10000 })
    
    // Find Browse button for output directory
    const selectFolderBtn = page.locator('button:has-text("Browse...")')
    const isVisible = await selectFolderBtn.first().isVisible()
    console.log(`Browse button visible: ${isVisible}`)
    
    if (!isVisible) {
      throw new Error('Select Folder button not found')
    }
    
    // Get initial output directory value
    const initialValue = await page.evaluate(() => {
      const input = document.querySelector('[data-testid="output-directory-input"]') as HTMLInputElement
      return input ? input.value : null
    })
    console.log(`Initial output directory: ${initialValue || '(empty)'}`)
    
    // Click Select Folder (should trigger mock)
    console.log('Clicking Select Folder...')
    await selectFolderBtn.first().click()
    
    // Wait for React to update
    await page.waitForTimeout(1000)
    
    // Check if value was set
    const finalValue = await page.evaluate(() => {
      const input = document.querySelector('[data-testid="output-directory-input"]') as HTMLInputElement
      return input ? input.value : null
    })
    console.log(`Final output directory: ${finalValue || '(empty)'}`)
    
    // Take screenshot
    await page.screenshot({ path: '/tmp/proof_output_directory.png', fullPage: true })
    console.log('Screenshot saved: /tmp/proof_output_directory.png')
    
    // Verify
    if (!finalValue || finalValue === initialValue) {
      throw new Error(`Output directory not set. Initial: ${initialValue}, Final: ${finalValue}`)
    }
    
    console.log(`✅ PROOF PASSED: Output directory set to: ${finalValue}`)
  })
})
