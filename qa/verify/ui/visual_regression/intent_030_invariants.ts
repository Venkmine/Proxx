/**
 * INTENT_030 — State & Store Integrity Invariants
 * 
 * Structural guardrails to prevent state fragmentation bugs:
 * 1. SINGLE_OWNERSHIP - Each UI domain reads from ONE store only
 * 2. NO_DUAL_WRITES - A single user action must not mutate more than one state store
 * 3. DEPRECATED_STORE_DETECTION - Any write to deprecated stores = HIGH severity
 * 4. STATE_TRANSITION_VISIBILITY - Every semantic action causes logged transition or measurable delta
 * 5. READ_AFTER_WRITE_CONSISTENCY - UI indicators reflect store state within same tick or next render
 * 
 * These invariants prevent "UI looks right but state is wrong" bugs.
 */

import type { Page } from '@playwright/test'

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export interface StoreInvariantResult {
  invariant_id: string
  invariant_name: string
  passed: boolean
  violations: StoreViolation[]
  context?: Record<string, unknown>
  severity?: 'HIGH' | 'MEDIUM'
}

export interface StoreViolation {
  domain: string
  issue: string
  details: string
  evidence?: Record<string, unknown>
  recommendation?: string
}

export interface StoreDiagnostics {
  sourceSelection: {
    state: string
    selectedPaths: number
    outputDirectory: string
    preflightResult: unknown
  }
  v2Mode: {
    isV2ModeEnabled: boolean
    v2ExecutionStatus: string
    v2JobSpecSubmitted: boolean
    v2LastResult: unknown
  }
  preset: {
    activePresetId: string | null
    isDirty: boolean
    isVisualPreviewModalOpen: boolean
    isBurnInsEditorOpen: boolean
  }
  workspaceMode: {
    workspaceMode: string
    previousMode: string
  }
}

export interface DOMStateSnapshot {
  sources: {
    hasSourcePanel: boolean
    showsSelectedFiles: boolean
    sourceCount: number
  }
  jobConfig: {
    hasConfigPanel: boolean
    presetSelectorVisible: boolean
    activePresetDisplayed: string | null
  }
  v2Result: {
    hasResultPanel: boolean
    showsResults: boolean
  }
}

export type InvariantContext = {
  viewport: { width: number; height: number }
  isE2EMode: boolean
}

// ============================================================================
// STORE DIAGNOSTICS
// ============================================================================

/**
 * Expose store state for QC inspection.
 * This is injected into window for Playwright to read.
 */
export async function exposeStoreDiagnostics(page: Page): Promise<void> {
  await page.evaluate(() => {
    // @ts-ignore - dynamic store access
    if (window.__QC_STORE_DIAGNOSTICS__) {
      console.log('[QC] Store diagnostics already exposed')
      return
    }
    
    // Create a diagnostic accessor that reads from actual stores
    // @ts-ignore
    window.__QC_STORE_DIAGNOSTICS__ = () => {
      try {
        // Access Zustand stores via window.__ZUSTAND_STORES__ if exposed
        // OR via direct import paths if available
        const diagnostics: any = {
          sourceSelection: null,
          v2Mode: null,
          preset: null,
          workspaceMode: null,
          timestamp: new Date().toISOString(),
        }
        
        // Try to access stores from global registry (if we add it)
        // @ts-ignore
        const stores = window.__ZUSTAND_STORES__ || {}
        
        if (stores.sourceSelection) {
          const state = stores.sourceSelection.getState()
          diagnostics.sourceSelection = {
            state: state.state,
            selectedPaths: state.selectedPaths?.length || 0,
            outputDirectory: state.outputDirectory || '',
            preflightResult: state.preflightResult ? 'present' : null,
          }
        }
        
        if (stores.v2Mode) {
          const state = stores.v2Mode.getState()
          diagnostics.v2Mode = {
            isV2ModeEnabled: state.isV2ModeEnabled,
            v2ExecutionStatus: state.v2ExecutionStatus,
            v2JobSpecSubmitted: state.v2JobSpecSubmitted,
            v2LastResult: state.v2LastResult ? 'present' : null,
          }
        }
        
        if (stores.preset) {
          const state = stores.preset.getState()
          diagnostics.preset = {
            activePresetId: state.activePresetId,
            isDirty: state.isDirty,
            isVisualPreviewModalOpen: state.isVisualPreviewModalOpen,
            isBurnInsEditorOpen: state.isBurnInsEditorOpen,
          }
        }
        
        if (stores.workspaceMode) {
          const state = stores.workspaceMode.getState()
          diagnostics.workspaceMode = {
            workspaceMode: state.workspaceMode,
            previousMode: state.previousMode,
          }
        }
        
        return diagnostics
      } catch (e) {
        console.error('[QC] Failed to get store diagnostics:', e)
        return { error: String(e) }
      }
    }
    
    console.log('[QC] Store diagnostics exposed as window.__QC_STORE_DIAGNOSTICS__()')
  })
}

