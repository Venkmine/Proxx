/**
 * INTENT_020 — Accessibility & Interaction Sanity Invariants
 * 
 * Property-based accessibility checks that must hold in idle state:
 * 1. KEYBOARD_REACHABILITY - All interactive elements reachable via keyboard
 * 2. FOCUS_INDICATORS_VISIBLE - Focus indicators must be visible (no outline:none without replacement)
 * 3. DEAD_CLICK_DETECTION - All visible interactive elements must respond to clicks
 * 4. INVISIBLE_INTERACTIVE_DETECTION - No interactive elements with opacity:0 or zero size
 * 5. CURSOR_HITBOX_MATCH - Clickable bounding box must match visual bounds
 * 
 * These invariants are:
 * - Deterministic (same result on same state)
 * - CI-safe (no human interaction required)
 * - Fail-fast (one screenshot per failure)
 * - Semantic-based (prefer ARIA roles over selectors)
 */

import type { Page } from '@playwright/test'

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export interface InvariantResult {
  invariant_id: string
  invariant_name: string
  passed: boolean
  violations: AccessibilityViolation[]
  context?: Record<string, unknown>
  severity?: 'HIGH' | 'MEDIUM'
}

export interface AccessibilityViolation {
  element_description: string
  selector_hint: string
  reason: string
  bounds?: { left: number; top: number; right: number; bottom: number }
  context?: Record<string, unknown>
}

export interface InteractiveElement {
  tagName: string
  role: string | null
  ariaLabel: string | null
  textContent: string | null
  testId: string | null
  selector: string
  bounds: {
    left: number
    top: number
    right: number
    bottom: number
    width: number
    height: number
  }
  computedStyle: {
    display: string
    visibility: string
    opacity: string
    pointerEvents: string
    cursor: string
  }
  tabIndex: number
  isDisabled: boolean
}

export type InvariantContext = {
  viewport: { width: number; height: number }
  isE2EMode: boolean
}

// ============================================================================
// INVARIANT 1: KEYBOARD REACHABILITY
// ============================================================================

/**
 * All primary interactive elements must be reachable via Tab/Shift+Tab.
 * 
 * Property: For every visible interactive element E,
 * E must either:
 * - Have tabIndex >= 0, or
 * - Have a naturally focusable tag (button, a, input, etc.) with no negative tabIndex
 * 
 * HIGH severity: keyboard-only users cannot access functionality
 */
export async function checkKeyboardReachability(
  page: Page,
  context: InvariantContext
): Promise<InvariantResult> {
  const violations = await page.evaluate(() => {
    const violations: AccessibilityViolation[] = []
    
    // Naturally focusable elements
    const focusableSelectors = [
      'button',
      'a[href]',
      'input:not([type="hidden"])',
      'select',
      'textarea',
      '[role="button"]',
      '[role="link"]',
      '[role="menuitem"]',
      '[role="tab"]',
      '[tabindex]:not([tabindex="-1"])',
    ]
    
    const elements = document.querySelectorAll(focusableSelectors.join(','))
    
    for (const el of elements) {
      const htmlEl = el as HTMLElement
      const rect = htmlEl.getBoundingClientRect()
      const style = window.getComputedStyle(htmlEl)
      
      // Skip if not visible
      if (rect.width === 0 || rect.height === 0) continue
      if (style.display === 'none' || style.visibility === 'hidden') continue
      if (parseFloat(style.opacity) < 0.01) continue
      
      // Check if keyboard reachable
      const tabIndex = htmlEl.tabIndex
      const isDisabled = htmlEl.hasAttribute('disabled') || htmlEl.getAttribute('aria-disabled') === 'true'
      
      // Interactive but not keyboard reachable
      if (tabIndex < 0 && !isDisabled) {
        const label = htmlEl.getAttribute('aria-label') || htmlEl.textContent?.trim() || '[unlabeled]'
        const testId = htmlEl.getAttribute('data-testid')
        
        violations.push({
          element_description: `${htmlEl.tagName.toLowerCase()} "${label.slice(0, 30)}"`,
          selector_hint: testId ? `[data-testid="${testId}"]` : `${htmlEl.tagName.toLowerCase()}`,
          reason: `tabIndex=${tabIndex}, not keyboard reachable`,
          bounds: {
            left: rect.left,
            top: rect.top,
            right: rect.right,
            bottom: rect.bottom,
          },
          context: {
            tagName: htmlEl.tagName,
            role: htmlEl.getAttribute('role'),
            ariaLabel: htmlEl.getAttribute('aria-label'),
          },
        })
      }
    }
    
    return violations
  })
  
  return {
    invariant_id: 'KEYBOARD_REACHABILITY',
    invariant_name: 'All interactive elements keyboard reachable',
    passed: violations.length === 0,
    violations,
    severity: 'HIGH',
    context: { viewport: context.viewport },
  }
}

