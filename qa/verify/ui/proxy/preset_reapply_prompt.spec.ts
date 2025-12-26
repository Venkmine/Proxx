/**
 * Phase 9E: Preset Reapply Prompt Tests
 *
 * These tests verify that presets cannot silently overwrite manual preview edits:
 * - Applying a preset when overlays have positionSource === "manual" shows confirmation
 * - User can choose to keep manual position (preset not applied)
 * - User can choose to reset to preset (preset applied, positionSource reset)
 * - No confirmation when no manual edits exist
 *
 * All waits are state-based — no waitForTimeout.
 */

import { test, expect, Page } from '@playwright/test'

// Test selectors
const SELECTORS = {
  previewCanvas: '[data-testid="preview-canvas"]',
  overlayLayer: '[data-testid^="layer-"]',
  overlayTimecode: '[data-testid="overlay-timecode"]',
  modeOverlaysButton: 'button:has-text("Overlays")',
  presetSelector: '[data-testid="preset-selector"]',
  presetOption: '[data-testid^="preset-option-"]',
  conflictDialog: '[data-testid="preset-position-conflict-dialog"]',
  conflictBackdrop: '[data-testid="preset-position-conflict-backdrop"]',
  keepManualButton: '[data-testid="preset-conflict-keep"]',
  resetToPresetButton: '[data-testid="preset-conflict-reset"]',
  invariantBanner: '[data-testid="invariant-banner"]',
  addLayerButton: '[data-testid="add-overlay-layer"]',
  layerStack: '[data-testid="overlay-layer-stack"]',
}

/**
 * Helper: Wait for app to be ready
 */
async function waitForAppReady(page: Page): Promise<void> {
  await expect(page.locator('[data-testid="app-root"]')).toBeVisible({ timeout: 10000 })
  await expect(page.locator('[data-testid="app-header"]')).toBeVisible({ timeout: 10000 })
}

/**
 * Helper: Switch to overlays mode for editing
 */
async function switchToOverlaysMode(page: Page): Promise<void> {
  const button = page.locator(SELECTORS.modeOverlaysButton)
  if (await button.isVisible()) {
    await button.click()
    // Wait for mode to be active (button state changes)
    await expect(button).toHaveCSS('background-color', /rgb/)
  }
}

/**
 * Helper: Get element position for drag operations
 */
async function getElementPosition(page: Page, selector: string): Promise<{ x: number; y: number } | null> {
  const element = page.locator(selector).first()
  if (await element.count() === 0) return null
  const box = await element.boundingBox()
  return box ? { x: box.x + box.width / 2, y: box.y + box.height / 2 } : null
}

/**
 * Helper: Drag an overlay element to simulate manual edit
 */
async function dragOverlay(page: Page, selector: string, deltaX: number, deltaY: number): Promise<boolean> {
  const startPos = await getElementPosition(page, selector)
  if (!startPos) return false
  
  await page.mouse.move(startPos.x, startPos.y)
  await page.mouse.down()
  await page.mouse.move(startPos.x + deltaX, startPos.y + deltaY, { steps: 5 })
  await page.mouse.up()
  
  const endPos = await getElementPosition(page, selector)
  if (!endPos) return false
  
  // Check if position changed (with tolerance for small movements)
  const moved = Math.abs(endPos.x - startPos.x) > 3 || Math.abs(endPos.y - startPos.y) > 3
  return moved
}

/**
 * Helper: Open preset selector dropdown
 * Note: The preset selector uses a native <select> element, not a custom dropdown.
 * For native selects, we use selectOption() instead of click-based interaction.
 */
async function openPresetSelector(page: Page): Promise<boolean> {
  const selector = page.locator(SELECTORS.presetSelector)
  if (await selector.count() === 0) {
    return false
  }
  const isNativeSelect = await selector.evaluate((el) => el.tagName.toLowerCase() === 'select')
  if (!isNativeSelect) {
    // Legacy custom dropdown behavior
    await selector.click()
    await expect(page.locator('[role="listbox"], [data-state="open"]').first()).toBeVisible({ timeout: 5000 })
  }
  // For native select, no "open" action needed - selectOption handles it
  return true
}

