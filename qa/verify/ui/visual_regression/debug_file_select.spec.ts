/**
 * Debug Test: What happens when we click Select Files?
 */

import { test } from './helpers'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

test('debug: click Select Files and see what happens', async ({ page }) => {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('🐛 DEBUG: Click Select Files')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')
  
  // Wait for app
  await page.waitForTimeout(2000)
  
  // Screenshot before
  await page.screenshot({ path: '/tmp/before_click.png', fullPage: true })
  console.log('📸 Before: /tmp/before_click.png')
  
  // Find button
  const btn = page.locator('button:has-text("Select Files")').first()
  console.log(`✓ Button visible: ${await btn.isVisible()}`)
  
  // Mock electron
  const TEST_FILE = '/Users/leon.grant/projects/Proxx/artifacts/v2/20251228T160555/v2_smoke_v2_smoke_test_000.mp4'
  await page.evaluate((filePath) => {
    window.electron = window.electron || {}
    window.electron.openFiles = async () => {
      console.log('[MOCK] openFiles() returning:', filePath)
      return [filePath]
    }
  }, TEST_FILE)
  console.log('✓ Mocked window.electron.openFiles()')
  
  // Click
  await btn.click()
  console.log('✓ Clicked')
  
  // Wait and screenshot
  await page.waitForTimeout(3000)
  await page.screenshot({ path: '/tmp/after_click.png', fullPage: true })
  console.log('📸 After: /tmp/after_click.png')
  
  // Check body text
  const bodyText = await page.locator('body').textContent()
  console.log('\n Body text includes:')
  console.log(`  - "v2_smoke": ${bodyText.includes('v2_smoke')}`)
  console.log(`  - "Create Job": ${bodyText.includes('Create Job')}`)
  console.log(`  - "probing": ${bodyText.toLowerCase().includes('probing')}`)
  console.log(`  - "loading": ${bodyText.toLowerCase().includes('loading')}`)
  
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')
})
