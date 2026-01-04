/**
 * INTENT_010 Property-Based Invariants
 * 
 * Expresses UI usability rules as invariants (properties that must always hold)
 * rather than hardcoded selectors. This makes the rules:
 * - More resilient to DOM structure changes
 * - Self-documenting
 * - Composable for different contexts
 * 
 * Core Invariants:
 * 1. PANELS_NEVER_CLIP_BUTTONS - No panel may contain buttons that extend beyond its bounds
 * 2. PANELS_NEVER_REQUIRE_HORIZONTAL_SCROLL - No panel should need horizontal scrolling
 * 3. WINDOW_RESIZABLE_UNLESS_E2E - Window must be resizable unless in E2E mode
 * 4. NESTED_SCROLLABLES_LIMIT - No more than 1 scrollable container per panel
 */

import type { Page } from '@playwright/test'

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export interface InvariantResult {
  invariant_id: string
  invariant_name: string
  passed: boolean
  violations: InvariantViolation[]
  context?: Record<string, unknown>
}

export interface InvariantViolation {
  element_description: string
  selector_hint: string
  reason: string
  bounds?: { left: number; top: number; right: number; bottom: number }
  parent_bounds?: { left: number; top: number; right: number; bottom: number }
}

export type InvariantContext = {
  viewport: { width: number; height: number }
  isE2EMode: boolean
}

// ============================================================================
// INVARIANT DEFINITIONS
// ============================================================================

/**
 * INVARIANT 1: No panel may contain buttons that extend beyond its visible bounds
 * 
 * This is expressed as a property: for every button B in panel P,
 * B.bounds must be fully contained within P.visibleBounds
 */
export async function checkPanelsNeverClipButtons(
  page: Page,
  context: InvariantContext
): Promise<InvariantResult> {
  const violations = await page.evaluate(() => {
    const violations: InvariantViolation[] = []
    
    // Find all potential panel containers (heuristic, not hardcoded)
    const panelCandidates = [
      ...document.querySelectorAll('[role="region"]'),
      ...document.querySelectorAll('[data-testid*="panel"]'),
      ...document.querySelectorAll('main, aside, section'),
      ...document.querySelectorAll('[class*="panel"], [class*="sidebar"], [class*="content"]'),
    ]
    
    // Deduplicate
    const panels = [...new Set(panelCandidates)]
    
    for (const panel of panels) {
      const panelRect = panel.getBoundingClientRect()
      const panelStyle = window.getComputedStyle(panel)
      
      // Skip invisible panels
      if (panelRect.width === 0 || panelRect.height === 0) continue
      if (panelStyle.display === 'none' || panelStyle.visibility === 'hidden') continue
      
      // Find buttons within this panel
      const buttons = panel.querySelectorAll('button')
      
      for (const btn of buttons) {
        const btnStyle = window.getComputedStyle(btn)
        if (btnStyle.display === 'none' || btnStyle.visibility === 'hidden') continue
        
        const btnRect = btn.getBoundingClientRect()
        if (btnRect.width === 0 || btnRect.height === 0) continue
        
        // Check if button extends beyond panel bounds
        const clippedRight = btnRect.right > panelRect.right + 1
        const clippedBottom = btnRect.bottom > panelRect.bottom + 1
        const clippedLeft = btnRect.left < panelRect.left - 1
        const clippedTop = btnRect.top < panelRect.top - 1
        
        if (clippedRight || clippedBottom || clippedLeft || clippedTop) {
          const reasons: string[] = []
          if (clippedRight) reasons.push(`right edge ${btnRect.right.toFixed(0)} > panel ${panelRect.right.toFixed(0)}`)
          if (clippedBottom) reasons.push(`bottom edge ${btnRect.bottom.toFixed(0)} > panel ${panelRect.bottom.toFixed(0)}`)
          if (clippedLeft) reasons.push(`left edge ${btnRect.left.toFixed(0)} < panel ${panelRect.left.toFixed(0)}`)
          if (clippedTop) reasons.push(`top edge ${btnRect.top.toFixed(0)} < panel ${panelRect.top.toFixed(0)}`)
          
          const btnText = btn.textContent?.trim() || btn.getAttribute('aria-label') || '[unnamed]'
          const panelId = panel.getAttribute('data-testid') || panel.tagName.toLowerCase()
          
          violations.push({
            element_description: `Button "${btnText.slice(0, 30)}" in ${panelId}`,
            selector_hint: btn.getAttribute('data-testid') 
              ? `[data-testid="${btn.getAttribute('data-testid')}"]`
              : `button:has-text("${btnText.slice(0, 20)}")`,
            reason: reasons.join('; '),
            bounds: {
              left: btnRect.left,
              top: btnRect.top,
              right: btnRect.right,
              bottom: btnRect.bottom,
            },
            parent_bounds: {
              left: panelRect.left,
              top: panelRect.top,
              right: panelRect.right,
              bottom: panelRect.bottom,
            },
          })
        }
      }
    }
    
    return violations
  })
  
  return {
    invariant_id: 'PANELS_NEVER_CLIP_BUTTONS',
    invariant_name: 'Panels must never clip buttons',
    passed: violations.length === 0,
    violations,
    context: { viewport: context.viewport },
  }
}