/**
 * Read current store diagnostics
 */
export async function getStoreDiagnostics(page: Page): Promise<StoreDiagnostics | null> {
  return await page.evaluate(() => {
    // @ts-ignore
    if (typeof window.__QC_STORE_DIAGNOSTICS__ === 'function') {
      // @ts-ignore
      return window.__QC_STORE_DIAGNOSTICS__()
    }
    return null
  })
}

/**
 * Capture DOM state snapshot for correlation with store state
 */
export async function captureDOMState(page: Page): Promise<DOMStateSnapshot> {
  return await page.evaluate(() => {
    const sources = {
      hasSourcePanel: !!document.querySelector('[data-testid="source-panel"], [data-testid="source-selection-panel"]'),
      showsSelectedFiles: !!document.querySelector('[data-testid="selected-files"], [data-testid="source-list"]'),
      sourceCount: document.querySelectorAll('[data-testid*="source-item"]').length,
    }
    
    const jobConfig = {
      hasConfigPanel: !!document.querySelector('[data-testid="job-config"], [data-testid="config-panel"]'),
      presetSelectorVisible: !!document.querySelector('[data-testid="preset-selector"]'),
      activePresetDisplayed: document.querySelector('[data-testid="preset-selector"]')?.textContent?.trim() || null,
    }
    
    const v2Result = {
      hasResultPanel: !!document.querySelector('[data-testid="v2-result-panel"]'),
      showsResults: !!document.querySelector('[data-testid="v2-result-panel"] [data-testid*="result"]'),
    }
    
    return { sources, jobConfig, v2Result }
  })
}

// ============================================================================
// INVARIANT 1: SINGLE OWNERSHIP
// ============================================================================

/**
 * Each UI domain must read from ONE store only.
 * 
 * Property: For every UI domain D,
 * D reads state from exactly one Zustand store.
 * 
 * Domains:
 * - sources: useSourceSelectionStore ONLY
 * - job config: usePresetStore ONLY
 * - v2 results: useV2ModeStore ONLY
 * - workspace layout: useWorkspaceModeStore ONLY
 * 
 * HIGH severity: Multiple stores owning same UI domain = state fragmentation
 */
