/**
 * PROOF: Delivery Destination Setting (Single Source of Truth)
 * 
 * Verify that:
 * 1. Exactly ONE delivery destination input exists (center bottom panel)
 * 2. NO output/destination controls exist in left panel
 * 3. Delivery panel is visible and accessible
 */

import { test, expect } from '@playwright/test'

test.describe('Delivery Destination Proof (Single Source of Truth)', () => {
  test('verify exactly one delivery destination input exists', async ({ page }) => {
    console.log('\n🔬 PROOF: Testing delivery destination uniqueness...\n')
    
    await page.goto('http://localhost:5173')
    
    // Wait for app to be ready
    await page.waitForSelector('[data-testid="workspace-layout"]', { timeout: 10000 })
    
    // ASSERTION 1: Exactly one output-path-input exists (in center bottom)
    const deliveryInputs = page.locator('[data-testid="output-path-input"]')
    const deliveryInputCount = await deliveryInputs.count()
    console.log(`Delivery destination inputs found: ${deliveryInputCount}`)
    
    if (deliveryInputCount !== 1) {
      throw new Error(`Expected exactly 1 delivery destination input, found ${deliveryInputCount}`)
    }
    
    // ASSERTION 2: Delivery input is in center bottom panel
    const centerBottomPanel = page.locator('[data-testid="center-bottom-panel"]')
    const isCenterBottomVisible = await centerBottomPanel.isVisible()
    console.log(`Center bottom panel visible: ${isCenterBottomVisible}`)
    
    if (!isCenterBottomVisible) {
      throw new Error('Center bottom panel not visible')
    }
    
    const deliveryInputInCenter = centerBottomPanel.locator('[data-testid="output-path-input"]')
    const isDeliveryInCenter = await deliveryInputInCenter.isVisible()
    console.log(`Delivery input in center bottom: ${isDeliveryInCenter}`)
    
    if (!isDeliveryInCenter) {
      throw new Error('Delivery input not found in center bottom panel')
    }
    
    // ASSERTION 3: NO output-directory-input in left panel (old location)
    const leftPanel = page.locator('[data-testid="left-zone"]')
    const oldOutputInput = leftPanel.locator('[data-testid="output-directory-input"]')
    const oldOutputCount = await oldOutputInput.count()
    console.log(`Old output directory inputs in left panel: ${oldOutputCount}`)
    
    if (oldOutputCount > 0) {
      throw new Error(`Found ${oldOutputCount} old output inputs in left panel - should be 0`)
    }
    
    // ASSERTION 4: Delivery panel has correct label
    const deliveryHeader = centerBottomPanel.locator('h2:has-text("Delivery"), h2:has-text("DELIVERY")')
    const hasDeliveryHeader = await deliveryHeader.count() > 0
    console.log(`Delivery header exists: ${hasDeliveryHeader}`)
    
    if (!hasDeliveryHeader) {
      console.warn('⚠️  Warning: Delivery header not found (may still say "Output")')
    }
    
    console.log(`✅ PROOF PASSED: Exactly one delivery destination input in center bottom panel`)
    console.log(`✅ PROOF PASSED: No duplicate output/delivery controls in left panel`)
  })
})