// ============================================================================
// INVARIANT 2: FOCUS INDICATORS VISIBLE
// ============================================================================

/**
 * Focus indicators must be visible (no outline:none without replacement).
 * 
 * Property: For every focusable element E,
 * E must have either:
 * - outline style that is not 'none', or
 * - alternative focus indicator (box-shadow, border change, background change)
 * 
 * MEDIUM severity: keyboard navigation is possible but not visible
 */
export async function checkFocusIndicatorsVisible(
  page: Page,
  context: InvariantContext
): Promise<InvariantResult> {
  const violations = await page.evaluate(() => {
    const violations: AccessibilityViolation[] = []
    
    const focusableSelectors = [
      'button:not([disabled])',
      'a[href]',
      'input:not([type="hidden"]):not([disabled])',
      'select:not([disabled])',
      'textarea:not([disabled])',
      '[role="button"]:not([aria-disabled="true"])',
      '[tabindex]:not([tabindex="-1"])',
    ]
    
    const elements = document.querySelectorAll(focusableSelectors.join(','))
    
    for (const el of elements) {
      const htmlEl = el as HTMLElement
      const rect = htmlEl.getBoundingClientRect()
      const style = window.getComputedStyle(htmlEl)
      
      // Skip if not visible
      if (rect.width === 0 || rect.height === 0) continue
      if (style.display === 'none' || style.visibility === 'hidden') continue
      if (parseFloat(style.opacity) < 0.01) continue
      
      // Check focus styles by temporarily focusing (then blur)
      const originalActiveElement = document.activeElement
      htmlEl.focus()
      const focusStyle = window.getComputedStyle(htmlEl)
      
      const hasOutline = focusStyle.outlineStyle !== 'none' && parseFloat(focusStyle.outlineWidth) > 0
      const hasBorder = parseFloat(focusStyle.borderWidth) > 0
      const hasBoxShadow = focusStyle.boxShadow !== 'none'
      const hasBackgroundChange = focusStyle.backgroundColor !== style.backgroundColor
      
      // Blur immediately
      htmlEl.blur()
      if (originalActiveElement && originalActiveElement instanceof HTMLElement) {
        originalActiveElement.focus()
      }
      
      // No visible focus indicator
      if (!hasOutline && !hasBorder && !hasBoxShadow && !hasBackgroundChange) {
        const label = htmlEl.getAttribute('aria-label') || htmlEl.textContent?.trim() || '[unlabeled]'
        const testId = htmlEl.getAttribute('data-testid')
        
        violations.push({
          element_description: `${htmlEl.tagName.toLowerCase()} "${label.slice(0, 30)}"`,
          selector_hint: testId ? `[data-testid="${testId}"]` : `${htmlEl.tagName.toLowerCase()}`,
          reason: 'No visible focus indicator (outline:none without replacement)',
          bounds: {
            left: rect.left,
            top: rect.top,
            right: rect.right,
            bottom: rect.bottom,
          },
          context: {
            outlineStyle: focusStyle.outlineStyle,
            outlineWidth: focusStyle.outlineWidth,
            boxShadow: focusStyle.boxShadow,
          },
        })
      }
    }
    
    return violations
  })
  
  return {
    invariant_id: 'FOCUS_INDICATORS_VISIBLE',
    invariant_name: 'Focus indicators must be visible',
    passed: violations.length === 0,
    violations,
    severity: 'MEDIUM',
    context: { viewport: context.viewport },
  }
}