export async function checkSingleOwnership(
  page: Page,
  context: InvariantContext
): Promise<StoreInvariantResult> {
  const violations: StoreViolation[] = []
  
  // This invariant is enforced by code review and component structure
  // For runtime check, we verify no deprecated patterns exist
  
  // Check for dual-state patterns in DOM (ad-hoc state management)
  const dualStatePatterns = await page.evaluate(() => {
    const issues: Array<{ domain: string; issue: string; details: string }> = []
    
    // Check if source panel reads from multiple sources
    const sourcePanel = document.querySelector('[data-testid="source-panel"], [data-testid="source-selection-panel"]')
    if (sourcePanel) {
      // Look for deprecated data attributes that suggest dual state
      const hasDeprecatedState = sourcePanel.querySelector('[data-has-sources], [data-source-count]')
      if (hasDeprecatedState) {
        issues.push({
          domain: 'sources',
          issue: 'Deprecated state attributes detected',
          details: 'Source panel uses deprecated data-has-sources or data-source-count attributes',
        })
      }
    }
    
    // Check for workspace mode state leakage (components adapting without checking store)
    const panels = document.querySelectorAll('[class*="panel"], [class*="content"]')
    for (const panel of panels) {
      const style = window.getComputedStyle(panel as Element)
      const classList = (panel as Element).classList.toString()
      
      // Check if panel has responsive classes that suggest it's adapting without workspace mode
      if (classList.match(/adaptive|responsive|flex-wrap/) && !classList.match(/mode-/)) {
        // This is suspicious but not definitive - log for review
        // (not a violation unless we find dual state reads)
      }
    }
    
    return issues
  })
  
  for (const issue of dualStatePatterns) {
    violations.push({
      domain: issue.domain,
      issue: issue.issue,
      details: issue.details,
      recommendation: 'Remove deprecated state attributes and read from authoritative Zustand store only',
    })
  }
  
  return {
    invariant_id: 'SINGLE_OWNERSHIP',
    invariant_name: 'Single ownership per UI domain',
    passed: violations.length === 0,
    violations,
    severity: 'HIGH',
    context: { viewport: context.viewport },
  }
}

// ============================================================================
// INVARIANT 2: NO DUAL WRITES
// ============================================================================

/**
 * A single user action must not mutate more than one state store.
 * 
 * Property: For every user action A,
 * A updates at most one Zustand store.
 * 
 * MEDIUM severity: Dual writes create synchronization issues
 */
export async function checkNoDualWrites(
  page: Page,
  context: InvariantContext
): Promise<StoreInvariantResult> {
  const violations: StoreViolation[] = []
  
  // This is primarily enforced by code review and store design
  // At runtime, we can detect symptoms of dual-write issues
  
  // Check: If sources are selected, ONLY sourceSelectionStore should have changed
  const diagnostics = await getStoreDiagnostics(page)
  const domState = await captureDOMState(page)
  
  if (diagnostics) {
    // Check for state inconsistency (symptom of dual writes)
    if (diagnostics.sourceSelection && domState.sources.showsSelectedFiles) {
      const storeHasSources = diagnostics.sourceSelection.selectedPaths > 0
      const domShowsSources = domState.sources.sourceCount > 0
      
      if (storeHasSources !== domShowsSources) {
        violations.push({
          domain: 'sources',
          issue: 'Store/DOM state mismatch',
          details: `Store has ${diagnostics.sourceSelection.selectedPaths} sources, DOM shows ${domState.sources.sourceCount} items`,
          evidence: {
            store: diagnostics.sourceSelection,
            dom: domState.sources,
          },
          recommendation: 'Ensure UI reads ONLY from sourceSelectionStore, not local state',
        })
      }
    }
    
    // Check for preset/workspace mode coupling (symptom of dual write)
    if (diagnostics.preset && diagnostics.workspaceMode) {
      if (diagnostics.preset.isVisualPreviewModalOpen && diagnostics.workspaceMode.workspaceMode !== 'design') {
        violations.push({
          domain: 'workspace_layout',
          issue: 'Preset modal open but workspace mode not design',
          details: `Visual preview modal is open (${diagnostics.preset.isVisualPreviewModalOpen}) but workspace mode is ${diagnostics.workspaceMode.workspaceMode}`,
          evidence: {
            preset: diagnostics.preset,
            workspaceMode: diagnostics.workspaceMode,
          },
          recommendation: 'Visual preview modal should control workspace mode via single action',
        })
      }
    }
  }
  
  return {
    invariant_id: 'NO_DUAL_WRITES',
    invariant_name: 'No dual writes per action',
    passed: violations.length === 0,
    violations,
    severity: 'MEDIUM',
    context: { viewport: context.viewport },
  }
}

// ============================================================================
// INVARIANT 3: DEPRECATED STORE DETECTION
// ============================================================================

/**
 * No writes to deprecated stores or state patterns.
 * 
 * Known deprecated patterns:
 * - workspaceModeStore.isBurnInsEditorOpen (use isVisualPreviewModalOpen)
 * - Ad-hoc useState for source selection (use sourceSelectionStore)
 * - Local storage for preset dirty state (use presetStore.isDirty)
 * 
 * HIGH severity: Writing to deprecated stores reintroduces fragmentation bugs
 */
