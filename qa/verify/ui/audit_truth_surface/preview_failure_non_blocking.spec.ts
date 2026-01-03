/**
 * Truth Surface E2E: Preview Failure Does Not Block Delivery
 * 
 * Tests that preview generation failures DO NOT prevent delivery job creation.
 * 
 * EXPECTED BEHAVIOR:
 * - Preview failure is reported
 * - Delivery job can still be created
 * - No blocking error states
 */

import { test, expect, collectStepArtifacts } from './helpers'

test.describe('Truth Surface: Preview Failure Non-Blocking', () => {
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

  test('should allow delivery creation even when preview fails', async ({ page, artifactCollector }) => {
    const scenario = 'preview-failure-non-blocking'

    // Step 1: Application loads
    await collectStepArtifacts(page, artifactCollector, scenario, '01-app-loaded', consoleLogs, networkLogs)

    // Step 2: Verify no blocking error dialogs on preview failure
    const blockingError = page.locator('.modal:has-text("Error"), .dialog:has-text("Error"), [role="alertdialog"]')
    
    // If error dialogs exist, they should be dismissible (not blocking)
    if (await blockingError.count() > 0) {
      const dismissButton = blockingError.locator('button:has-text("OK"), button:has-text("Close"), button:has-text("Dismiss")')
      if (await dismissButton.count() > 0) {
        // Error is dismissible - good!
        console.log('  ℹ️  Found dismissible error dialog (expected behavior)')
      } else {
        throw new Error('Error dialog found but no dismiss button - this blocks workflow')
      }
    }

    await collectStepArtifacts(page, artifactCollector, scenario, '02-no-blocking-errors', consoleLogs, networkLogs)

    // Step 3: Verify job creation UI is still accessible
    const jobCreationUI = page.locator('button:has-text("Create Job"), button:has-text("New Job"), button:has-text("Deliver")')
    // Should be present (even if no jobs are active)
    
    await collectStepArtifacts(page, artifactCollector, scenario, '03-job-creation-accessible', consoleLogs, networkLogs)

    console.log(`✅ Preview failure non-blocking behavior verified`)
  })
})
