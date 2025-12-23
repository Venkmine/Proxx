/**
 * Phase 9D: Mode Interaction Boundaries Tests
 *
 * These tests verify that preview mode interaction rules are enforced:
 * - view mode: All overlay interactions blocked
 * - overlays mode: All overlay interactions allowed
 * - burn-in mode: Only timecode/metadata overlay interactions allowed
 *
 * The tests ensure the preview canvas never lies about what can be edited.
 */

import { test, expect, Page } from '@playwright/test'

// Test selectors
const SELECTORS = {
  previewCanvas: '[data-testid="preview-canvas"]',
  overlayTimecode: '[data-testid="overlay-timecode"]',
  overlayImage: '[data-testid="overlay-image"]',
  textLayer: '[data-testid^="layer-"]',
  modeViewButton: '[data-testid="mode-view"]',
  modeOverlaysButton: '[data-testid="mode-overlays"]',
  modeBurnInButton: '[data-testid="mode-burn-in"]',
  invariantBanner: '[data-testid="invariant-banner"]',
}

/**
 * Helper: Switch to a specific preview mode
 */
async function switchToMode(page: Page, mode: 'view' | 'overlays' | 'burn-in') {
  const selector = mode === 'view' 
    ? SELECTORS.modeViewButton 
    : mode === 'overlays' 
      ? SELECTORS.modeOverlaysButton 
      : SELECTORS.modeBurnInButton
  
  await page.click(selector)
  // Wait for mode transition
  await page.waitForTimeout(100)
}

/**
 * Helper: Get element position
 */
async function getElementPosition(page: Page, selector: string) {
  const element = await page.locator(selector).first()
  const box = await element.boundingBox()
  return box ? { x: box.x + box.width / 2, y: box.y + box.height / 2 } : null
}

/**
 * Helper: Attempt to drag an element
 */
async function attemptDrag(page: Page, selector: string, deltaX: number, deltaY: number) {
  const startPos = await getElementPosition(page, selector)
  if (!startPos) throw new Error(`Element not found: ${selector}`)
  
  await page.mouse.move(startPos.x, startPos.y)
  await page.mouse.down()
  await page.mouse.move(startPos.x + deltaX, startPos.y + deltaY)
  await page.mouse.up()
  
  const endPos = await getElementPosition(page, selector)
  return {
    startPos,
    endPos,
    moved: endPos ? (Math.abs(endPos.x - startPos.x) > 5 || Math.abs(endPos.y - startPos.y) > 5) : false
  }
}

