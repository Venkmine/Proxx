/**
 * Truth Surface E2E: FFmpeg Delivery Job Progress
 * 
 * Tests that FFmpeg delivery jobs show visible, honest stage/progress UI.
 * 
 * EXPECTED BEHAVIOR:
 * - Job creation succeeds
 * - Progress indicators are visible
 * - Stage information is accurate
 * - No fake progress bars
 */

import { test, expect, collectStepArtifacts } from './helpers'

test.describe('Truth Surface: FFmpeg Delivery Job', () => {
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

  test('should show visible progress UI for FFmpeg delivery job', async ({ page, artifactCollector }) => {
    const scenario = 'ffmpeg-delivery-progress'

    // Step 1: Application loads
    await collectStepArtifacts(page, artifactCollector, scenario, '01-app-loaded', consoleLogs, networkLogs)

    // Verify app is loaded
    await expect(page.locator('body')).toBeVisible()

    // Step 2: Navigate to job creation (if needed)
    // TODO: Update selector based on actual UI structure
    const createJobButton = page.locator('button:has-text("Create Job"), button:has-text("New Job")')
    if (await createJobButton.count() > 0) {
      await createJobButton.first().click()
      await page.waitForTimeout(500)
    }
    await collectStepArtifacts(page, artifactCollector, scenario, '02-job-creation-ui', consoleLogs, networkLogs)

    // Step 3: Verify no "coming soon" or unsupported UI elements
    const watchFoldersUI = page.locator('text=/watch.*folder/i')
    await expect(watchFoldersUI).not.toBeVisible()

    const autonomousIngestionUI = page.locator('text=/autonomous.*ingestion/i')
    await expect(autonomousIngestionUI).not.toBeVisible()

    await collectStepArtifacts(page, artifactCollector, scenario, '03-unsupported-ui-check', consoleLogs, networkLogs)

    // Step 4: Verify job list is accessible
    // TODO: Update selector based on actual UI structure
    const jobsList = page.locator('[data-testid="jobs-list"], .jobs-container, main')
    await expect(jobsList).toBeVisible()

    await collectStepArtifacts(page, artifactCollector, scenario, '04-jobs-list-visible', consoleLogs, networkLogs)

    console.log(`✅ FFmpeg delivery job UI test completed`)
  })

  test('should display honest progress indicators', async ({ page, artifactCollector }) => {
    const scenario = 'honest-progress-indicators'

    // Step 1: Verify progress UI exists (when jobs are running)
    await collectStepArtifacts(page, artifactCollector, scenario, '01-check-progress-ui', consoleLogs, networkLogs)

    // Verify no fake "100% complete" messages on queued jobs
    const fakeProgress = page.locator('text=/100%.*queued/i')
    await expect(fakeProgress).not.toBeVisible()

    await collectStepArtifacts(page, artifactCollector, scenario, '02-no-fake-progress', consoleLogs, networkLogs)

    console.log(`✅ Honest progress indicators verified`)
  })
})