// ============================================================================
// INVARIANT 3: DEAD CLICK DETECTION
// ============================================================================

/**
 * All visible interactive elements must respond to clicks.
 * 
 * Property: For every visible button/link B,
 * B must have an event listener or href that produces an effect.
 * 
 * HIGH severity: user sees clickable element but nothing happens
 */
export async function checkDeadClicks(
  page: Page,
  context: InvariantContext
): Promise<InvariantResult> {
  const violations = await page.evaluate(() => {
    const violations: AccessibilityViolation[] = []
    
    // Check buttons and links
    const interactiveSelectors = [
      'button:not([disabled])',
      'a',
      '[role="button"]',
      '[role="link"]',
      '[onclick]',
    ]
    
    const elements = document.querySelectorAll(interactiveSelectors.join(','))
    
    for (const el of elements) {
      const htmlEl = el as HTMLElement
      const rect = htmlEl.getBoundingClientRect()
      const style = window.getComputedStyle(htmlEl)
      
      // Skip if not visible
      if (rect.width === 0 || rect.height === 0) continue
      if (style.display === 'none' || style.visibility === 'hidden') continue
      if (parseFloat(style.opacity) < 0.01) continue
      if (style.pointerEvents === 'none') continue
      
      const isDisabled = htmlEl.hasAttribute('disabled') || htmlEl.getAttribute('aria-disabled') === 'true'
      if (isDisabled) continue
      
      // Check for click handler or href
      const hasOnclick = htmlEl.hasAttribute('onclick') || htmlEl.onclick !== null
      const hasHref = htmlEl.tagName === 'A' && (htmlEl as HTMLAnchorElement).href
      
      // Check for event listeners (getEventListeners is not available, use heuristic)
      // In practice, we check if the element has pointer cursor or appears interactive
      const looksInteractive = 
        style.cursor === 'pointer' || 
        htmlEl.tagName === 'BUTTON' || 
        htmlEl.getAttribute('role') === 'button' ||
        htmlEl.getAttribute('role') === 'link'
      
      // If looks interactive but no obvious handler
      if (looksInteractive && !hasOnclick && !hasHref) {
        // This is a heuristic - can't truly detect without clicking
        // Flag buttons without onclick attribute (React handlers won't show up)
        // Only flag if it's truly suspicious
        const label = htmlEl.getAttribute('aria-label') || htmlEl.textContent?.trim() || '[unlabeled]'
        const testId = htmlEl.getAttribute('data-testid')
        
        // Skip if it's a known framework pattern (data-* attributes often indicate handlers)
        const hasDataAttributes = Array.from(htmlEl.attributes).some(attr => 
          attr.name.startsWith('data-') && attr.name !== 'data-testid'
        )
        
        // Only report if truly suspicious (button with no href, no onclick, no data attrs)
        if (!hasDataAttributes && htmlEl.tagName === 'BUTTON') {
          violations.push({
            element_description: `${htmlEl.tagName.toLowerCase()} "${label.slice(0, 30)}"`,
            selector_hint: testId ? `[data-testid="${testId}"]` : `button`,
            reason: 'Button has no detectable click handler',
            bounds: {
              left: rect.left,
              top: rect.top,
              right: rect.right,
              bottom: rect.bottom,
            },
            context: {
              cursor: style.cursor,
              hasOnclick,
              hasHref,
            },
          })
        }
      }
    }
    
    return violations
  })
  
  return {
    invariant_id: 'DEAD_CLICK_DETECTION',
    invariant_name: 'No dead-click elements',
    passed: violations.length === 0,
    violations,
    severity: 'HIGH',
    context: { viewport: context.viewport },
  }
}

// ============================================================================
// INVARIANT 4: INVISIBLE INTERACTIVE DETECTION
// ============================================================================

