/**
 * Phase F: Layout Lock-In Smoke Test
 * 
 * SCOPE:
 * - Verify 3-zone Resolve-style layout exists and is stable
 * - Confirm LEFT panel (Sources), CENTER (Monitor), RIGHT (Queue) are present
 * - Verify Queue is always visible (no tabs to hide it)
 * - Confirm no overlapping panels at minimum supported resolution (1280px)
 * 
 * SKIPPED:
 * - Media playback (requires actual media files)
 * - Job execution (not layout concern)
 * - Transport controls interaction (verified separately)
 */

import { test, expect } from '@playwright/test'

test.describe('Phase F: Layout Lock-In', () => {
  test('should render 3-zone immutable layout (LEFT/CENTER/RIGHT)', async ({ page }) => {
    // Navigate to app
    await page.goto('http://localhost:5173')
    
    // Wait for app to be ready
    await page.waitForSelector('[data-testid="workspace-layout"]', { timeout: 10000 })
    
    // Verify LEFT zone exists (Sources)
    const leftZone = page.locator('[data-testid="left-zone"]')
    await expect(leftZone).toBeVisible()
    
    // Verify CENTER zone exists (Monitor Surface)
    const centerZone = page.locator('[data-testid="center-zone"]')
    await expect(centerZone).toBeVisible()
    
    // Verify RIGHT zone exists (Queue)
    const rightZone = page.locator('[data-testid="right-zone"]')
    await expect(rightZone).toBeVisible()
  })
  
  test('should have Queue always visible (no settings tab)', async ({ page }) => {
    await page.goto('http://localhost:5173')
    await page.waitForSelector('[data-testid="workspace-layout"]', { timeout: 10000 })
    
    // Phase F: RIGHT zone should NOT have tabs anymore
    const tabSettings = page.locator('[data-testid="tab-settings"]')
    await expect(tabSettings).not.toBeVisible()
    
    const tabQueue = page.locator('[data-testid="tab-queue"]')
    await expect(tabQueue).not.toBeVisible()
    
    // Queue content should be directly visible
    const rightZone = page.locator('[data-testid="right-zone"]')
    await expect(rightZone).toBeVisible()
    
    // Queue header should be present
    const queueText = rightZone.locator('text=/Queue/i')
    await expect(queueText).toBeVisible()
  })
  
  test('should maintain layout zones at minimum supported width (1280px)', async ({ page }) => {
    // Set viewport to minimum supported resolution (13" laptop)
    await page.setViewportSize({ width: 1280, height: 800 })
    
    await page.goto('http://localhost:5173')
    await page.waitForSelector('[data-testid="workspace-layout"]', { timeout: 10000 })
    
    // All three zones should still be visible (no overlap or clipping)
    const leftZone = page.locator('[data-testid="left-zone"]')
    const centerZone = page.locator('[data-testid="center-zone"]')
    const rightZone = page.locator('[data-testid="right-zone"]')
    
    await expect(leftZone).toBeVisible()
    await expect(centerZone).toBeVisible()
    await expect(rightZone).toBeVisible()
    
    // Verify zones have expected fixed widths
    const leftBox = await leftZone.boundingBox()
    const rightBox = await rightZone.boundingBox()
    
    expect(leftBox?.width).toBe(352)
    expect(rightBox?.width).toBe(420)
  })
  
  test('should render monitor surface in CENTER zone only', async ({ page }) => {
    await page.goto('http://localhost:5173')
    await page.waitForSelector('[data-testid="workspace-layout"]', { timeout: 10000 })
    
    // Monitor surface should exist in center zone
    const centerZone = page.locator('[data-testid="center-zone"]')
    const monitorSurface = centerZone.locator('[data-testid="monitor-surface"]')
    
    await expect(monitorSurface).toBeVisible()
    
    // Monitor should fill center zone (not in left or right panels)
    const leftZone = page.locator('[data-testid="left-zone"]')
    const rightZone = page.locator('[data-testid="right-zone"]')
    
    const monitorInLeft = leftZone.locator('[data-testid="monitor-surface"]')
    const monitorInRight = rightZone.locator('[data-testid="monitor-surface"]')
    
    await expect(monitorInLeft).not.toBeVisible()
    await expect(monitorInRight).not.toBeVisible()
  })
  
  test('should not have any overlapping panels or hidden content', async ({ page }) => {
    await page.goto('http://localhost:5173')
    await page.waitForSelector('[data-testid="workspace-layout"]', { timeout: 10000 })
    
    // Get bounding boxes for all three zones
    const leftZone = page.locator('[data-testid="left-zone"]')
    const centerZone = page.locator('[data-testid="center-zone"]')
    const rightZone = page.locator('[data-testid="right-zone"]')
    
    const leftBox = await leftZone.boundingBox()
    const centerBox = await centerZone.boundingBox()
    const rightBox = await rightZone.boundingBox()
    
    // Verify zones don't overlap
    expect(leftBox).toBeTruthy()
    expect(centerBox).toBeTruthy()
    expect(rightBox).toBeTruthy()
    
    // LEFT should be before CENTER
    expect(leftBox!.x + leftBox!.width).toBeLessThanOrEqual(centerBox!.x + 1) // +1 for border
    
    // CENTER should be before RIGHT
    expect(centerBox!.x + centerBox!.width).toBeLessThanOrEqual(rightBox!.x + 1) // +1 for border
  })
})
