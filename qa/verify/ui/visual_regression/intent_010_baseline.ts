/**
 * INTENT_010 Baseline Module
 * 
 * Manages baseline comparison for regression detection.
 * Baselines capture layout metadata (not pixels) for each check.
 * 
 * Key features:
 * - Load/save baselines from qa/qc_baselines/intent_010/
 * - Compare current state against baseline
 * - Flag regressions even if still "technically valid"
 * - Support baseline update mode via INTENT_010_UPDATE_BASELINE=1
 */

import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const projectRoot = path.resolve(__dirname, '../../../..')
const BASELINES_DIR = path.join(projectRoot, 'qa/qc_baselines/intent_010')

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export interface CheckBaseline {
  check_id: string
  check_name: string
  expected: Record<string, unknown>
}

export interface BaselineFile {
  version: string
  created: string
  updated?: string
  description: string
  checks: Record<string, CheckBaseline>
}

export interface LayoutSnapshot {
  check_id: string
  timestamp: string
  viewport: { width: number; height: number }
  metrics: Record<string, unknown>
}

export interface RegressionResult {
  check_id: string
  has_regression: boolean
  regression_type?: 'new_issue' | 'metric_drift' | 'degraded'
  message?: string
  baseline_value?: unknown
  current_value?: unknown
  diff?: Record<string, { baseline: unknown; current: unknown }>
}

// ============================================================================
// BASELINE MANAGEMENT
// ============================================================================

/**
 * Load baseline configuration for all checks
 */
export function loadBaselines(): BaselineFile | null {
  const baselinePath = path.join(BASELINES_DIR, 'baseline.json')
  if (!fs.existsSync(baselinePath)) {
    console.log('⚠️  No baseline file found - will create on first run')
    return null
  }
  
  try {
    const content = fs.readFileSync(baselinePath, 'utf-8')
    return JSON.parse(content) as BaselineFile
  } catch (err) {
    console.error(`❌ Failed to load baseline: ${(err as Error).message}`)
    return null
  }
}

/**
 * Load a specific check's snapshot (last captured metrics)
 */
export function loadCheckSnapshot(checkId: string): LayoutSnapshot | null {
  const snapshotPath = path.join(BASELINES_DIR, `${checkId}_snapshot.json`)
  if (!fs.existsSync(snapshotPath)) {
    return null
  }
  
  try {
    const content = fs.readFileSync(snapshotPath, 'utf-8')
    return JSON.parse(content) as LayoutSnapshot
  } catch (err) {
    console.error(`❌ Failed to load snapshot for ${checkId}: ${(err as Error).message}`)
    return null
  }
}

/**
 * Save a check's current metrics as the new snapshot
 */
export function saveCheckSnapshot(snapshot: LayoutSnapshot): void {
  const snapshotPath = path.join(BASELINES_DIR, `${snapshot.check_id}_snapshot.json`)
  fs.mkdirSync(BASELINES_DIR, { recursive: true })
  fs.writeFileSync(snapshotPath, JSON.stringify(snapshot, null, 2))
  console.log(`   💾 Snapshot saved: ${snapshot.check_id}`)
}

/**
 * Check if running in baseline update mode
 */
export function isUpdateMode(): boolean {
  return process.env.INTENT_010_UPDATE_BASELINE === '1'
}

// ============================================================================
// REGRESSION DETECTION
// ============================================================================

/**
 * Compare current metrics against baseline snapshot
 * Flags regressions even if current state is "technically valid"
 */