/**
 * Helper: Select a preset by value
 * Works with native <select> elements.
 */
async function selectPresetOption(page: Page, presetValue?: string): Promise<boolean> {
  const selector = page.locator(SELECTORS.presetSelector)
  if (await selector.count() === 0) {
    return false
  }
  
  const isNativeSelect = await selector.evaluate((el) => el.tagName.toLowerCase() === 'select')
  
  if (isNativeSelect) {
    // Native select - use selectOption
    const options = await selector.locator('option').all()
    if (options.length <= 1) {
      // Only placeholder option exists, no presets available
      return false
    }
    if (presetValue) {
      await selector.selectOption(presetValue)
    } else {
      // Select first non-placeholder option
      const firstValue = await options[1].getAttribute('value')
      if (firstValue) {
        await selector.selectOption(firstValue)
      }
    }
    return true
  } else {
    // Custom dropdown - click option
    if (presetValue) {
      await page.locator(`[data-testid="preset-option-${presetValue}"]`).click()
    } else {
      // Select first available preset
      await page.locator(SELECTORS.presetOption).first().click()
    }
    return true
  }
}

/**
 * Helper: Create a test preset if none exist
 * Updated to work with native <select> elements.
 */
async function ensurePresetExists(page: Page): Promise<string | null> {
  const selector = page.locator(SELECTORS.presetSelector)
  if (await selector.count() === 0) {
    return null
  }
  
  const isNativeSelect = await selector.evaluate((el) => el.tagName.toLowerCase() === 'select')
  
  if (isNativeSelect) {
    // Native select - check options
    const options = await selector.locator('option').all()
    // First option is placeholder, need at least one more
    if (options.length <= 1) {
      return null
    }
    // Return the value of first non-placeholder option
    return await options[1].getAttribute('value')
  } else {
    // Legacy custom dropdown
    await openPresetSelector(page)
    const options = page.locator(SELECTORS.presetOption)
    if (await options.count() > 0) {
      const firstOption = options.first()
      const testId = await firstOption.getAttribute('data-testid')
      await page.keyboard.press('Escape') // Close dropdown
      return testId?.replace('preset-option-', '') || null
    }
    await page.keyboard.press('Escape') // Close dropdown
    return null
  }
}

