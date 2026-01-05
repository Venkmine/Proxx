/**
 * INTENT_052: Controlled Output Component Contract
 * 
 * SCOPE:
 * - OutputTab is fully controlled by parent (MediaWorkspace)
 * - Props drive UI state
 * - User interactions round-trip correctly through callbacks
 * - No local state drift
 * - No console errors during state updates
 * 
 * PASS CRITERIA:
 * 1. Initial prop values render correctly
 * 2. Text input changes reflect in DOM immediately
 * 3. Select changes reflect in DOM immediately
 * 4. Radio toggle changes reflect in DOM immediately
 * 5. Preview updates dynamically with state changes
 * 6. Browse button callback fires without errors
 * 7. No console errors during any interaction
 * 
 * REGRESSION INSURANCE:
 * - Tests controlled component contract
 * - Ensures parent state management works
 * - Guards against local state reintroduction
 */

import { test, expect, Page } from '@playwright/test'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const HTML_PATH = 'file://' + join(__dirname, 'output_tab_demo.html')

// Helper to check console for errors
async function getConsoleErrors(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    return (window as any).__consoleErrors || []
  })
}

test.describe('INTENT_052: Controlled Output Component', () => {
  test.beforeEach(async ({ page }) => {
    // Capture console errors
    await page.addInitScript(() => {
      (window as any).__consoleErrors = [];
      const originalError = console.error;
      console.error = (...args: any[]) => {
        (window as any).__consoleErrors.push(args.join(' '));
        originalError.apply(console, args);
      };
    });

    await page.goto(HTML_PATH)
    await page.waitForSelector('[data-testid="output-tab"]', { state: 'visible' })
  })

  test('1. Initial controlled values render correctly', async ({ page }) => {
    // Check initial state from parent (MediaWorkspace defaults)
    const pathInput = page.locator('[data-testid="output-path-input"]')
    const containerSelect = page.locator('[data-testid="output-container-select"] select')
    const filenameInput = page.locator('[data-testid="output-filename-template"] input')
    const proxyRadio = page.locator('input[type="radio"][value="proxy"]')
    const previewText = page.locator('[data-testid="output-preview-text"]')

    await expect(pathInput).toHaveValue('/path/to/output')
    await expect(containerSelect).toHaveValue('mov')
    await expect(filenameInput).toHaveValue('{source_name}_proxy')
    await expect(proxyRadio).toBeChecked()
    await expect(previewText).toContainText('{source_name}_proxy.mov')

    // Verify no console errors
    const errors = await getConsoleErrors(page)
    expect(errors.filter(e => e.includes('Error') || e.includes('Warning'))).toHaveLength(0)
  })

  test('2. Output path input round-trips through parent state', async ({ page }) => {
    const pathInput = page.locator('[data-testid="output-path-input"]')
    
    // Type new path
    await pathInput.clear()
    await pathInput.fill('/new/output/path')
    
    // Value should reflect immediately (controlled component)
    await expect(pathInput).toHaveValue('/new/output/path')
    
    // Verify no console errors
    const errors = await getConsoleErrors(page)
    expect(errors.filter(e => e.includes('Error') || e.includes('Warning'))).toHaveLength(0)
  })

  test('3. Container format select round-trips through parent state', async ({ page }) => {
    const containerSelect = page.locator('[data-testid="output-container-select"] select')
    const previewText = page.locator('[data-testid="output-preview-text"]')
    
    // Change to MP4
    await containerSelect.selectOption('mp4')
    await expect(containerSelect).toHaveValue('mp4')
    
    // Preview should update immediately
    await expect(previewText).toContainText('{source_name}_proxy.mp4')
    
    // Change to MXF
    await containerSelect.selectOption('mxf')
    await expect(containerSelect).toHaveValue('mxf')
    await expect(previewText).toContainText('{source_name}_proxy.mxf')
    
    // Verify no console errors
    const errors = await getConsoleErrors(page)
    expect(errors.filter(e => e.includes('Error') || e.includes('Warning'))).toHaveLength(0)
  })

  test('4. Filename template input round-trips through parent state', async ({ page }) => {
    const filenameInput = page.locator('[data-testid="output-filename-template"] input')
    const previewText = page.locator('[data-testid="output-preview-text"]')
    
    // Type new template
    await filenameInput.clear()
    await filenameInput.fill('custom_output')
    
    // Value and preview should reflect immediately
    await expect(filenameInput).toHaveValue('custom_output')
    await expect(previewText).toContainText('custom_output.mov')
    
    // Verify no console errors
    const errors = await getConsoleErrors(page)
    expect(errors.filter(e => e.includes('Error') || e.includes('Warning'))).toHaveLength(0)
  })

  test('5. Delivery type radio toggles round-trip through parent state', async ({ page }) => {
    const proxyRadio = page.locator('input[type="radio"][value="proxy"]')
    const deliveryRadio = page.locator('input[type="radio"][value="delivery"]')
    
    // Initially proxy should be checked
    await expect(proxyRadio).toBeChecked()
    await expect(deliveryRadio).not.toBeChecked()
    
    // Toggle to delivery
    await deliveryRadio.click()
    await expect(deliveryRadio).toBeChecked()
    await expect(proxyRadio).not.toBeChecked()
    
    // Toggle back to proxy
    await proxyRadio.click()
    await expect(proxyRadio).toBeChecked()
    await expect(deliveryRadio).not.toBeChecked()
    
    // Verify no console errors
    const errors = await getConsoleErrors(page)
    expect(errors.filter(e => e.includes('Error') || e.includes('Warning'))).toHaveLength(0)
  })

  test('6. Preview updates dynamically with all state changes', async ({ page }) => {
    const filenameInput = page.locator('[data-testid="output-filename-template"] input')
    const containerSelect = page.locator('[data-testid="output-container-select"] select')
    const previewText = page.locator('[data-testid="output-preview-text"]')
    
    // Change both filename and container
    await filenameInput.clear()
    await filenameInput.fill('my_video')
    await containerSelect.selectOption('mp4')
    
    // Preview should show combined result
    await expect(previewText).toContainText('my_video.mp4')
    
    // Change again
    await filenameInput.clear()
    await filenameInput.fill('final_output')
    await containerSelect.selectOption('mxf')
    
    await expect(previewText).toContainText('final_output.mxf')
    
    // Verify no console errors
    const errors = await getConsoleErrors(page)
    expect(errors.filter(e => e.includes('Error') || e.includes('Warning'))).toHaveLength(0)
  })

  test('7. Browse button callback executes without errors', async ({ page }) => {
    const browseButton = page.locator('[data-testid="output-browse-button"]')
    
    // Setup console.log capture
    const logs: string[] = []
    page.on('console', msg => {
      if (msg.type() === 'log') {
        logs.push(msg.text())
      }
    })
    
    // Click browse button
    await browseButton.click()
    
    // Should log the expected message (from MediaWorkspace handler)
    await page.waitForTimeout(100)
    expect(logs.some(log => log.includes('Browse button clicked'))).toBe(true)
    
    // Verify no console errors
    const errors = await getConsoleErrors(page)
    expect(errors.filter(e => e.includes('Error') || e.includes('Warning'))).toHaveLength(0)
  })

  test('8. Multiple rapid state changes maintain consistency', async ({ page }) => {
    const filenameInput = page.locator('[data-testid="output-filename-template"] input')
    const containerSelect = page.locator('[data-testid="output-container-select"] select')
    const previewText = page.locator('[data-testid="output-preview-text"]')
    
    // Rapid changes
    await filenameInput.clear()
    await filenameInput.fill('test1')
    await containerSelect.selectOption('mp4')
    await filenameInput.clear()
    await filenameInput.fill('test2')
    await containerSelect.selectOption('mxf')
    await filenameInput.clear()
    await filenameInput.fill('final')
    await containerSelect.selectOption('mov')
    
    // Final state should be consistent
    await expect(filenameInput).toHaveValue('final')
    await expect(containerSelect).toHaveValue('mov')
    await expect(previewText).toContainText('final.mov')
    
    // Verify no console errors
    const errors = await getConsoleErrors(page)
    expect(errors.filter(e => e.includes('Error') || e.includes('Warning'))).toHaveLength(0)
  })
})