export function detectRegression(
  checkId: string,
  currentMetrics: Record<string, unknown>,
  viewport: { width: number; height: number }
): RegressionResult {
  const baseline = loadCheckSnapshot(checkId)
  const currentSnapshot: LayoutSnapshot = {
    check_id: checkId,
    timestamp: new Date().toISOString(),
    viewport,
    metrics: currentMetrics,
  }
  
  // If no baseline exists, this is the first run
  if (!baseline) {
    if (isUpdateMode()) {
      saveCheckSnapshot(currentSnapshot)
      return {
        check_id: checkId,
        has_regression: false,
        message: 'First run - baseline created',
      }
    }
    return {
      check_id: checkId,
      has_regression: false,
      message: 'No baseline exists - run with INTENT_010_UPDATE_BASELINE=1 to create',
    }
  }
  
  // Compare metrics
  const diffs: Record<string, { baseline: unknown; current: unknown }> = {}
  let hasRegression = false
  
  for (const key of Object.keys(baseline.metrics)) {
    const baselineValue = baseline.metrics[key]
    const currentValue = currentMetrics[key]
    
    if (!deepEqual(baselineValue, currentValue)) {
      diffs[key] = { baseline: baselineValue, current: currentValue }
      
      // Determine if this is a regression (degradation) vs improvement
      if (isDegradation(key, baselineValue, currentValue)) {
        hasRegression = true
      }
    }
  }
  
  // Check for new metrics that weren't in baseline
  for (const key of Object.keys(currentMetrics)) {
    if (!(key in baseline.metrics)) {
      diffs[key] = { baseline: undefined, current: currentMetrics[key] }
    }
  }
  
  // Update snapshot if in update mode
  if (isUpdateMode() && Object.keys(diffs).length > 0) {
    saveCheckSnapshot(currentSnapshot)
    return {
      check_id: checkId,
      has_regression: false,
      message: 'Baseline updated with current metrics',
      diff: diffs,
    }
  }
  
  if (hasRegression) {
    return {
      check_id: checkId,
      has_regression: true,
      regression_type: 'degraded',
      message: `Metrics degraded from baseline`,
      diff: diffs,
    }
  }
  
  if (Object.keys(diffs).length > 0) {
    return {
      check_id: checkId,
      has_regression: false,
      message: 'Metrics changed but not degraded',
      diff: diffs,
    }
  }
  
  return {
    check_id: checkId,
    has_regression: false,
    message: 'Metrics match baseline',
  }
}

/**
 * Determine if a metric change is a degradation (worse)
 */
function isDegradation(key: string, baseline: unknown, current: unknown): boolean {
  // For count-based metrics, higher is worse
  const worseIfHigher = [
    'nested_count',
    'nested_scrollable_count',
    'clipped_count',
    'panels_with_horizontal_scroll',
    'total_clipped',
  ]
  
  if (worseIfHigher.includes(key)) {
    return (typeof current === 'number' && typeof baseline === 'number' && current > baseline)
  }
  
  // For boolean "resizable", false is worse
  if (key === 'resizable') {
    return baseline === true && current === false
  }
  
  // Default: any change is potentially concerning (flag for review)
  return false
}

/**
 * Deep equality check for objects
 */
function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (typeof a !== typeof b) return false
  if (typeof a !== 'object' || a === null || b === null) return false
  
  const aObj = a as Record<string, unknown>
  const bObj = b as Record<string, unknown>
  
  const aKeys = Object.keys(aObj)
  const bKeys = Object.keys(bObj)
  
  if (aKeys.length !== bKeys.length) return false
  
  for (const key of aKeys) {
    if (!bKeys.includes(key)) return false
    if (!deepEqual(aObj[key], bObj[key])) return false
  }
  
  return true
}

// ============================================================================
// REPORT INTEGRATION
// ============================================================================

/**
 * Generate regression summary for markdown report
 */
export function generateRegressionSection(results: RegressionResult[]): string {
  const lines: string[] = []
  
  const regressions = results.filter(r => r.has_regression)
  const changes = results.filter(r => !r.has_regression && r.diff && Object.keys(r.diff).length > 0)
  
  if (regressions.length === 0 && changes.length === 0) {
    lines.push('### 📊 Baseline Comparison')
    lines.push('')
    lines.push('All metrics match baseline - no regressions detected.')
    lines.push('')
    return lines.join('\n')
  }
  
  if (regressions.length > 0) {
    lines.push('### ⚠️ Regressions Detected')
    lines.push('')
    for (const r of regressions) {
      lines.push(`**${r.check_id}**: ${r.message}`)
      lines.push('')
      if (r.diff) {
        lines.push('| Metric | Baseline | Current |')
        lines.push('|--------|----------|---------|')
        for (const [key, { baseline, current }] of Object.entries(r.diff)) {
          lines.push(`| ${key} | ${JSON.stringify(baseline)} | ${JSON.stringify(current)} |`)
        }
        lines.push('')
      }
    }
  }
  
  if (changes.length > 0) {
    lines.push('### 📋 Metric Changes (Non-Regression)')
    lines.push('')
    for (const r of changes) {
      lines.push(`**${r.check_id}**: ${r.message}`)
      lines.push('')
    }
  }
  
  return lines.join('\n')
}