/**
 * INVARIANT 2: No panel should require horizontal scrolling
 * 
 * Property: for every panel P with overflow-x behavior,
 * P.scrollWidth must equal P.clientWidth (no horizontal overflow)
 */
export async function checkPanelsNeverRequireHorizontalScroll(
  page: Page,
  context: InvariantContext
): Promise<InvariantResult> {
  const violations = await page.evaluate(() => {
    const violations: InvariantViolation[] = []
    
    // Find all potential panel containers
    const panelCandidates = [
      ...document.querySelectorAll('[role="region"]'),
      ...document.querySelectorAll('[data-testid*="panel"]'),
      ...document.querySelectorAll('main, aside, section'),
      ...document.querySelectorAll('[class*="panel"], [class*="sidebar"], [class*="content"]'),
    ]
    
    const panels = [...new Set(panelCandidates)]
    
    for (const panel of panels) {
      const style = window.getComputedStyle(panel)
      if (style.display === 'none' || style.visibility === 'hidden') continue
      
      const rect = panel.getBoundingClientRect()
      if (rect.width === 0 || rect.height === 0) continue
      
      // Check for horizontal scroll
      const hasHorizontalOverflow = panel.scrollWidth > panel.clientWidth + 5
      const hasHorizontalScrollBehavior = style.overflowX === 'scroll' || style.overflowX === 'auto'
      
      if (hasHorizontalOverflow && hasHorizontalScrollBehavior) {
        const panelId = panel.getAttribute('data-testid') || panel.tagName.toLowerCase()
        
        violations.push({
          element_description: `Panel ${panelId}`,
          selector_hint: panel.getAttribute('data-testid') 
            ? `[data-testid="${panel.getAttribute('data-testid')}"]`
            : panel.tagName.toLowerCase(),
          reason: `scrollWidth (${panel.scrollWidth}) > clientWidth (${panel.clientWidth})`,
          bounds: {
            left: rect.left,
            top: rect.top,
            right: rect.right,
            bottom: rect.bottom,
          },
        })
      }
    }
    
    return violations
  })
  
  return {
    invariant_id: 'PANELS_NEVER_REQUIRE_HORIZONTAL_SCROLL',
    invariant_name: 'Panels must never require horizontal scrolling',
    passed: violations.length === 0,
    violations,
    context: { viewport: context.viewport },
  }
}

/**
 * INVARIANT 3: Window must be resizable unless in E2E mode
 * 
 * Property: app.isResizable() must return true when not in E2E mode
 */
export async function checkWindowResizableUnlessE2E(
  isResizable: boolean,
  context: InvariantContext
): Promise<InvariantResult> {
  // In E2E mode, non-resizable is acceptable
  if (context.isE2EMode) {
    return {
      invariant_id: 'WINDOW_RESIZABLE_UNLESS_E2E',
      invariant_name: 'Window must be resizable (unless E2E mode)',
      passed: true,
      violations: [],
      context: { isE2EMode: true },
    }
  }
  
  if (!isResizable) {
    return {
      invariant_id: 'WINDOW_RESIZABLE_UNLESS_E2E',
      invariant_name: 'Window must be resizable (unless E2E mode)',
      passed: false,
      violations: [{
        element_description: 'Application window',
        selector_hint: 'BrowserWindow',
        reason: 'Window is not resizable and E2E mode is not active',
      }],
      context: { isE2EMode: false },
    }
  }
  
  return {
    invariant_id: 'WINDOW_RESIZABLE_UNLESS_E2E',
    invariant_name: 'Window must be resizable (unless E2E mode)',
    passed: true,
    violations: [],
    context: { isE2EMode: false },
  }
}

/**
 * INVARIANT 4: No more than 1 nested scrollable per panel
 * 
 * Property: for every panel P, count of descendants with active scrollbars <= 1
 */