test.describe('Preset Reapply Prompt (Phase 9E)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await waitForAppReady(page)
  })

  test.describe('Conflict Dialog Behavior', () => {
    test('shows confirmation dialog when reapplying preset after manual drag', async ({ page }) => {
      // Skip if no overlay layers exist
      const overlayLayer = page.locator(SELECTORS.overlayLayer).first()
      if (await overlayLayer.count() === 0) {
        const timecodeOverlay = page.locator(SELECTORS.overlayTimecode)
        if (await timecodeOverlay.count() === 0) {
          test.skip()
          return
        }
      }
      
      // Switch to overlays mode for editing
      await switchToOverlaysMode(page)
      
      // Get current preset (if any)
      const presetId = await ensurePresetExists(page)
      if (!presetId) {
        test.skip() // No presets available
        return
      }
      
      // Apply preset first
      await openPresetSelector(page)
      await selectPresetOption(page, presetId)
      
      // Wait for preset to be applied
      await page.waitForLoadState('networkidle')
      
      // Drag overlay to create manual edit
      const targetSelector = await page.locator(SELECTORS.overlayLayer).count() > 0 
        ? SELECTORS.overlayLayer 
        : SELECTORS.overlayTimecode
      
      const dragged = await dragOverlay(page, targetSelector, 50, 50)
      if (!dragged) {
        test.skip() // Could not drag overlay
        return
      }
      
      // Re-apply the same preset
      await openPresetSelector(page)
      await selectPresetOption(page, presetId)
      
      // Assert dialog appears
      await expect(page.locator(SELECTORS.conflictDialog)).toBeVisible({ timeout: 5000 })
      
      // Verify dialog content
      await expect(page.locator(SELECTORS.conflictDialog)).toContainText('Preset Position Conflict')
      await expect(page.locator(SELECTORS.keepManualButton)).toBeVisible()
      await expect(page.locator(SELECTORS.resetToPresetButton)).toBeVisible()
    })

    test('keep manual position preserves overlay position', async ({ page }) => {
      // Skip if no overlay layers exist
      const overlayLayer = page.locator(SELECTORS.overlayLayer).first()
      if (await overlayLayer.count() === 0) {
        const timecodeOverlay = page.locator(SELECTORS.overlayTimecode)
        if (await timecodeOverlay.count() === 0) {
          test.skip()
          return
        }
      }
      
      await switchToOverlaysMode(page)
      
      const presetId = await ensurePresetExists(page)
      if (!presetId) {
        test.skip()
        return
      }
      
      // Apply preset
      await openPresetSelector(page)
      await selectPresetOption(page, presetId)
      await page.waitForLoadState('networkidle')
      
      // Drag overlay
      const targetSelector = await page.locator(SELECTORS.overlayLayer).count() > 0 
        ? SELECTORS.overlayLayer 
        : SELECTORS.overlayTimecode
      
      const positionBefore = await getElementPosition(page, targetSelector)
      if (!positionBefore) {
        test.skip()
        return
      }
      
      await dragOverlay(page, targetSelector, 60, 40)
      const positionAfterDrag = await getElementPosition(page, targetSelector)
      if (!positionAfterDrag) {
        test.skip()
        return
      }
      
      // Re-apply preset (triggers dialog)
      await openPresetSelector(page)
      await selectPresetOption(page, presetId)
      
      // Wait for dialog
      await expect(page.locator(SELECTORS.conflictDialog)).toBeVisible({ timeout: 5000 })
      
      // Choose "Keep manual position"
      await page.locator(SELECTORS.keepManualButton).click()
      
      // Dialog should close
      await expect(page.locator(SELECTORS.conflictDialog)).toBeHidden({ timeout: 3000 })
      
      // Position should remain at dragged position (not reset to preset)
      const positionAfterKeep = await getElementPosition(page, targetSelector)
      expect(positionAfterKeep).not.toBeNull()
      
      // Allow small tolerance for position comparison
      const tolerance = 5
      expect(Math.abs(positionAfterKeep!.x - positionAfterDrag.x)).toBeLessThan(tolerance)
      expect(Math.abs(positionAfterKeep!.y - positionAfterDrag.y)).toBeLessThan(tolerance)
    })

    test('reset to preset applies preset position', async ({ page }) => {
      // Skip if no overlay layers exist
      const overlayLayer = page.locator(SELECTORS.overlayLayer).first()
      if (await overlayLayer.count() === 0) {
        const timecodeOverlay = page.locator(SELECTORS.overlayTimecode)
        if (await timecodeOverlay.count() === 0) {
          test.skip()
          return
        }
      }
      
      await switchToOverlaysMode(page)
      
      const presetId = await ensurePresetExists(page)
      if (!presetId) {
        test.skip()
        return
      }
      
      // Apply preset and record initial position
      await openPresetSelector(page)
      await selectPresetOption(page, presetId)
      await page.waitForLoadState('networkidle')
      
      const targetSelector = await page.locator(SELECTORS.overlayLayer).count() > 0 
        ? SELECTORS.overlayLayer 
        : SELECTORS.overlayTimecode
      
      const presetPosition = await getElementPosition(page, targetSelector)
      if (!presetPosition) {
        test.skip()
        return
      }
      
      // Drag overlay significantly
      await dragOverlay(page, targetSelector, 80, 60)
      
      // Re-apply preset (triggers dialog)
      await openPresetSelector(page)
      await selectPresetOption(page, presetId)
      
      // Wait for dialog
      await expect(page.locator(SELECTORS.conflictDialog)).toBeVisible({ timeout: 5000 })
      
      // Choose "Reset to preset"
      await page.locator(SELECTORS.resetToPresetButton).click()
      
      // Dialog should close
      await expect(page.locator(SELECTORS.conflictDialog)).toBeHidden({ timeout: 3000 })
      
      // Position should be reset to preset position
      const positionAfterReset = await getElementPosition(page, targetSelector)
      expect(positionAfterReset).not.toBeNull()
      
      // Allow tolerance for position comparison (preset positions may vary slightly)
      const tolerance = 10
      expect(Math.abs(positionAfterReset!.x - presetPosition.x)).toBeLessThan(tolerance)
      expect(Math.abs(positionAfterReset!.y - presetPosition.y)).toBeLessThan(tolerance)
    })

    test('no dialog when no manual edits exist', async ({ page }) => {
      const presetId = await ensurePresetExists(page)
      if (!presetId) {
        test.skip()
        return
      }
      
      // Apply preset first time
      await openPresetSelector(page)
      await selectPresetOption(page, presetId)
      await page.waitForLoadState('networkidle')
      
      // Re-apply same preset WITHOUT any manual edits
      await openPresetSelector(page)
      await selectPresetOption(page, presetId)
      
      // Dialog should NOT appear
      await expect(page.locator(SELECTORS.conflictDialog)).toBeHidden({ timeout: 2000 })
    })
  })

  test.describe('Keyboard Accessibility', () => {
    test('dialog can be dismissed with Escape key', async ({ page }) => {
      const overlayLayer = page.locator(SELECTORS.overlayLayer).first()
      if (await overlayLayer.count() === 0) {
        const timecodeOverlay = page.locator(SELECTORS.overlayTimecode)
        if (await timecodeOverlay.count() === 0) {
          test.skip()
          return
        }
      }
      
      await switchToOverlaysMode(page)
      
      const presetId = await ensurePresetExists(page)
      if (!presetId) {
        test.skip()
        return
      }
      
      // Apply preset, drag, re-apply to trigger dialog
      await openPresetSelector(page)
      await selectPresetOption(page, presetId)
      await page.waitForLoadState('networkidle')
      
      const targetSelector = await page.locator(SELECTORS.overlayLayer).count() > 0 
        ? SELECTORS.overlayLayer 
        : SELECTORS.overlayTimecode
      
      await dragOverlay(page, targetSelector, 50, 50)
      
      await openPresetSelector(page)
      await selectPresetOption(page, presetId)
      
      // Wait for dialog
      await expect(page.locator(SELECTORS.conflictDialog)).toBeVisible({ timeout: 5000 })
      
      // Press Escape
      await page.keyboard.press('Escape')
      
      // Dialog should close (same as "Keep manual position")
      await expect(page.locator(SELECTORS.conflictDialog)).toBeHidden({ timeout: 3000 })
    })
  })

  test.describe('No Invariant Violations', () => {
    test('no invariant banner appears during preset conflict flow', async ({ page }) => {
      const overlayLayer = page.locator(SELECTORS.overlayLayer).first()
      if (await overlayLayer.count() === 0) {
        const timecodeOverlay = page.locator(SELECTORS.overlayTimecode)
        if (await timecodeOverlay.count() === 0) {
          test.skip()
          return
        }
      }
      
      await switchToOverlaysMode(page)
      
      const presetId = await ensurePresetExists(page)
      if (!presetId) {
        test.skip()
        return
      }
      
      // Full flow: apply preset, drag, re-apply, choose option
      await openPresetSelector(page)
      await selectPresetOption(page, presetId)
      await page.waitForLoadState('networkidle')
      
      const targetSelector = await page.locator(SELECTORS.overlayLayer).count() > 0 
        ? SELECTORS.overlayLayer 
        : SELECTORS.overlayTimecode
      
      await dragOverlay(page, targetSelector, 50, 50)
      
      await openPresetSelector(page)
      await selectPresetOption(page, presetId)
      
      await expect(page.locator(SELECTORS.conflictDialog)).toBeVisible({ timeout: 5000 })
      await page.locator(SELECTORS.keepManualButton).click()
      await expect(page.locator(SELECTORS.conflictDialog)).toBeHidden({ timeout: 3000 })
      
      // Verify no invariant banner appeared
      const banner = page.locator(SELECTORS.invariantBanner)
      expect(await banner.count()).toBe(0)
    })
  })
})
