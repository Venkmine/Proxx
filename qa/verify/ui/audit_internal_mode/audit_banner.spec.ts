/**
 * Internal Audit E2E: Audit Mode Banner
 * 
 * Tests that the audit mode banner is visible when E2E_AUDIT_MODE=1.
 */

import { test, expect } from './helpers'

test.describe('Internal Audit: Banner Visibility', () => {
  test('should show audit mode banner when E2E_AUDIT_MODE=1', async ({ page }) => {
    // Verify banner is visible
    const banner = page.locator('[data-testid="audit-mode-banner"], text=/INTERNAL AUDIT MODE/i')
    await expect(banner).toBeVisible()

    // Verify banner text
    await expect(banner).toContainText('INTERNAL AUDIT MODE')
    await expect(banner).toContainText('UNSUPPORTED FEATURES')

    console.log('✅ Audit mode banner is visible')
  })

  test('should verify banner is prominent and not dismissible', async ({ page }) => {
    const banner = page.locator('[data-testid="audit-mode-banner"]')
    await expect(banner).toBeVisible()

    // Banner should not have close/dismiss button
    const dismissButton = banner.locator('button:has-text("Close"), button:has-text("Dismiss"), button:has-text("×")')
    await expect(dismissButton).not.toBeVisible()

    console.log('✅ Banner is persistent (non-dismissible)')
  })
})
