/**
 * Truth Surface E2E: Unsupported Features Hidden
 * 
 * Tests that unsupported features are NOT visible in default mode.
 * 
 * EXPECTED BEHAVIOR:
 * - Watch folders UI is NOT visible
 * - Autonomous ingestion UI is NOT visible
 * - Any disabled modules are absent or inert
 * - No "coming soon" messaging in production UI
 */

import { test, expect, collectStepArtifacts } from './helpers'

test.describe('Truth Surface: Unsupported Features Hidden', () => {
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

  test('should not show watch folders UI in default mode', async ({ page, artifactCollector }) => {
    const scenario = 'watch-folders-hidden'

    // Step 1: Application loads
    await collectStepArtifacts(page, artifactCollector, scenario, '01-app-loaded', consoleLogs, networkLogs)

    // Step 2: Verify watch folders UI is not visible
    const watchFoldersUI = page.locator('[data-testid="watch-folders"]').or(page.locator('text=/watch.*folder/i'))
    await expect(watchFoldersUI).not.toBeVisible()

    await collectStepArtifacts(page, artifactCollector, scenario, '02-no-watch-folders-ui', consoleLogs, networkLogs)

    console.log(`✅ Watch folders UI is hidden (as expected)`)
  })

  test('should not show autonomous ingestion UI in default mode', async ({ page, artifactCollector }) => {
    const scenario = 'autonomous-ingestion-hidden'

    // Step 1: Check for autonomous ingestion UI
    await collectStepArtifacts(page, artifactCollector, scenario, '01-check-autonomous-ui', consoleLogs, networkLogs)

    const autonomousUI = page.locator('[data-testid="autonomous-ingestion"]').or(page.locator('text=/autonomous.*ingestion/i'))
    await expect(autonomousUI).not.toBeVisible()

    await collectStepArtifacts(page, artifactCollector, scenario, '02-no-autonomous-ui', consoleLogs, networkLogs)

    console.log(`✅ Autonomous ingestion UI is hidden (as expected)`)
  })

  test('should not show "coming soon" messaging in default mode', async ({ page, artifactCollector }) => {
    const scenario = 'no-coming-soon'

    // Step 1: Check for "coming soon" or similar messaging
    await collectStepArtifacts(page, artifactCollector, scenario, '01-check-coming-soon', consoleLogs, networkLogs)

    const comingSoonUI = page.locator('text=/coming soon/i').or(page.locator('text=/under development/i')).or(page.locator('text=/not yet available/i'))
    await expect(comingSoonUI).not.toBeVisible()

    await collectStepArtifacts(page, artifactCollector, scenario, '02-no-coming-soon', consoleLogs, networkLogs)

    console.log(`✅ No "coming soon" messaging found (UI is truthful)`)
  })

  test('should verify no E2E_AUDIT_MODE banner in default mode', async ({ page, artifactCollector }) => {
    const scenario = 'no-audit-banner'

    // Step 1: Check that audit mode banner is NOT present
    await collectStepArtifacts(page, artifactCollector, scenario, '01-check-audit-banner', consoleLogs, networkLogs)

    const auditBanner = page.locator('[data-testid="audit-mode-banner"]')
    await expect(auditBanner).not.toBeVisible()

    await collectStepArtifacts(page, artifactCollector, scenario, '02-no-audit-banner', consoleLogs, networkLogs)

    console.log(`✅ No audit mode banner (running in default mode)`)
  })
})
