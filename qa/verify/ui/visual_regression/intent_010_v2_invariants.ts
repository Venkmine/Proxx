/**
 * INTENT_010 v2 — Layout Robustness Invariants
 * 
 * Extends INTENT_010 with additional layout robustness checks:
 * 1. NESTED_SCROLL_DETECTION_V2 - Stronger duplicate scrollbar detection with DOM path
 * 2. RESIZE_STABILITY - Layout must remain usable across standard breakpoints
 * 3. PANEL_OVERFLOW_INVARIANTS - Critical panels must never overflow horizontally
 * 
 * These invariants are designed to be:
 * - Deterministic (same result on same state)
 * - CI-safe (no human interaction required)
 * - Fail-fast (one screenshot per failure)
 */

import type { Page, ElectronApplication } from '@playwright/test'
import path from 'node:path'

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export interface ScrollableElement {
  domPath: string
  tagName: string
  className: string
  testId: string | null
  bounds: {
    left: number
    top: number
    right: number
    bottom: number
    width: number
    height: number
  }
  scrollDimensions: {
    scrollWidth: number
    scrollHeight: number
    clientWidth: number
    clientHeight: number
  }
  hasVerticalScroll: boolean
  hasHorizontalScroll: boolean
}

export interface DuplicateScrollbarViolation {
  panelPath: string
  panelTestId: string | null
  panelBounds: {
    left: number
    top: number
    right: number
    bottom: number
    width: number
    height: number
  }
  nestedScrollables: ScrollableElement[]
  explanation: string
}

export interface DuplicateScrollbarResult {
  invariant_id: 'NESTED_SCROLL_DETECTION_V2'
  invariant_name: string
  passed: boolean
  violations: DuplicateScrollbarViolation[]
  total_nested_scrollables: number
}

export interface ResizeBreakpoint {
  name: string
  width: number
  height: number
}

export interface ResizeViolation {
  breakpoint: ResizeBreakpoint
  issue: 'buttons_disappeared' | 'horizontal_scroll_introduced' | 'critical_overflow'
  details: string
  affectedElements: Array<{
    description: string
    selector: string
    bounds?: { left: number; top: number; right: number; bottom: number }
  }>
}

export interface ResizeStabilityResult {
  invariant_id: 'RESIZE_STABILITY'
  invariant_name: string
  passed: boolean
  breakpoints_tested: ResizeBreakpoint[]
  violations: ResizeViolation[]
  screenshots: Record<string, string>
}

export interface PanelOverflowViolation {
  panel: string
  panelSelector: string
  overflowAmount: number
  scrollWidth: number
  clientWidth: number
  bounds: { left: number; top: number; right: number; bottom: number }
}

export interface PanelOverflowResult {
  invariant_id: 'PANEL_OVERFLOW_INVARIANTS'
  invariant_name: string
  passed: boolean
  violations: PanelOverflowViolation[]
  panels_checked: string[]
}

// ============================================================================
// STANDARD BREAKPOINTS
// ============================================================================

export const STANDARD_BREAKPOINTS: ResizeBreakpoint[] = [
  { name: '1280x800', width: 1280, height: 800 },
  { name: '1440x900', width: 1440, height: 900 },
  { name: '1728x1117_MBP', width: 1728, height: 1117 },
]

// ============================================================================
// CRITICAL PANELS
// ============================================================================

export const CRITICAL_PANELS = [
  { name: 'Left Panel', selectors: ['[data-testid="left-panel"]', '[data-testid="source-panel"]', 'aside', '.left-panel', '.source-panel'] },
  { name: 'Queue Panel', selectors: ['[data-testid="job-queue-panel"]', '[data-testid="queue-panel"]', '.job-queue-panel', '.queue-panel'] },
  { name: 'Status Panel', selectors: ['[data-testid="status-panel"]', '[data-testid="status-bar"]', '.status-panel', '.status-bar'] },
]

// ============================================================================
// INVARIANT 1: Stronger Duplicate Scrollbar Detection
// ============================================================================

/**
 * Detects nested scrollable containers within panels, providing full DOM path
 * and bounding boxes for debugging.
 */
