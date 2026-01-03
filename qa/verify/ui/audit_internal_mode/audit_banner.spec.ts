/**
 * Internal Audit E2E: Audit Mode Banner
 * 
 * Tests that the audit mode banner is visible when E2E_AUDIT_MODE=1.
 */

import { test, expect, collectStepArtifacts } from './helpers'

test.describe('Internal Audit: Banner Visibility', () => {
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

  test('should show audit mode banner when E2E_AUDIT_MODE=1', async ({ page, artifactCollector }) => {
    const scenario = 'audit-banner-visible'

    // Step 1: App loaded
    await collectStepArtifacts(page, artifactCollector, scenario, '01-app-loaded', consoleLogs, networkLogs)

    // Step 2: Verify banner is visible
    const banner = page.locator('[data-testid="audit-mode-banner"]')
    await expect(banner).toBeVisible()

    // Verify banner text
    await expect(banner).toContainText('INTERNAL AUDIT MODE')
    await expect(banner).toContainText('Unsupported features exposed for testing only')

    await collectStepArtifacts(page, artifactCollector, scenario, '02-banner-visible', consoleLogs, networkLogs)

    console.log('✅ Audit mode banner is visible')
  })

  test('should verify banner is prominent and not dismissible', async ({ page, artifactCollector }) => {
    const scenario = 'audit-banner-persistent'

    // Step 1: Check banner
    await collectStepArtifacts(page, artifactCollector, scenario, '01-banner-check', consoleLogs, networkLogs)

    const banner = page.locator('[data-testid="audit-mode-banner"]')
    await expect(banner).toBeVisible()

    // Banner should not have close/dismiss button
    const dismissButton = banner.locator('button:has-text("Close"), button:has-text("Dismiss"), button:has-text("×")')
    await expect(dismissButton).not.toBeVisible()

    await collectStepArtifacts(page, artifactCollector, scenario, '02-no-dismiss-button', consoleLogs, networkLogs)

    console.log('✅ Banner is persistent (non-dismissible)')
  })
})