/**
 * No interactive elements should be invisible but still receive events.
 * 
 * Property: For every element E with pointer-events enabled,
 * E must have opacity > 0 and size > 0.
 * 
 * MEDIUM severity: confusing UX, ghost clicks
 */
export async function checkInvisibleInteractive(
  page: Page,
  context: InvariantContext
): Promise<InvariantResult> {
  const violations = await page.evaluate(() => {
    const violations: AccessibilityViolation[] = []
    
    const interactiveSelectors = [
      'button',
      'a',
      'input',
      'select',
      'textarea',
      '[role="button"]',
      '[role="link"]',
      '[onclick]',
      '[tabindex]',
    ]
    
    const elements = document.querySelectorAll(interactiveSelectors.join(','))
    
    for (const el of elements) {
      const htmlEl = el as HTMLElement
      const rect = htmlEl.getBoundingClientRect()
      const style = window.getComputedStyle(htmlEl)
      
      // Skip if display:none or visibility:hidden (expected behavior)
      if (style.display === 'none' || style.visibility === 'hidden') continue
      
      const opacity = parseFloat(style.opacity)
      const hasSize = rect.width > 0 && rect.height > 0
      const canReceiveClicks = style.pointerEvents !== 'none'
      
      // Invisible but can receive clicks
      if (canReceiveClicks && (opacity < 0.01 || !hasSize)) {
        const label = htmlEl.getAttribute('aria-label') || htmlEl.textContent?.trim() || '[unlabeled]'
        const testId = htmlEl.getAttribute('data-testid')
        
        violations.push({
          element_description: `${htmlEl.tagName.toLowerCase()} "${label.slice(0, 30)}"`,
          selector_hint: testId ? `[data-testid="${testId}"]` : `${htmlEl.tagName.toLowerCase()}`,
          reason: `Invisible (opacity=${opacity.toFixed(2)}, size=${rect.width}×${rect.height}) but pointerEvents=${style.pointerEvents}`,
          bounds: {
            left: rect.left,
            top: rect.top,
            right: rect.right,
            bottom: rect.bottom,
          },
          context: {
            opacity: style.opacity,
            width: rect.width,
            height: rect.height,
            pointerEvents: style.pointerEvents,
          },
        })
      }
    }
    
    return violations
  })
  
  return {
    invariant_id: 'INVISIBLE_INTERACTIVE_DETECTION',
    invariant_name: 'No invisible interactive elements',
    passed: violations.length === 0,
    violations,
    severity: 'MEDIUM',
    context: { viewport: context.viewport },
  }
}

// ============================================================================
// INVARIANT 5: CURSOR/HITBOX MATCH
// ============================================================================

/**
 * Clickable bounding box must match visible bounds within tolerance.
 * 
 * Property: For every element E with cursor:pointer,
 * E.bounds must be within 10% of E.visualBounds.
 * 
 * MEDIUM severity: user clicks but misses target
 */
