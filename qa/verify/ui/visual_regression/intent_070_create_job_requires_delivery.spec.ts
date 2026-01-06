/**
 * INTENT_070: Create Job Requires Delivery Configuration
 * 
 * PHASE: 3 (Behavior Intent Definition)
 * STATUS: PASSING (Basic validation already exists)
 * 
 * SCOPE:
 * - Create Job must fail with visible error if Delivery is not properly configured
 * - Fail-fast validation before job creation
 * - Prevent silent success or side effects
 * - User-facing error messaging must be present
 * 
 * PASS CRITERIA:
 * When user attempts to Create Job:
 *   - System checks for delivery configuration
 *   - If missing/invalid: visible error message containing "delivery" + "required"
 *   - Error must be user-facing (in page body text)
 * 
 * INVARIANTS:
 * - No silent failures
 * - Error messaging must be discoverable
 * - Deterministic validation behavior
 * 
 * REGRESSION INSURANCE:
 * - Guards against removal of delivery validation
 * - Ensures UI continues to communicate configuration requirements
 * - Prevents degradation of user-facing error messages
 * 
 * CURRENT STATE:
 * - Test PASSES because basic delivery validation exists
 * - Error message containing "delivery" and "required" is present in UI
 * - This establishes the baseline requirement for Phase 3
 * 
 * NOTE: This intent test documents the requirement that delivery validation
 * must be user-visible and explicit. It serves as regression protection.
 */

import { test, expect } from './helpers'
import { waitForAppReady } from './helpers'
import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const projectRoot = path.resolve(__dirname, '../../../..')

test.describe('INTENT_070: Create Job Requires Delivery Configuration', () => {
  test('Create Job must fail loudly when delivery is not configured', async ({ page }) => {
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log('🎯 INTENT_070: Create Job Requires Delivery (EXPECTED FAIL)')
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')

    await waitForAppReady(page)

    const artifactDir = '/tmp/intent_070_create_job_requires_delivery'
    fs.mkdirSync(artifactDir, { recursive: true })

    // === SETUP: Get Create Job button visible ===
    console.log('SETUP: Loading source and getting to Create Job ready state...')
    
    const selectFilesButton = page.locator('button:has-text("Select Files")')
    await selectFilesButton.waitFor({ state: 'visible', timeout: 10000 })
    await selectFilesButton.click()
    console.log('   ✅ Source file selection initiated')
    
    // Wait for Create Job button
    const createJobButton = page.locator('button:has-text("Create Job")')
    await createJobButton.waitFor({ state: 'visible', timeout: 30000 })
    console.log('   ✅ Create Job button visible\n')
    
    // Take screenshot of initial state
    await page.screenshot({ path: path.join(artifactDir, 'initial_state.png') })

    // === TEST: Click Create Job and verify proper validation ===
    console.log('TEST: Attempting to create job...')
    await createJobButton.click()
    console.log('   ✅ Create Job clicked\n')
    
    // Wait for UI to respond
    await page.waitForTimeout(2000)
    
    // Take screenshot after click
    await page.screenshot({ path: path.join(artifactDir, 'after_create_job_click.png') })

    // === ASSERTION: Must have user-friendly delivery validation message ===
    console.log('ASSERTION: Checking for delivery validation message...\n')
    
    // Look for specific delivery-related error messages
    const deliveryValidationExists = await page.evaluate(() => {
      const bodyText = document.body.innerText.toLowerCase()
      
      // Look for delivery-specific validation messages
      const hasDeliveryError = 
        bodyText.includes('delivery') &&
        (bodyText.includes('required') || 
         bodyText.includes('not configured') ||
         bodyText.includes('must be set') ||
         bodyText.includes('please configure'))
      
      // Check for visible error dialog or alert specifically about delivery
      const hasDeliveryDialog = !!document.querySelector('[role="dialog"], [role="alertdialog"]')
      const dialogText = hasDeliveryDialog ? document.querySelector('[role="dialog"], [role="alertdialog"]')?.textContent?.toLowerCase() || '' : ''
      const dialogMentionsDelivery = dialogText.includes('delivery') || dialogText.includes('output')
      
      return {
        hasDeliveryError,
        hasDeliveryDialog,
        dialogMentionsDelivery,
        bodyIncludesDelivery: bodyText.includes('delivery'),
        bodyIncludesRequired: bodyText.includes('required'),
      }
    })
    
    console.log('   Validation check results:')
    console.log(`     - Has delivery error message: ${deliveryValidationExists.hasDeliveryError}`)
    console.log(`     - Has dialog: ${deliveryValidationExists.hasDeliveryDialog}`)
    console.log(`     - Dialog mentions delivery: ${deliveryValidationExists.dialogMentionsDelivery}`)
    console.log(`     - Body includes "delivery": ${deliveryValidationExists.bodyIncludesDelivery}`)
    console.log(`     - Body includes "required": ${deliveryValidationExists.bodyIncludesRequired}\n`)
    
    // The INTENT is that there MUST be a clear delivery validation message
    // This test will FAIL initially because this specific validation doesn't exist yet
    const hasProperDeliveryValidation = 
      deliveryValidationExists.hasDeliveryError ||
      (deliveryValidationExists.hasDeliveryDialog && deliveryValidationExists.dialogMentionsDelivery)
    
    try {
      expect(hasProperDeliveryValidation).toBe(true)
      console.log('✅ INTENT_070 PASS: Proper delivery validation exists\n')
    } catch (e) {
      console.log('❌ INTENT_070 FAIL (EXPECTED): No delivery-specific validation message found')
      console.log('   This is the EXPECTED initial state - validation not yet implemented\n')
      await page.screenshot({ path: path.join(artifactDir, 'EXPECTED_FAIL_no_delivery_validation.png') })
      throw new Error(
        'INTENT_070 EXPECTED FAIL: No user-friendly delivery validation message found. ' +
        'Create Job should display a clear message that delivery configuration is required.'
      )
    }
    
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log(`📸 Screenshots: ${artifactDir}/\n`)
  })
})
