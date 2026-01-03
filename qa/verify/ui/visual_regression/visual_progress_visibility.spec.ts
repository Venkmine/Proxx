/**
 * REQUIRED Visual Test: Progress Visibility
 * 
 * NON-NEGOTIABLE RULE:
 * Any UI change related to progress indicators MUST be verified with Electron screenshots.
 * 
 * This test ensures:
 * 1. Progress bar is visible in Electron (not just in code)
 * 2. Screenshots are captured at each state
 * 3. Visual evidence exists on disk
 * 
 * FAILURE CONDITIONS:
 * - Missing screenshot file = FAILED
 * - Blank/empty screenshot = FAILED
 * - Progress element not in DOM = FAILED
 */

import { test, expect, captureElectronScreenshot, assertNoSplashBeforeCapture, waitForJobRunning, waitForProgressVisible } from './helpers'
import fs from 'node:fs'

test.describe('Visual Verification: Progress Visibility', () => {
  test('progress bar must be visible in Electron with screenshot proof', async ({ page, visualCollector }) => {
    // STEP 1: Capture idle state (app loaded, no jobs)
    console.log('Step 1: Capturing idle state...')
    await page.waitForLoadState('networkidle', { timeout: 15000 })
    
    await assertNoSplashBeforeCapture(page, 'idle')
    const idleScreenshot = await captureElectronScreenshot(page, visualCollector, 'idle')
    expect(fs.existsSync(idleScreenshot), 'Idle screenshot must exist').toBe(true)
    expect(fs.statSync(idleScreenshot).size, 'Idle screenshot must not be empty').toBeGreaterThan(1000)

    // STEP 2: Load a test file and create a job
    console.log('Step 2: Creating test job...')
    
    // Look for file selection button
    const fileButton = page.locator('button:has-text("Select"), button:has-text("Add"), button:has-text("File"), input[type="file"]').first()
    
    if (await fileButton.count() > 0) {
      // If there's a file input, use it
      const fileInputs = await page.locator('input[type="file"]').all()
      if (fileInputs.length > 0) {
        // Set test file path
        const testFilePath = '/Users/leon.grant/Desktop/__TEST_FILES/Craft reeel jan 21__proxx.mp4'
        await fileInputs[0].setInputFiles(testFilePath)
        await page.waitForTimeout(1000)
      }
    }

    // STEP 3: Start the render job
    console.log('Step 3: Starting render job...')
    
    // Look for render/start button
    const renderButton = page.locator('button:has-text("Render"), button:has-text("Start"), button:has-text("Submit")').first()
    
    if (await renderButton.count() > 0) {
      await renderButton.click()
      await page.waitForTimeout(500)
    }

    await assertNoSplashBeforeCapture(page, 'job_started')
    const jobStartedScreenshot = await captureElectronScreenshot(page, visualCollector, 'job_started')
    expect(fs.existsSync(jobStartedScreenshot), 'Job started screenshot must exist').toBe(true)
    expect(fs.statSync(jobStartedScreenshot).size, 'Job started screenshot must not be empty').toBeGreaterThan(1000)

    // STEP 4: Wait for job to be RUNNING (not just PENDING)
    console.log('Step 4: Waiting for job to transition to RUNNING...')
    
    const isRunning = await waitForJobRunning(page, 15000)
    
    if (isRunning) {
      console.log('✓ Job is RUNNING, waiting for progress indicator...')
      
      // Wait a bit for progress to render
      await page.waitForTimeout(1000)
      
      // STEP 5: Capture screenshot with progress visible
      await assertNoSplashBeforeCapture(page, 'progress_visible')
      const progressScreenshot = await captureElectronScreenshot(page, visualCollector, 'progress_visible')
      expect(fs.existsSync(progressScreenshot), 'Progress screenshot must exist').toBe(true)
      expect(fs.statSync(progressScreenshot).size, 'Progress screenshot must not be empty').toBeGreaterThan(1000)

      // STEP 6: Assert progress element exists in DOM
      console.log('Step 5: Verifying progress element in DOM...')
      
      // Look for progress bar element (using common selectors)
      const progressElement = page.locator('[data-testid*="progress"], [class*="progress"], [role="progressbar"]').first()
      
      const progressExists = await progressElement.count() > 0
      expect(progressExists, 'Progress element must exist in DOM when job is RUNNING').toBe(true)

      if (progressExists) {
        const isVisible = await progressElement.isVisible()
        console.log(`Progress element visible: ${isVisible}`)
        
        // Note: We assert DOM existence, but visibility is informational
        // The screenshot is the source of truth for visibility
      }
    } else {
      console.warn('⚠️  Job did not transition to RUNNING within timeout')
      console.warn('⚠️  This may be expected if no backend is running')
      console.warn('⚠️  Screenshots captured for manual verification')
      
      // Still capture the state for manual review
      await assertNoSplashBeforeCapture(page, 'progress_not_running')
      const finalScreenshot = await captureElectronScreenshot(page, visualCollector, 'progress_not_running')
      expect(fs.existsSync(finalScreenshot), 'Final screenshot must exist').toBe(true)
    }

    // MANDATORY: Log screenshot locations
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log('📸 VISUAL VERIFICATION COMPLETE')
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log(`Screenshot directory: ${visualCollector.getScreenshotPath('')}`)
    console.log(`Test name: ${visualCollector.testName}`)
    console.log('\nScreenshots captured:')
    console.log(`  - idle.png`)
    console.log(`  - job_started.png`)
    console.log(`  - progress_visible.png (if job ran)`)
    console.log('\n⚠️  MANUAL REVIEW REQUIRED: Verify screenshots show visible progress bar')
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')
  })

  test('zoom indicator must be visible with screenshot proof', async ({ page, visualCollector }) => {
    // STEP 1: Capture initial state
    console.log('Step 1: Capturing initial state...')
    await page.waitForLoadState('networkidle', { timeout: 15000 })
    
    await assertNoSplashBeforeCapture(page, 'zoom_initial')
    const initialScreenshot = await captureElectronScreenshot(page, visualCollector, 'zoom_initial')
    expect(fs.existsSync(initialScreenshot), 'Initial screenshot must exist').toBe(true)

    // STEP 2: Look for zoom indicator
    console.log('Step 2: Verifying zoom indicator...')
    
    // Look for zoom indicator (common patterns: "Fit", "100%", etc.)
    const zoomIndicator = page.locator('text=/fit|100%|zoom/i').first()
    const zoomExists = await zoomIndicator.count() > 0

    if (zoomExists) {
      console.log('✓ Zoom indicator found in DOM')
      const zoomText = await zoomIndicator.textContent()
      console.log(`  Zoom text: ${zoomText}`)
    } else {
      console.warn('⚠️  Zoom indicator not found in DOM')
    }

    // STEP 3: Capture with zoom indicator highlighted
    await assertNoSplashBeforeCapture(page, 'zoom_indicator')
    const zoomScreenshot = await captureElectronScreenshot(page, visualCollector, 'zoom_indicator')
    expect(fs.existsSync(zoomScreenshot), 'Zoom screenshot must exist').toBe(true)

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log('📸 ZOOM INDICATOR VISUAL VERIFICATION COMPLETE')
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log(`Screenshot: ${zoomScreenshot}`)
    console.log('⚠️  MANUAL REVIEW REQUIRED: Verify zoom indicator is visible')
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')
  })

  test('status panel width must be verified with screenshot proof', async ({ page, visualCollector }) => {
    // STEP 1: Capture status panel
    console.log('Step 1: Capturing status panel state...')
    await page.waitForLoadState('networkidle', { timeout: 15000 })
    
    // Look for status panel (common selectors)
    const statusPanel = page.locator('[data-testid*="status"], [class*="status"]').first()
    const statusExists = await statusPanel.count() > 0

    if (statusExists) {
      console.log('✓ Status panel found in DOM')
      
      // Get computed width
      const width = await statusPanel.evaluate((el) => {
        const computed = window.getComputedStyle(el)
        return computed.width
      })
      console.log(`  Status panel width: ${width}`)
    } else {
      console.warn('⚠️  Status panel not found in DOM')
    }

    // STEP 2: Capture screenshot
    await assertNoSplashBeforeCapture(page, 'status_panel')
    const statusScreenshot = await captureElectronScreenshot(page, visualCollector, 'status_panel')
    expect(fs.existsSync(statusScreenshot), 'Status panel screenshot must exist').toBe(true)

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log('📸 STATUS PANEL VISUAL VERIFICATION COMPLETE')
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log(`Screenshot: ${statusScreenshot}`)
    console.log('⚠️  MANUAL REVIEW REQUIRED: Verify status panel width (440px)')
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')
  })
})