export async function checkNestedScrollablesV2(page: Page): Promise<DuplicateScrollbarResult> {
  const result = await page.evaluate(() => {
    const violations: DuplicateScrollbarViolation[] = []
    let totalNested = 0

    // Helper to build DOM path
    const getDomPath = (el: Element): string => {
      const parts: string[] = []
      let current: Element | null = el
      while (current && current !== document.body) {
        let part = current.tagName.toLowerCase()
        if (current.id) {
          part += `#${current.id}`
        } else if (current.className) {
          const firstClass = current.className.split(' ')[0]
          if (firstClass) part += `.${firstClass}`
        }
        parts.unshift(part)
        current = current.parentElement
      }
      return parts.join(' > ')
    }

    // Find all potential panel containers
    const panelCandidates = [
      ...document.querySelectorAll('[data-testid*="panel"]'),
      ...document.querySelectorAll('[role="region"]'),
      ...document.querySelectorAll('main, aside, section'),
      ...document.querySelectorAll('[class*="panel"], [class*="sidebar"]'),
    ]

    const panels = [...new Set(panelCandidates)]

    for (const panel of panels) {
      const panelStyle = window.getComputedStyle(panel)
      if (panelStyle.display === 'none' || panelStyle.visibility === 'hidden') continue

      const panelRect = panel.getBoundingClientRect()
      if (panelRect.width === 0 || panelRect.height === 0) continue

      // Find all scrollable descendants
      const scrollables: ScrollableElement[] = []

      const walkElement = (el: Element) => {
        if (el === panel) {
          // Check children only, not panel itself
          Array.from(el.children).forEach(child => walkElement(child))
          return
        }

        const style = window.getComputedStyle(el)
        if (style.display === 'none' || style.visibility === 'hidden') return

        const hasVerticalScroll = 
          (style.overflowY === 'scroll' || style.overflowY === 'auto') && 
          el.scrollHeight > el.clientHeight + 5

        const hasHorizontalScroll = 
          (style.overflowX === 'scroll' || style.overflowX === 'auto') && 
          el.scrollWidth > el.clientWidth + 5

        if (hasVerticalScroll || hasHorizontalScroll) {
          const rect = el.getBoundingClientRect()
          scrollables.push({
            domPath: getDomPath(el),
            tagName: el.tagName.toLowerCase(),
            className: el.className,
            testId: el.getAttribute('data-testid'),
            bounds: {
              left: rect.left,
              top: rect.top,
              right: rect.right,
              bottom: rect.bottom,
              width: rect.width,
              height: rect.height,
            },
            scrollDimensions: {
              scrollWidth: el.scrollWidth,
              scrollHeight: el.scrollHeight,
              clientWidth: el.clientWidth,
              clientHeight: el.clientHeight,
            },
            hasVerticalScroll,
            hasHorizontalScroll,
          })
        }

        Array.from(el.children).forEach(child => walkElement(child))
      }

      walkElement(panel)

      totalNested += scrollables.length

      // Violation if more than 1 scrollable container within a panel
      if (scrollables.length > 1) {
        const panelTestId = panel.getAttribute('data-testid')
        violations.push({
          panelPath: getDomPath(panel),
          panelTestId,
          panelBounds: {
            left: panelRect.left,
            top: panelRect.top,
            right: panelRect.right,
            bottom: panelRect.bottom,
            width: panelRect.width,
            height: panelRect.height,
          },
          nestedScrollables: scrollables,
          explanation: `Panel contains ${scrollables.length} nested scrollable elements, causing a "scroll within scroll" UX issue`,
        })
      }
    }

    return { violations, totalNested }
  })

  return {
    invariant_id: 'NESTED_SCROLL_DETECTION_V2',
    invariant_name: 'No duplicate scrollbars from nested scroll containers',
    passed: result.violations.length === 0,
    violations: result.violations,
    total_nested_scrollables: result.totalNested,
  }
}

// ============================================================================
// INVARIANT 2: Resize Stability
// ============================================================================

/**
 * Tests layout stability across standard viewport breakpoints.
 * Ensures no buttons disappear and no horizontal scrolling is introduced.
 */
