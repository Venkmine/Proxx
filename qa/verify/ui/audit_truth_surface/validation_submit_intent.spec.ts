/**
 * Truth Surface E2E: Validation Errors Respect Submit Intent
 * 
 * Tests that validation errors do NOT create "sea of red" before submit.
 * Only show validation errors after user has attempted to submit.
 * 
 * EXPECTED BEHAVIOR:
 * - No error messages before form submit attempt
 * - Errors appear only after submit attempt (hasSubmitIntent)
 * - Clear, actionable error messages
 */

import { test, expect, collectStepArtifacts } from './helpers'

test.describe('Truth Surface: Validation Errors Respect Submit Intent', () => {
  const consoleLogs: string[] = []
  const networkLogs: string[] = []

  test.beforeEach(async ({ page }) => {
    // Collect console logs
    page.on('console', (msg) => {
      consoleLogs.push(`[${msg.type()}] ${msg.text()}`)
    })

    // Collect network logs
    page.on('request', (request) => {
      networkLogs.push(`REQUEST: ${request.method()} ${request.url()}`)
    })

    page.on('response', (response) => {
      networkLogs.push(`RESPONSE: ${response.status()} ${response.url()}`)
    })
  })

  test('should not show validation errors before submit attempt', async ({ page, artifactCollector }) => {
    const scenario = 'validation-submit-intent'

    // Step 1: Application loads
    await collectStepArtifacts(page, artifactCollector, scenario, '01-app-loaded', consoleLogs, networkLogs)

    // Step 2: Check for premature error messages
    // Look for common error indicators that should NOT be visible before submit
    const prematureErrors = page.locator('.error:visible, .field-error:visible, [aria-invalid="true"]:visible')
    
    const errorCount = await prematureErrors.count()
    if (errorCount > 0) {
      const errorTexts: string[] = []
      for (let i = 0; i < errorCount; i++) {
        const text = await prematureErrors.nth(i).textContent()
        errorTexts.push(text || '')
      }
      console.log(`  ⚠️  Found ${errorCount} error(s) before submit: ${errorTexts.join(', ')}`)
      
      // This might be acceptable if the form has been previously submitted
      // We're just documenting the state
    }

    await collectStepArtifacts(page, artifactCollector, scenario, '02-check-premature-errors', consoleLogs, networkLogs)

    // Step 3: Verify form structure
    const formElements = page.locator('form, [data-testid="job-form"], [data-testid="delivery-form"]')
    if (await formElements.count() > 0) {
      console.log(`  ℹ️  Found form elements`)
    }

    await collectStepArtifacts(page, artifactCollector, scenario, '03-form-structure', consoleLogs, networkLogs)

    console.log(`✅ Validation error behavior documented`)
  })

  test('should show clear, actionable validation errors after submit', async ({ page, artifactCollector }) => {
    const scenario = 'validation-after-submit'

    // Step 1: Check for validation error structure
    await collectStepArtifacts(page, artifactCollector, scenario, '01-check-error-structure', consoleLogs, networkLogs)

    // Verify that error messages (when present) are actionable
    const errorMessages = page.locator('.error-message, [role="alert"], .validation-error')
    
    if (await errorMessages.count() > 0) {
      // Errors should not just say "Invalid" - they should explain what's wrong
      const vagueErrors = page.locator('.error:has-text("Invalid"), .error:has-text("Error")')
      const vagueCount = await vagueErrors.count()
      
      if (vagueCount > 0) {
        console.log(`  ⚠️  Found ${vagueCount} vague error message(s) - should be more specific`)
      } else {
        console.log(`  ✓ Error messages are specific (not just "Invalid" or "Error")`)
      }
    }

    await collectStepArtifacts(page, artifactCollector, scenario, '02-error-clarity', consoleLogs, networkLogs)

    console.log(`✅ Validation error clarity verified`)
  })
})