test.describe('Mode Interaction Boundaries', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to app and wait for preview to load
    await page.goto('/')
    await page.waitForSelector(SELECTORS.previewCanvas, { timeout: 10000 })
  })

  test.describe('View Mode - All Interactions Blocked', () => {
    test('cannot drag timecode overlay in view mode', async ({ page }) => {
      await switchToMode(page, 'view')
      
      const timecodeOverlay = page.locator(SELECTORS.overlayTimecode)
      if (await timecodeOverlay.count() === 0) {
        test.skip()
        return
      }
      
      const result = await attemptDrag(page, SELECTORS.overlayTimecode, 50, 50)
      expect(result.moved).toBe(false)
    })

    test('cannot drag image overlay in view mode', async ({ page }) => {
      await switchToMode(page, 'view')
      
      const imageOverlay = page.locator(SELECTORS.overlayImage)
      if (await imageOverlay.count() === 0) {
        test.skip()
        return
      }
      
      const result = await attemptDrag(page, SELECTORS.overlayImage, 50, 50)
      expect(result.moved).toBe(false)
    })

    test('cursor is default in view mode', async ({ page }) => {
      await switchToMode(page, 'view')
      
      const timecodeOverlay = page.locator(SELECTORS.overlayTimecode)
      if (await timecodeOverlay.count() === 0) {
        test.skip()
        return
      }
      
      const cursor = await timecodeOverlay.evaluate((el) => 
        window.getComputedStyle(el).cursor
      )
      expect(cursor).toBe('default')
    })
  })

  test.describe('Overlays Mode - All Interactions Allowed', () => {
    test('can drag timecode overlay in overlays mode', async ({ page }) => {
      await switchToMode(page, 'overlays')
      
      const timecodeOverlay = page.locator(SELECTORS.overlayTimecode)
      if (await timecodeOverlay.count() === 0) {
        test.skip()
        return
      }
      
      const result = await attemptDrag(page, SELECTORS.overlayTimecode, 50, 50)
      expect(result.moved).toBe(true)
    })

    test('can drag image overlay in overlays mode', async ({ page }) => {
      await switchToMode(page, 'overlays')
      
      const imageOverlay = page.locator(SELECTORS.overlayImage)
      if (await imageOverlay.count() === 0) {
        test.skip()
        return
      }
      
      const result = await attemptDrag(page, SELECTORS.overlayImage, 50, 50)
      expect(result.moved).toBe(true)
    })

    test('cursor is move in overlays mode', async ({ page }) => {
      await switchToMode(page, 'overlays')
      
      const timecodeOverlay = page.locator(SELECTORS.overlayTimecode)
      if (await timecodeOverlay.count() === 0) {
        test.skip()
        return
      }
      
      const cursor = await timecodeOverlay.evaluate((el) => 
        window.getComputedStyle(el).cursor
      )
      expect(cursor).toBe('move')
    })
  })

  test.describe('Burn-In Mode - Only Burn-In Overlays Allowed', () => {
    test('can drag timecode overlay in burn-in mode', async ({ page }) => {
      await switchToMode(page, 'burn-in')
      
      const timecodeOverlay = page.locator(SELECTORS.overlayTimecode)
      if (await timecodeOverlay.count() === 0) {
        test.skip()
        return
      }
      
      const result = await attemptDrag(page, SELECTORS.overlayTimecode, 50, 50)
      expect(result.moved).toBe(true)
    })

    test('cannot drag image overlay in burn-in mode', async ({ page }) => {
      await switchToMode(page, 'burn-in')
      
      const imageOverlay = page.locator(SELECTORS.overlayImage)
      if (await imageOverlay.count() === 0) {
        test.skip()
        return
      }
      
      const result = await attemptDrag(page, SELECTORS.overlayImage, 50, 50)
      expect(result.moved).toBe(false)
    })

    test('timecode cursor is move in burn-in mode', async ({ page }) => {
      await switchToMode(page, 'burn-in')
      
      const timecodeOverlay = page.locator(SELECTORS.overlayTimecode)
      if (await timecodeOverlay.count() === 0) {
        test.skip()
        return
      }
      
      const cursor = await timecodeOverlay.evaluate((el) => 
        window.getComputedStyle(el).cursor
      )
      expect(cursor).toBe('move')
    })

    test('image cursor is default in burn-in mode', async ({ page }) => {
      await switchToMode(page, 'burn-in')
      
      const imageOverlay = page.locator(SELECTORS.overlayImage)
      if (await imageOverlay.count() === 0) {
        test.skip()
        return
      }
      
      const cursor = await imageOverlay.evaluate((el) => 
        window.getComputedStyle(el).cursor
      )
      expect(cursor).toBe('default')
    })
  })

  test.describe('No Invariant Violations', () => {
    test('no invariant banner appears during normal interaction', async ({ page }) => {
      // Test all modes without causing violations
      for (const mode of ['view', 'overlays', 'burn-in'] as const) {
        await switchToMode(page, mode)
        
        // Just hover, don't try illegal actions
        const canvas = page.locator(SELECTORS.previewCanvas)
        await canvas.hover()
        
        // Verify no invariant banner
        const banner = page.locator(SELECTORS.invariantBanner)
        expect(await banner.count()).toBe(0)
      }
    })
  })
})