export async function checkDeprecatedStores(
  page: Page,
  context: InvariantContext
): Promise<StoreInvariantResult> {
  const violations: StoreViolation[] = []
  
  const diagnostics = await getStoreDiagnostics(page)
  
  if (diagnostics && diagnostics.preset) {
    // Check if deprecated isBurnInsEditorOpen is used instead of isVisualPreviewModalOpen
    if (diagnostics.preset.isBurnInsEditorOpen && !diagnostics.preset.isVisualPreviewModalOpen) {
      violations.push({
        domain: 'preset',
        issue: 'Using deprecated isBurnInsEditorOpen',
        details: 'isBurnInsEditorOpen is true but isVisualPreviewModalOpen is false',
        evidence: { preset: diagnostics.preset },
        recommendation: 'Use isVisualPreviewModalOpen exclusively, remove isBurnInsEditorOpen',
      })
    }
  }
  
  // Check for localStorage pollution (sign of deprecated patterns)
  const localStorageCheck = await page.evaluate(() => {
    const deprecatedKeys: string[] = []
    const suspicious = [
      'hasSources',
      'selectedFiles',
      'isLoading',
      'burnInsOpen',
      'workspaceMode',
    ]
    
    for (const key of suspicious) {
      if (localStorage.getItem(key) !== null) {
        deprecatedKeys.push(key)
      }
    }
    
    return deprecatedKeys
  })
  
  if (localStorageCheck.length > 0) {
    violations.push({
      domain: 'global',
      issue: 'Deprecated localStorage keys detected',
      details: `Found deprecated keys: ${localStorageCheck.join(', ')}`,
      evidence: { keys: localStorageCheck },
      recommendation: 'Remove localStorage usage, use Zustand stores exclusively',
    })
  }
  
  return {
    invariant_id: 'DEPRECATED_STORE_DETECTION',
    invariant_name: 'No deprecated store usage',
    passed: violations.length === 0,
    violations,
    severity: 'HIGH',
    context: { viewport: context.viewport },
  }
}

// ============================================================================
// INVARIANT 4: STATE TRANSITION VISIBILITY
// ============================================================================

/**
 * Every semantic action must cause a logged transition or measurable state delta.
 * 
 * Property: For every semantic action A,
 * A either:
 * - Logs a transition via console/telemetry, OR
 * - Causes measurable store state change
 * 
 * MEDIUM severity: Silent state changes make debugging impossible
 */
export async function checkStateTransitionVisibility(
  page: Page,
  context: InvariantContext
): Promise<StoreInvariantResult> {
  const violations: StoreViolation[] = []
  
  // Capture store state before and after potential action
  const beforeState = await getStoreDiagnostics(page)
  
  // Simulate a non-action (idle state) - we should see no silent changes
  await page.waitForTimeout(100)
  
  const afterState = await getStoreDiagnostics(page)
  
  if (beforeState && afterState) {
    // Check for silent state changes (state changed without action)
    const changes: string[] = []
    
    // Compare source selection state
    if (beforeState.sourceSelection && afterState.sourceSelection) {
      if (beforeState.sourceSelection.state !== afterState.sourceSelection.state) {
        changes.push(`sourceSelection.state: ${beforeState.sourceSelection.state} → ${afterState.sourceSelection.state}`)
      }
    }
    
    // Compare v2 mode state
    if (beforeState.v2Mode && afterState.v2Mode) {
      if (beforeState.v2Mode.v2ExecutionStatus !== afterState.v2Mode.v2ExecutionStatus) {
        changes.push(`v2Mode.v2ExecutionStatus: ${beforeState.v2Mode.v2ExecutionStatus} → ${afterState.v2Mode.v2ExecutionStatus}`)
      }
    }
    
    // If changes occurred without user action, this is suspicious
    if (changes.length > 0) {
      violations.push({
        domain: 'global',
        issue: 'Silent state changes detected',
        details: `State changed in idle: ${changes.join('; ')}`,
        evidence: { before: beforeState, after: afterState },
        recommendation: 'State changes must be explicit and triggered by user actions',
      })
    }
  }
  
  return {
    invariant_id: 'STATE_TRANSITION_VISIBILITY',
    invariant_name: 'State transitions are visible',
    passed: violations.length === 0,
    violations,
    severity: 'MEDIUM',
    context: { viewport: context.viewport },
  }
}