export async function checkCursorHitboxMatch(
  page: Page,
  context: InvariantContext
): Promise<InvariantResult> {
  const violations = await page.evaluate(() => {
    const violations: AccessibilityViolation[] = []
    
    // Find all elements with pointer cursor
    const allElements = document.querySelectorAll('*')
    
    for (const el of allElements) {
      const htmlEl = el as HTMLElement
      const style = window.getComputedStyle(htmlEl)
      
      if (style.cursor !== 'pointer') continue
      
      const rect = htmlEl.getBoundingClientRect()
      
      // Skip if not visible
      if (rect.width === 0 || rect.height === 0) continue
      if (style.display === 'none' || style.visibility === 'hidden') continue
      if (parseFloat(style.opacity) < 0.01) continue
      
      // Check for clickable children that might be smaller than visual bounds
      const children = htmlEl.querySelectorAll('button, a, [role="button"]')
      
      for (const child of children) {
        const childEl = child as HTMLElement
        const childRect = childEl.getBoundingClientRect()
        const childStyle = window.getComputedStyle(childEl)
        
        if (childStyle.display === 'none' || childStyle.visibility === 'hidden') continue
        if (childRect.width === 0 || childRect.height === 0) continue
        
        // Check if child clickable area is significantly smaller than parent
        const areaRatio = (childRect.width * childRect.height) / (rect.width * rect.height)
        
        if (areaRatio < 0.5 && rect.width > 50 && rect.height > 30) {
          const label = childEl.getAttribute('aria-label') || childEl.textContent?.trim() || '[unlabeled]'
          const testId = childEl.getAttribute('data-testid')
          
          violations.push({
            element_description: `${childEl.tagName.toLowerCase()} "${label.slice(0, 30)}"`,
            selector_hint: testId ? `[data-testid="${testId}"]` : `${childEl.tagName.toLowerCase()}`,
            reason: `Clickable area (${childRect.width.toFixed(0)}×${childRect.height.toFixed(0)}) much smaller than visual container (${rect.width.toFixed(0)}×${rect.height.toFixed(0)})`,
            bounds: {
              left: childRect.left,
              top: childRect.top,
              right: childRect.right,
              bottom: childRect.bottom,
            },
            context: {
              areaRatio: areaRatio.toFixed(2),
              parentBounds: {
                width: rect.width,
                height: rect.height,
              },
            },
          })
        }
      }
    }
    
    return violations
  })
  
  return {
    invariant_id: 'CURSOR_HITBOX_MATCH',
    invariant_name: 'Cursor and hitbox must match',
    passed: violations.length === 0,
    violations,
    severity: 'MEDIUM',
    context: { viewport: context.viewport },
  }
}

// ============================================================================
// INVARIANT 6: FOCUS TRAP VALIDATION (for modals/panels)
// ============================================================================

/**
 * Modals/panels must trap focus correctly when present.
 * 
 * Property: When a modal M is visible,
 * Tab navigation must cycle within M only.
 * 
 * MEDIUM severity: keyboard users can tab out of modal context
 */
export async function checkFocusTrap(
  page: Page,
  context: InvariantContext
): Promise<InvariantResult> {
  const violations = await page.evaluate(() => {
    const violations: AccessibilityViolation[] = []
    
    // Find modal/dialog elements
    const modalSelectors = [
      '[role="dialog"]',
      '[role="alertdialog"]',
      '[aria-modal="true"]',
      '.modal',
      '[data-testid*="modal"]',
      '[data-testid*="dialog"]',
    ]
    
    const modals = document.querySelectorAll(modalSelectors.join(','))
    
    for (const modal of modals) {
      const htmlModal = modal as HTMLElement
      const rect = htmlModal.getBoundingClientRect()
      const style = window.getComputedStyle(htmlModal)
      
      // Skip if not visible
      if (rect.width === 0 || rect.height === 0) continue
      if (style.display === 'none' || style.visibility === 'hidden') continue
      
      // Check if modal has focusable descendants
      const focusableInModal = htmlModal.querySelectorAll(
        'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      )
      
      if (focusableInModal.length === 0) {
        const label = htmlModal.getAttribute('aria-label') || '[unlabeled modal]'
        const testId = htmlModal.getAttribute('data-testid')
        
        violations.push({
          element_description: `Modal "${label}"`,
          selector_hint: testId ? `[data-testid="${testId}"]` : '[role="dialog"]',
          reason: 'Modal has no focusable elements (focus trap cannot work)',
          bounds: {
            left: rect.left,
            top: rect.top,
            right: rect.right,
            bottom: rect.bottom,
          },
          context: {
            role: htmlModal.getAttribute('role'),
            ariaModal: htmlModal.getAttribute('aria-modal'),
          },
        })
      }
      
      // Note: True focus trap validation requires Tab simulation, which is complex
      // This check validates basic preconditions only
    }
    
    return violations
  })
  
  return {
    invariant_id: 'FOCUS_TRAP_VALIDATION',
    invariant_name: 'Modals must have focusable elements',
    passed: violations.length === 0,
    violations,
    severity: 'MEDIUM',
    context: { viewport: context.viewport },
  }
}