export async function checkNestedScrollablesLimit(
  page: Page,
  context: InvariantContext
): Promise<InvariantResult> {
  const violations = await page.evaluate(() => {
    const violations: InvariantViolation[] = []
    
    // Find all potential panel containers
    const panelCandidates = [
      ...document.querySelectorAll('[role="region"]'),
      ...document.querySelectorAll('[data-testid*="panel"]'),
      ...document.querySelectorAll('main, aside, section'),
      ...document.querySelectorAll('[class*="panel"], [class*="sidebar"]'),
    ]
    
    const panels = [...new Set(panelCandidates)]
    
    for (const panel of panels) {
      const style = window.getComputedStyle(panel)
      if (style.display === 'none' || style.visibility === 'hidden') continue
      
      const rect = panel.getBoundingClientRect()
      if (rect.width === 0 || rect.height === 0) continue
      
      // Count scrollable descendants
      let scrollableCount = 0
      const scrollableElements: string[] = []
      
      const walk = (el: Element) => {
        const elStyle = window.getComputedStyle(el)
        const hasVerticalScroll = (elStyle.overflowY === 'scroll' || elStyle.overflowY === 'auto') 
          && el.scrollHeight > el.clientHeight
        const hasHorizontalScroll = (elStyle.overflowX === 'scroll' || elStyle.overflowX === 'auto')
          && el.scrollWidth > el.clientWidth
          
        if (hasVerticalScroll || hasHorizontalScroll) {
          scrollableCount++
          scrollableElements.push(el.tagName.toLowerCase() + (el.className ? `.${el.className.split(' ')[0]}` : ''))
        }
        
        Array.from(el.children).forEach(child => walk(child))
      }
      walk(panel)
      
      if (scrollableCount > 1) {
        const panelId = panel.getAttribute('data-testid') || panel.tagName.toLowerCase()
        
        violations.push({
          element_description: `Panel ${panelId} has ${scrollableCount} nested scrollables`,
          selector_hint: panel.getAttribute('data-testid') 
            ? `[data-testid="${panel.getAttribute('data-testid')}"]`
            : panel.tagName.toLowerCase(),
          reason: `Found ${scrollableCount} scrollable elements: ${scrollableElements.join(', ')}`,
          bounds: {
            left: rect.left,
            top: rect.top,
            right: rect.right,
            bottom: rect.bottom,
          },
        })
      }
    }
    
    return violations
  })
  
  return {
    invariant_id: 'NESTED_SCROLLABLES_LIMIT',
    invariant_name: 'Panels must not have nested scrollable containers',
    passed: violations.length === 0,
    violations,
    context: { viewport: context.viewport },
  }
}

// ============================================================================
// INVARIANT RUNNER
// ============================================================================

/**
 * Run all property-based invariants and return combined results
 */
export async function runAllInvariants(
  page: Page,
  isResizable: boolean,
  context: InvariantContext
): Promise<InvariantResult[]> {
  const results: InvariantResult[] = []
  
  results.push(await checkPanelsNeverClipButtons(page, context))
  results.push(await checkPanelsNeverRequireHorizontalScroll(page, context))
  results.push(await checkWindowResizableUnlessE2E(isResizable, context))
  results.push(await checkNestedScrollablesLimit(page, context))
  
  return results
}

/**
 * Generate markdown section for invariant results
 */
export function generateInvariantSection(results: InvariantResult[]): string {
  const lines: string[] = []
  
  const passed = results.filter(r => r.passed)
  const failed = results.filter(r => !r.passed)
  
  lines.push('### 🔒 Property-Based Invariants')
  lines.push('')
  
  if (failed.length === 0) {
    lines.push('All invariants hold:')
    lines.push('')
    for (const r of passed) {
      lines.push(`- ✅ **${r.invariant_id}**: ${r.invariant_name}`)
    }
    lines.push('')
    return lines.join('\n')
  }
  
  lines.push(`**${failed.length} invariant(s) violated:**`)
  lines.push('')
  
  for (const r of failed) {
    lines.push(`#### ❌ ${r.invariant_id}`)
    lines.push('')
    lines.push(`*${r.invariant_name}*`)
    lines.push('')
    
    if (r.violations.length > 0) {
      lines.push('| Element | Reason |')
      lines.push('|---------|--------|')
      for (const v of r.violations.slice(0, 10)) { // Limit to first 10
        lines.push(`| ${v.element_description} | ${v.reason} |`)
      }
      if (r.violations.length > 10) {
        lines.push(`| ... | *${r.violations.length - 10} more violations* |`)
      }
      lines.push('')
    }
  }
  
  if (passed.length > 0) {
    lines.push('**Invariants that hold:**')
    lines.push('')
    for (const r of passed) {
      lines.push(`- ✅ ${r.invariant_id}`)
    }
    lines.push('')
  }
  
  return lines.join('\n')
}