// ============================================================================
// INVARIANT 5: READ-AFTER-WRITE CONSISTENCY
// ============================================================================

/**
 * UI indicators must reflect store state within same tick or next render.
 * 
 * Property: For every UI element E displaying store state S,
 * E.displayed_value === S within one React render cycle.
 * 
 * MEDIUM severity: Delayed sync creates confusing UI
 */
export async function checkReadAfterWriteConsistency(
  page: Page,
  context: InvariantContext
): Promise<StoreInvariantResult> {
  const violations: StoreViolation[] = []
  
  const diagnostics = await getStoreDiagnostics(page)
  const domState = await captureDOMState(page)
  
  if (!diagnostics) {
    // Cannot check consistency without store diagnostics
    violations.push({
      domain: 'global',
      issue: 'Store diagnostics unavailable',
      details: 'Cannot verify read-after-write consistency without store access',
      recommendation: 'Ensure stores are exposed for QC inspection',
    })
    
    return {
      invariant_id: 'READ_AFTER_WRITE_CONSISTENCY',
      invariant_name: 'Read-after-write consistency',
      passed: false,
      violations,
      severity: 'MEDIUM',
      context: { viewport: context.viewport },
    }
  }
  
  // Check: Source count in store matches DOM display
  if (diagnostics.sourceSelection && domState.sources.showsSelectedFiles) {
    const storeCount = diagnostics.sourceSelection.selectedPaths
    const domCount = domState.sources.sourceCount
    
    if (storeCount !== domCount) {
      violations.push({
        domain: 'sources',
        issue: 'Store/DOM count mismatch',
        details: `Store shows ${storeCount} sources, DOM displays ${domCount} items`,
        evidence: {
          store: diagnostics.sourceSelection,
          dom: domState.sources,
        },
        recommendation: 'UI must read directly from store, not cached/stale state',
      })
    }
  }
  
  // Check: Preset selector displays active preset from store
  if (diagnostics.preset && domState.jobConfig.presetSelectorVisible) {
    const storePreset = diagnostics.preset.activePresetId
    const domPreset = domState.jobConfig.activePresetDisplayed
    
    if (storePreset && domPreset && !domPreset.includes(storePreset)) {
      violations.push({
        domain: 'preset',
        issue: 'Preset display mismatch',
        details: `Store has preset "${storePreset}", but UI shows "${domPreset}"`,
        evidence: {
          store: diagnostics.preset,
          dom: domState.jobConfig,
        },
        recommendation: 'Preset selector must read activePresetId directly from store',
      })
    }
  }
  
  // Check: Workspace mode reflected in layout
  if (diagnostics.workspaceMode) {
    const mode = diagnostics.workspaceMode.workspaceMode
    const bodyClasses = await page.evaluate(() => document.body.classList.toString())
    
    if (!bodyClasses.includes(`mode-${mode}`) && !bodyClasses.includes(mode)) {
      violations.push({
        domain: 'workspace_layout',
        issue: 'Workspace mode not reflected in layout',
        details: `WorkspaceMode is "${mode}" but body classes don't reflect it: ${bodyClasses}`,
        evidence: {
          store: diagnostics.workspaceMode,
          bodyClasses,
        },
        recommendation: 'App.tsx must apply workspace mode class to body or root element',
      })
    }
  }
  
  return {
    invariant_id: 'READ_AFTER_WRITE_CONSISTENCY',
    invariant_name: 'Read-after-write consistency',
    passed: violations.length === 0,
    violations,
    severity: 'MEDIUM',
    context: { viewport: context.viewport },
  }
}
