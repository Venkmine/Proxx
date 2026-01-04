/**
 * INTENT_010 — Basic Usability & Layout Sanity
 * 
 * This intent validates ONLY static usability and layout issues:
 * - No duplicate scrollbars in left panel
 * - App window is resizable (unless explicitly locked)
 * - No buttons visually clipped at 1440x900
 * - No horizontal scrollbars in main panels
 * 
 * IMPORTANT:
 * - NO file selection
 * - NO backend calls
 * - NO job creation
 * - Pure DOM/layout inspection
 * 
 * Run with:
 *   npx playwright test intent_010_usability.spec.ts
 */

import { test, expect } from './helpers'
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const projectRoot = path.resolve(__dirname, '../../../..')

interface UsabilityCheck {
  name: string
  passed: boolean
  reason?: string
  screenshot?: string
}

interface UsabilityResult {
  intent_id: string
  timestamp: string
  verdict: 'VERIFIED_OK' | 'VERIFIED_NOT_OK'
  checks: UsabilityCheck[]
  failed_at?: string
}

test.describe('INTENT_010 — Basic Usability & Layout Sanity', () => {
  test('verify layout sanity at 1440x900', async ({ page, visualCollector, app }) => {
    const artifactDir = visualCollector.artifactDir
    const checks: UsabilityCheck[] = []
    let firstFailure: string | null = null

    console.log('\n═══════════════════════════════════════════════════════════')
    console.log('  INTENT_010 — Basic Usability & Layout Sanity')
    console.log('═══════════════════════════════════════════════════════════')
    console.log(`  Artifact dir: ${artifactDir}\n`)

    // Helper: capture screenshot with check name
    async function captureCheckScreenshot(checkName: string): Promise<string> {
      const filename = `check_${checkName.replace(/\s+/g, '_').toLowerCase()}.png`
      const screenshotPath = path.join(artifactDir, filename)
      await page.screenshot({ path: screenshotPath, fullPage: true })
      console.log(`   📸 Screenshot: ${filename}`)
      return screenshotPath
    }

    // Helper: fail fast if check fails
    function recordCheck(name: string, passed: boolean, reason?: string, screenshot?: string) {
      checks.push({ name, passed, reason, screenshot })
      if (passed) {
        console.log(`   ✅ ${name}`)
      } else {
        console.log(`   ❌ ${name}`)
        if (reason) console.log(`      Reason: ${reason}`)
        if (!firstFailure) {
          firstFailure = name
        }
      }
    }

    // =========================================================================
    // CHECK 1: No duplicate scrollbars in left panel
    // =========================================================================
    console.log('\n🔍 Check 1: No duplicate scrollbars in left panel')
    
    try {
      // Find the left panel (source selection area)
      const leftPanel = page.locator('[data-testid="left-panel"], [data-testid="source-panel"], aside').first()
      const leftPanelExists = await leftPanel.count() > 0

      if (!leftPanelExists) {
        // Try alternative selectors
        const altLeftPanel = page.locator('.left-panel, .source-panel, [class*="sidebar"]').first()
        const altExists = await altLeftPanel.count() > 0
        
        if (!altExists) {
          const screenshot = await captureCheckScreenshot('no_left_panel')
          recordCheck('No duplicate scrollbars in left panel', true, 'Left panel not found (acceptable in idle state)', screenshot)
        } else {
          // Check for nested scrollbars
          const nestedScrollables = await page.evaluate(() => {
            const panel = document.querySelector('.left-panel, .source-panel, [class*="sidebar"]')
            if (!panel) return { count: 0, hasNested: false }
            
            const scrollables = panel.querySelectorAll('[style*="overflow"], [class*="scroll"]')
            const nestedCount = Array.from(scrollables).filter(el => {
              const style = window.getComputedStyle(el)
              return style.overflowY === 'scroll' || style.overflowY === 'auto'
            }).length
            
            return { count: nestedCount, hasNested: nestedCount > 1 }
          })
          
          const screenshot = await captureCheckScreenshot('left_panel_scrollbars')
          if (nestedScrollables.hasNested) {
            recordCheck('No duplicate scrollbars in left panel', false, 
              `Found ${nestedScrollables.count} nested scrollable elements`, screenshot)
          } else {
            recordCheck('No duplicate scrollbars in left panel', true, undefined, screenshot)
          }
        }
      } else {
        // Check for nested scrollbars in the found panel
        const nestedScrollables = await page.evaluate(() => {
          const panel = document.querySelector('[data-testid="left-panel"], [data-testid="source-panel"], aside')
          if (!panel) return { count: 0, hasNested: false }
          
          // Count elements with overflow-y: scroll or auto that are nested
          let scrollableCount = 0
          const walk = (el: Element, depth: number) => {
            const style = window.getComputedStyle(el)
            if ((style.overflowY === 'scroll' || style.overflowY === 'auto') && 
                el.scrollHeight > el.clientHeight) {
              scrollableCount++
            }
            Array.from(el.children).forEach(child => walk(child, depth + 1))
          }
          walk(panel, 0)
          
          return { count: scrollableCount, hasNested: scrollableCount > 1 }
        })
        
        const screenshot = await captureCheckScreenshot('left_panel_scrollbars')
        if (nestedScrollables.hasNested) {
          recordCheck('No duplicate scrollbars in left panel', false, 
            `Found ${nestedScrollables.count} nested scrollable elements (should be max 1)`, screenshot)
        } else {
          recordCheck('No duplicate scrollbars in left panel', true, undefined, screenshot)
        }
      }
    } catch (err) {
      const screenshot = await captureCheckScreenshot('left_panel_error')
      recordCheck('No duplicate scrollbars in left panel', false, 
        `Error during check: ${(err as Error).message}`, screenshot)
    }

    // FAIL FAST: Stop if first check failed
    if (firstFailure) {
      await saveResult(artifactDir, 'VERIFIED_NOT_OK', checks, firstFailure)
      throw new Error(`Usability check failed: ${firstFailure}`)
    }

    // =========================================================================
    // CHECK 2: App window is resizable
    // =========================================================================
    console.log('\n🔍 Check 2: App window is resizable')
    
    try {
      // Get current window bounds
      const initialBounds = await app.evaluate(({ BrowserWindow }) => {
        const win = BrowserWindow.getAllWindows()[0]
        if (!win) return null
        return {
          width: win.getBounds().width,
          height: win.getBounds().height,
          resizable: win.isResizable(),
        }
      })
      
      if (!initialBounds) {
        const screenshot = await captureCheckScreenshot('no_window')
        recordCheck('App window is resizable', false, 'Could not get window bounds', screenshot)
      } else if (!initialBounds.resizable) {
        const screenshot = await captureCheckScreenshot('window_not_resizable')
        recordCheck('App window is resizable', false, 
          'Window isResizable() returned false', screenshot)
      } else {
        const screenshot = await captureCheckScreenshot('window_resizable')
        recordCheck('App window is resizable', true, undefined, screenshot)
      }
    } catch (err) {
      const screenshot = await captureCheckScreenshot('resizable_error')
      recordCheck('App window is resizable', false, 
        `Error during check: ${(err as Error).message}`, screenshot)
    }

    // FAIL FAST
    if (firstFailure) {
      await saveResult(artifactDir, 'VERIFIED_NOT_OK', checks, firstFailure)
      throw new Error(`Usability check failed: ${firstFailure}`)
    }

    // =========================================================================
    // CHECK 3: No buttons are visually clipped at 1440x900
    // =========================================================================
    console.log('\n🔍 Check 3: No buttons visually clipped at 1440x900')
    
    try {
      // Get all visible buttons and check their bounding boxes
      const clippedButtons = await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button'))
        const viewportWidth = window.innerWidth
        const viewportHeight = window.innerHeight
        const clipped: Array<{ text: string; reason: string; rect: DOMRect }> = []
        
        for (const btn of buttons) {
          const style = window.getComputedStyle(btn)
          // Skip hidden buttons
          if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
            continue
          }
          
          const rect = btn.getBoundingClientRect()
          
          // Skip zero-size buttons (likely hidden or collapsed)
          if (rect.width === 0 || rect.height === 0) {
            continue
          }
          
          const btnText = btn.textContent?.trim() || btn.getAttribute('aria-label') || '[unnamed]'
          
          // Check if button is clipped by viewport
          if (rect.right > viewportWidth) {
            clipped.push({ text: btnText, reason: `right edge (${rect.right.toFixed(0)}px) exceeds viewport (${viewportWidth}px)`, rect })
          }
          if (rect.bottom > viewportHeight) {
            clipped.push({ text: btnText, reason: `bottom edge (${rect.bottom.toFixed(0)}px) exceeds viewport (${viewportHeight}px)`, rect })
          }
          if (rect.left < 0) {
            clipped.push({ text: btnText, reason: `left edge (${rect.left.toFixed(0)}px) is negative`, rect })
          }
          if (rect.top < 0) {
            clipped.push({ text: btnText, reason: `top edge (${rect.top.toFixed(0)}px) is negative`, rect })
          }
        }
        
        return clipped.map(c => ({ text: c.text, reason: c.reason }))
      })
      
      const screenshot = await captureCheckScreenshot('button_clipping')
      
      if (clippedButtons.length > 0) {
        const clippedList = clippedButtons.map(b => `"${b.text}": ${b.reason}`).join('; ')
        recordCheck('No buttons visually clipped at 1440x900', false, 
          `${clippedButtons.length} clipped button(s): ${clippedList}`, screenshot)
      } else {
        recordCheck('No buttons visually clipped at 1440x900', true, undefined, screenshot)
      }
    } catch (err) {
      const screenshot = await captureCheckScreenshot('button_clipping_error')
      recordCheck('No buttons visually clipped at 1440x900', false, 
        `Error during check: ${(err as Error).message}`, screenshot)
    }

    // FAIL FAST
    if (firstFailure) {
      await saveResult(artifactDir, 'VERIFIED_NOT_OK', checks, firstFailure)
      throw new Error(`Usability check failed: ${firstFailure}`)
    }

    // =========================================================================
    // CHECK 4: No horizontal scrollbars in main panels
    // =========================================================================
    console.log('\n🔍 Check 4: No horizontal scrollbars in main panels')
    
    try {
      const horizontalScrollbars = await page.evaluate(() => {
        // Check main panels for horizontal scroll
        const panelSelectors = [
          '[data-testid="left-panel"]',
          '[data-testid="right-panel"]',
          '[data-testid="create-job-panel"]',
          '[data-testid="job-queue-panel"]',
          'main',
          'aside',
          '[role="main"]',
          '[class*="panel"]',
          '[class*="sidebar"]',
        ]
        
        const withHorizontalScroll: Array<{ selector: string; scrollWidth: number; clientWidth: number }> = []
        
        for (const selector of panelSelectors) {
          const elements = document.querySelectorAll(selector)
          for (const el of elements) {
            const hasHorizontalScroll = el.scrollWidth > el.clientWidth + 5 // 5px tolerance
            const style = window.getComputedStyle(el)
            const hasOverflowX = style.overflowX === 'scroll' || 
              (style.overflowX === 'auto' && el.scrollWidth > el.clientWidth)
            
            if (hasHorizontalScroll && hasOverflowX) {
              withHorizontalScroll.push({
                selector: selector,
                scrollWidth: el.scrollWidth,
                clientWidth: el.clientWidth,
              })
            }
          }
        }
        
        return withHorizontalScroll
      })
      
      const screenshot = await captureCheckScreenshot('horizontal_scrollbars')
      
      if (horizontalScrollbars.length > 0) {
        const scrollList = horizontalScrollbars.map(s => 
          `${s.selector}: scrollWidth=${s.scrollWidth}, clientWidth=${s.clientWidth}`
        ).join('; ')
        recordCheck('No horizontal scrollbars in main panels', false, 
          `${horizontalScrollbars.length} panel(s) with horizontal scroll: ${scrollList}`, screenshot)
      } else {
        recordCheck('No horizontal scrollbars in main panels', true, undefined, screenshot)
      }
    } catch (err) {
      const screenshot = await captureCheckScreenshot('horizontal_scrollbars_error')
      recordCheck('No horizontal scrollbars in main panels', false, 
        `Error during check: ${(err as Error).message}`, screenshot)
    }

    // FAIL FAST (final check)
    if (firstFailure) {
      await saveResult(artifactDir, 'VERIFIED_NOT_OK', checks, firstFailure)
      throw new Error(`Usability check failed: ${firstFailure}`)
    }

    // =========================================================================
    // ALL CHECKS PASSED
    // =========================================================================
    console.log('\n═══════════════════════════════════════════════════════════')
    console.log('  ✅ INTENT_010: ALL USABILITY CHECKS PASSED')
    console.log('═══════════════════════════════════════════════════════════\n')
    
    await saveResult(artifactDir, 'VERIFIED_OK', checks)
    
    // Final assertion
    expect(checks.every(c => c.passed), 'All usability checks should pass').toBe(true)
  })
})

async function saveResult(
  artifactDir: string, 
  verdict: 'VERIFIED_OK' | 'VERIFIED_NOT_OK', 
  checks: UsabilityCheck[],
  failedAt?: string
) {
  const result: UsabilityResult = {
    intent_id: 'INTENT_010',
    timestamp: new Date().toISOString(),
    verdict,
    checks,
    failed_at: failedAt,
  }
  
  const resultPath = path.join(artifactDir, 'intent_010_result.json')
  fs.writeFileSync(resultPath, JSON.stringify(result, null, 2))
  console.log(`\n💾 Result saved: ${resultPath}`)
}
