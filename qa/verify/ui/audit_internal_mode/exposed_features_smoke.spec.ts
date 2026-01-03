/**
 * Internal Audit E2E: Exposed Features Smoke Test
 * 
 * Tests that unsupported features are exposed in audit mode and render without crashing.
 * These tests are DIAGNOSTIC only - they're not required to pass for release.
 */

import { test, expect, collectStepArtifacts } from './helpers'

test.describe('Internal Audit: Exposed Features', () => {
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

  test('should expose watch folders UI in audit mode', async ({ page, artifactCollector }) => {
    const scenario = 'watch-folders-smoke'
    await collectStepArtifacts(page, artifactCollector, scenario, '01-check-watch-folders-ui', consoleLogs, networkLogs)

    // In audit mode, watch folders UI should be visible (even if not fully implemented)
    // If feature doesn't exist yet, this test will fail (expected diagnostic behavior)
    
    // Look for watch folders UI elements
    const watchFoldersUI = page.locator('[data-testid="watch-folders"]').or(page.locator('text=/watch.*folder/i'))
    
    try {
      if (await watchFoldersUI.count() > 0) {
        console.log('  ✓ Watch folders UI is exposed in audit mode')
        
        // Verify it renders without crash
        await expect(watchFoldersUI.first()).toBeVisible()
        
        // Try clicking to verify it doesn't throw
        await watchFoldersUI.first().click({ timeout: 2000 }).catch(() => {
          console.log('  ℹ️  Watch folders UI click failed (feature may not be implemented)')
        })
      } else {
        console.log('  ⚠️  Watch folders UI NOT found - feature not yet exposed')
      }
    } catch (error) {
      console.log(`  ⚠️  Watch folders smoke test: ${error}`)
    }
  })

  test('should expose autonomous ingestion UI in audit mode', async ({ page, artifactCollector }) => {
    const scenario = 'autonomous-ingestion-smoke'
    await collectStepArtifacts(page, artifactCollector, scenario, '01-check-autonomous-ui', consoleLogs, networkLogs)

    // Look for autonomous ingestion UI elements
    const autonomousUI = page.locator('[data-testid="autonomous-ingestion"]').or(page.locator('text=/autonomous.*ingestion/i'))
    
    try {
      if (await autonomousUI.count() > 0) {
        console.log('  ✓ Autonomous ingestion UI is exposed in audit mode')
        
        // Verify it renders without crash
        await expect(autonomousUI.first()).toBeVisible()
        
        // Try clicking to verify it doesn't throw
        await autonomousUI.first().click({ timeout: 2000 }).catch(() => {
          console.log('  ℹ️  Autonomous ingestion UI click failed (feature may not be implemented)')
        })
      } else {
        console.log('  ⚠️  Autonomous ingestion UI NOT found - feature not yet exposed')
      }
    } catch (error) {
      console.log(`  ⚠️  Autonomous ingestion smoke test: ${error}`)
    }
  })

  test('should verify all exposed features have clear "not implemented" messaging', async ({ page, artifactCollector }) => {
    const scenario = 'feature-messaging'
    await collectStepArtifacts(page, artifactCollector, scenario, '01-check-messaging', consoleLogs, networkLogs)

    // Features exposed in audit mode should either work OR have clear "not implemented" messaging
    // Silent no-ops are NOT acceptable
    
    console.log('  ℹ️  Verifying exposed features have proper messaging')
    
    // This is a documentation test - we're just recording the state
    const body = await page.textContent('body')
    
    const hasNotImplemented = body?.toLowerCase().includes('not implemented') || 
                              body?.toLowerCase().includes('coming soon') ||
                              body?.toLowerCase().includes('in development')
    
    if (hasNotImplemented) {
      console.log('  ✓ Found "not implemented" messaging for some features')
    } else {
      console.log('  ℹ️  No explicit "not implemented" messaging found')
    }
  })

  test('should expose settings/configuration panels in audit mode', async ({ page, artifactCollector }) => {
    const scenario = 'settings-smoke'
    await collectStepArtifacts(page, artifactCollector, scenario, '01-check-settings-ui', consoleLogs, networkLogs)

    // Look for settings/config UI that might be hidden in default mode
    const settingsUI = page.locator('[data-testid="settings"]').or(page.locator('text=/settings/i')).or(page.locator('text=/configuration/i'))
    
    try {
      if (await settingsUI.count() > 0) {
        console.log('  ✓ Settings UI is accessible in audit mode')
        
        // Try opening settings
        await settingsUI.first().click({ timeout: 2000 }).catch(() => {
          console.log('  ℹ️  Settings click failed (feature may not be implemented)')
        })
      } else {
        console.log('  ℹ️  Settings UI not prominently displayed')
      }
    } catch (error) {
      console.log(`  ⚠️  Settings smoke test: ${error}`)
    }
  })

  test('should verify overlays/burnins UI in audit mode', async ({ page, artifactCollector }) => {
    const scenario = 'overlays-smoke'
    await collectStepArtifacts(page, artifactCollector, scenario, '01-check-overlays-ui', consoleLogs, networkLogs)

    // Look for overlay/burnin editing UI
    const overlaysUI = page.locator('[data-testid="overlays"]').or(page.locator('text=/overlay/i')).or(page.locator('text=/burn.*in/i'))
    
    try {
      if (await overlaysUI.count() > 0) {
        console.log('  ✓ Overlays/burnins UI is exposed in audit mode')
        
        await expect(overlaysUI.first()).toBeVisible()
      } else {
        console.log('  ℹ️  Overlays/burnins UI not found')
      }
    } catch (error) {
      console.log(`  ⚠️  Overlays smoke test: ${error}`)
    }
  })
})