export async function checkResizeStability(
  page: Page,
  app: ElectronApplication,
  artifactDir: string,
  breakpoints: ResizeBreakpoint[] = STANDARD_BREAKPOINTS
): Promise<ResizeStabilityResult> {
  const violations: ResizeViolation[] = []
  const screenshots: Record<string, string> = {}
  const testedBreakpoints: ResizeBreakpoint[] = []

  // Get original window size to restore later
  const originalBounds = await app.evaluate(({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows()[0]
    return win ? win.getBounds() : null
  })

  for (const breakpoint of breakpoints) {
    testedBreakpoints.push(breakpoint)

    // Resize window
    await app.evaluate(({ BrowserWindow }, { width, height }) => {
      const win = BrowserWindow.getAllWindows()[0]
      if (win) {
        win.setSize(width, height)
      }
    }, { width: breakpoint.width, height: breakpoint.height })

    // Wait for layout to settle
    await page.waitForTimeout(300)

    // Take screenshot
    const screenshotPath = path.join(artifactDir, `resize_${breakpoint.name}.png`)
    await page.screenshot({ path: screenshotPath, fullPage: false })
    screenshots[breakpoint.name] = screenshotPath

    // Check for button visibility issues
    const buttonCheck = await page.evaluate((bp) => {
      const buttons = Array.from(document.querySelectorAll('button'))
      const viewportWidth = window.innerWidth
      const viewportHeight = window.innerHeight
      const hiddenOrClipped: Array<{ description: string; selector: string; bounds: { left: number; top: number; right: number; bottom: number } }> = []

      for (const btn of buttons) {
        const style = window.getComputedStyle(btn)
        if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') continue

        const rect = btn.getBoundingClientRect()
        if (rect.width === 0 || rect.height === 0) continue

        // Check if button is significantly outside viewport
        const isClippedRight = rect.right > viewportWidth + 10
        const isClippedBottom = rect.bottom > viewportHeight + 10
        const isClippedLeft = rect.left < -10
        const isClippedTop = rect.top < -10

        if (isClippedRight || isClippedBottom || isClippedLeft || isClippedTop) {
          const text = btn.textContent?.trim() || btn.getAttribute('aria-label') || '[unnamed]'
          hiddenOrClipped.push({
            description: `Button "${text.slice(0, 30)}"`,
            selector: btn.getAttribute('data-testid')
              ? `[data-testid="${btn.getAttribute('data-testid')}"]`
              : `button:has-text("${text.slice(0, 20)}")`,
            bounds: { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom },
          })
        }
      }

      return {
        viewportWidth,
        viewportHeight,
        hiddenOrClipped,
      }
    }, breakpoint)

    if (buttonCheck.hiddenOrClipped.length > 0) {
      violations.push({
        breakpoint,
        issue: 'buttons_disappeared',
        details: `${buttonCheck.hiddenOrClipped.length} button(s) are clipped or outside viewport at ${breakpoint.name}`,
        affectedElements: buttonCheck.hiddenOrClipped,
      })
    }

    // Check for horizontal scrolling
    const scrollCheck = await page.evaluate(() => {
      const hasHorizontalScroll = document.documentElement.scrollWidth > document.documentElement.clientWidth + 5
      const bodyHasHorizontalScroll = document.body.scrollWidth > document.body.clientWidth + 5

      return {
        hasHorizontalScroll: hasHorizontalScroll || bodyHasHorizontalScroll,
        docScrollWidth: document.documentElement.scrollWidth,
        docClientWidth: document.documentElement.clientWidth,
      }
    })

    if (scrollCheck.hasHorizontalScroll) {
      violations.push({
        breakpoint,
        issue: 'horizontal_scroll_introduced',
        details: `Page requires horizontal scrolling at ${breakpoint.name} (scrollWidth: ${scrollCheck.docScrollWidth}, clientWidth: ${scrollCheck.docClientWidth})`,
        affectedElements: [{
          description: 'Document body',
          selector: 'body',
        }],
      })
    }
  }

  // Restore original window size
  if (originalBounds) {
    await app.evaluate(({ BrowserWindow }, bounds) => {
      const win = BrowserWindow.getAllWindows()[0]
      if (win) {
        win.setBounds(bounds)
      }
    }, originalBounds)
    await page.waitForTimeout(200)
  }

  return {
    invariant_id: 'RESIZE_STABILITY',
    invariant_name: 'Layout must remain usable across standard breakpoints',
    passed: violations.length === 0,
    breakpoints_tested: testedBreakpoints,
    violations,
    screenshots,
  }
}

// ============================================================================
// INVARIANT 3: Panel Overflow Invariants
// ============================================================================

/**
 * Ensures critical panels (left panel, queue panel, status panel) never overflow horizontally.
 */
export async function checkPanelOverflowInvariants(page: Page): Promise<PanelOverflowResult> {
  const violations: PanelOverflowViolation[] = []
  const panelsChecked: string[] = []

  for (const panelDef of CRITICAL_PANELS) {
    const result = await page.evaluate((selectors) => {
      for (const selector of selectors) {
        const panel = document.querySelector(selector)
        if (!panel) continue

        const style = window.getComputedStyle(panel)
        if (style.display === 'none' || style.visibility === 'hidden') continue

        const rect = panel.getBoundingClientRect()
        if (rect.width === 0 || rect.height === 0) continue

        const hasHorizontalOverflow = panel.scrollWidth > panel.clientWidth + 2

        return {
          found: true,
          selector,
          hasOverflow: hasHorizontalOverflow,
          scrollWidth: panel.scrollWidth,
          clientWidth: panel.clientWidth,
          overflowAmount: panel.scrollWidth - panel.clientWidth,
          bounds: {
            left: rect.left,
            top: rect.top,
            right: rect.right,
            bottom: rect.bottom,
          },
        }
      }

      return { found: false }
    }, panelDef.selectors)

    if (result.found) {
      panelsChecked.push(panelDef.name)

      if (result.hasOverflow && result.overflowAmount > 2) {
        violations.push({
          panel: panelDef.name,
          panelSelector: result.selector!,
          overflowAmount: result.overflowAmount,
          scrollWidth: result.scrollWidth!,
          clientWidth: result.clientWidth!,
          bounds: result.bounds!,
        })
      }
    }
  }

  return {
    invariant_id: 'PANEL_OVERFLOW_INVARIANTS',
    invariant_name: 'Critical panels must never overflow horizontally',
    passed: violations.length === 0,
    violations,
    panels_checked: panelsChecked,
  }
}

// ============================================================================
// MARKDOWN GENERATION
// ============================================================================

export function generateV2InvariantSection(
  scrollResult: DuplicateScrollbarResult,
  resizeResult: ResizeStabilityResult,
  overflowResult: PanelOverflowResult
): string {
  const lines: string[] = []

  lines.push('### 🔒 INTENT_010 v2 — Layout Robustness Invariants')
  lines.push('')

  // Nested Scroll Detection V2
  if (scrollResult.passed) {
    lines.push(`- ✅ **${scrollResult.invariant_id}**: ${scrollResult.invariant_name}`)
    lines.push(`  - Total scrollable containers: ${scrollResult.total_nested_scrollables}`)
  } else {
    lines.push(`- ❌ **${scrollResult.invariant_id}**: ${scrollResult.invariant_name}`)
    lines.push('')
    for (const v of scrollResult.violations) {
      lines.push(`  **Panel:** \`${v.panelTestId || v.panelPath}\``)
      lines.push(`  - ${v.explanation}`)
      lines.push(`  - Nested scrollables:`)
      for (const s of v.nestedScrollables.slice(0, 5)) {
        lines.push(`    - \`${s.domPath}\``)
      }
      if (v.nestedScrollables.length > 5) {
        lines.push(`    - *... and ${v.nestedScrollables.length - 5} more*`)
      }
      lines.push('')
    }
  }

  // Resize Stability
  lines.push('')
  if (resizeResult.passed) {
    lines.push(`- ✅ **${resizeResult.invariant_id}**: ${resizeResult.invariant_name}`)
    lines.push(`  - Breakpoints tested: ${resizeResult.breakpoints_tested.map(b => b.name).join(', ')}`)
  } else {
    lines.push(`- ❌ **${resizeResult.invariant_id}**: ${resizeResult.invariant_name}`)
    lines.push('')
    for (const v of resizeResult.violations) {
      lines.push(`  **Breakpoint:** ${v.breakpoint.name} (${v.breakpoint.width}×${v.breakpoint.height})`)
      lines.push(`  - Issue: ${v.issue}`)
      lines.push(`  - Details: ${v.details}`)
      if (v.affectedElements.length > 0) {
        lines.push(`  - Affected elements:`)
        for (const el of v.affectedElements.slice(0, 5)) {
          lines.push(`    - ${el.description} (\`${el.selector}\`)`)
        }
      }
      lines.push('')
    }
  }

  // Panel Overflow
  lines.push('')
  if (overflowResult.passed) {
    lines.push(`- ✅ **${overflowResult.invariant_id}**: ${overflowResult.invariant_name}`)
    lines.push(`  - Panels checked: ${overflowResult.panels_checked.join(', ') || 'none found'}`)
  } else {
    lines.push(`- ❌ **${overflowResult.invariant_id}**: ${overflowResult.invariant_name}`)
    lines.push('')
    for (const v of overflowResult.violations) {
      lines.push(`  **Panel:** ${v.panel} (\`${v.panelSelector}\`)`)
      lines.push(`  - Overflow: ${v.overflowAmount}px (scrollWidth: ${v.scrollWidth}, clientWidth: ${v.clientWidth})`)
      lines.push('')
    }
  }

  return lines.join('\n')
}
