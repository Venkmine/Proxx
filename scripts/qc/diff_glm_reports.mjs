#!/usr/bin/env node
/**
 * GLM Report Diff Utility
 * 
 * Compares two GLM reports to identify changes between runs.
 * 
 * USE CASES:
 * - Compare before/after a code fix
 * - Track visual regression over time
 * - Verify that a fix resolved an issue
 * 
 * OUTPUT:
 * - Prints diff to stdout
 * - Writes diff_report.json if output path specified
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

/**
 * Load GLM report from path (file or directory)
 */
function loadGLMReport(reportPath) {
  let finalPath = reportPath
  
  if (fs.existsSync(reportPath) && fs.statSync(reportPath).isDirectory()) {
    finalPath = path.join(reportPath, 'glm_report.json')
  }
  
  if (!fs.existsSync(finalPath)) {
    throw new Error(`GLM report not found: ${finalPath}`)
  }
  
  return JSON.parse(fs.readFileSync(finalPath, 'utf-8'))
}

/**
 * Compare two answer sets
 */
function compareAnswers(oldAnswers, newAnswers, questionIds) {
  const changes = []
  const allKeys = new Set([...Object.keys(oldAnswers || {}), ...Object.keys(newAnswers || {})])
  
  for (const key of allKeys) {
    const oldVal = oldAnswers?.[key]
    const newVal = newAnswers?.[key]
    
    if (oldVal !== newVal) {
      changes.push({
        questionId: key,
        oldValue: oldVal || '(missing)',
        newValue: newVal || '(missing)',
        improved: oldVal === 'no' && newVal === 'yes' ? 'positive' :
                  oldVal === 'yes' && newVal === 'no' ? 'negative' : 'changed',
      })
    }
  }
  
  return changes
}

/**
 * Find matching screenshot in other report
 */
function findMatchingScreenshot(screenshot, results) {
  // Exact match
  const exact = results.find(r => r.screenshot === screenshot)
  if (exact) return exact
  
  // Try matching by base name (ignoring timestamp directories)
  const baseName = path.basename(screenshot)
  return results.find(r => path.basename(r.screenshot) === baseName)
}

/**
 * Generate diff between two reports
 */
function diffReports(oldReport, newReport) {
  const diff = {
    version: '1.0.0',
    generatedAt: new Date().toISOString(),
    
    oldReport: {
      path: oldReport.artifactPath,
      generatedAt: oldReport.generatedAt,
      screenshotCount: oldReport.results?.length || 0,
    },
    newReport: {
      path: newReport.artifactPath,
      generatedAt: newReport.generatedAt,
      screenshotCount: newReport.results?.length || 0,
    },
    
    questionSetMatch: oldReport.questionSet?.version === newReport.questionSet?.version,
    
    screenshotDiffs: [],
    
    summary: {
      totalComparisons: 0,
      unchanged: 0,
      improved: 0,
      regressed: 0,
      addedScreenshots: 0,
      removedScreenshots: 0,
    },
  }
  
  const oldScreenshots = new Set((oldReport.results || []).map(r => r.screenshot))
  const newScreenshots = new Set((newReport.results || []).map(r => r.screenshot))
  
  // Find added screenshots
  for (const screenshot of newScreenshots) {
    if (!oldScreenshots.has(screenshot) && !findMatchingScreenshot(screenshot, oldReport.results || [])) {
      diff.summary.addedScreenshots++
      diff.screenshotDiffs.push({
        screenshot,
        status: 'added',
        changes: [],
      })
    }
  }
  
  // Find removed screenshots
  for (const screenshot of oldScreenshots) {
    if (!newScreenshots.has(screenshot) && !findMatchingScreenshot(screenshot, newReport.results || [])) {
      diff.summary.removedScreenshots++
      diff.screenshotDiffs.push({
        screenshot,
        status: 'removed',
        changes: [],
      })
    }
  }
  
  // Compare matching screenshots
  for (const oldResult of (oldReport.results || [])) {
    const newResult = findMatchingScreenshot(oldResult.screenshot, newReport.results || [])
    if (!newResult) continue
    
    diff.summary.totalComparisons++
    
    const changes = compareAnswers(
      oldResult.answers,
      newResult.answers,
      (oldReport.questionSet?.questions || []).map(q => q.id)
    )
    
    if (changes.length === 0) {
      diff.summary.unchanged++
      diff.screenshotDiffs.push({
        screenshot: oldResult.screenshot,
        status: 'unchanged',
        changes: [],
      })
    } else {
      const hasImproved = changes.some(c => c.improved === 'positive')
      const hasRegressed = changes.some(c => c.improved === 'negative')
      
      if (hasRegressed) {
        diff.summary.regressed++
      } else if (hasImproved) {
        diff.summary.improved++
      }
      
      diff.screenshotDiffs.push({
        screenshot: oldResult.screenshot,
        status: hasRegressed ? 'regressed' : hasImproved ? 'improved' : 'changed',
        changes,
        oldObservations: oldResult.observations,
        newObservations: newResult.observations,
      })
    }
  }
  
  return diff
}

/**
 * Print diff to console
 */
function printDiff(diff) {
  console.log('')
  console.log('═══════════════════════════════════════════════════════════════')
  console.log('  GLM REPORT DIFF')
  console.log('═══════════════════════════════════════════════════════════════')
  console.log('')
  console.log('  OLD REPORT:')
  console.log(`    Path: ${diff.oldReport.path}`)
  console.log(`    Generated: ${diff.oldReport.generatedAt}`)
  console.log(`    Screenshots: ${diff.oldReport.screenshotCount}`)
  console.log('')
  console.log('  NEW REPORT:')
  console.log(`    Path: ${diff.newReport.path}`)
  console.log(`    Generated: ${diff.newReport.generatedAt}`)
  console.log(`    Screenshots: ${diff.newReport.screenshotCount}`)
  console.log('')
  console.log('───────────────────────────────────────────────────────────────')
  console.log('  SUMMARY')
  console.log('───────────────────────────────────────────────────────────────')
  console.log(`    Comparisons: ${diff.summary.totalComparisons}`)
  console.log(`    Unchanged:   ${diff.summary.unchanged}`)
  console.log(`    Improved:    ${diff.summary.improved} ✅`)
  console.log(`    Regressed:   ${diff.summary.regressed} ❌`)
  console.log(`    Added:       ${diff.summary.addedScreenshots}`)
  console.log(`    Removed:     ${diff.summary.removedScreenshots}`)
  console.log('')
  
  // Show changes
  const changedScreenshots = diff.screenshotDiffs.filter(s => 
    s.status !== 'unchanged' && s.changes?.length > 0
  )
  
  if (changedScreenshots.length > 0) {
    console.log('───────────────────────────────────────────────────────────────')
    console.log('  CHANGES')
    console.log('───────────────────────────────────────────────────────────────')
    
    for (const screenshot of changedScreenshots) {
      const icon = screenshot.status === 'improved' ? '✅' :
                   screenshot.status === 'regressed' ? '❌' : '🔄'
      console.log('')
      console.log(`  ${icon} ${screenshot.screenshot} (${screenshot.status})`)
      
      for (const change of screenshot.changes) {
        const arrow = change.improved === 'positive' ? '→ ✅' :
                      change.improved === 'negative' ? '→ ❌' : '→'
        console.log(`      ${change.questionId}: ${change.oldValue} ${arrow} ${change.newValue}`)
      }
    }
  }
  
  console.log('')
  console.log('═══════════════════════════════════════════════════════════════')
  console.log('')
}

/**
 * Main execution
 */
async function main() {
  const args = process.argv.slice(2)
  
  if (args.length < 2 || args.includes('--help')) {
    console.log(`
Usage: diff_glm_reports.mjs <old-report> <new-report> [--output <path>]

Arguments:
  <old-report>    Path to old GLM report (file or directory)
  <new-report>    Path to new GLM report (file or directory)

Options:
  --output <path>  Write diff to JSON file
  --help           Show this help

Examples:
  # Compare two artifact directories
  node diff_glm_reports.mjs artifacts/ui/visual/2026-01-01 artifacts/ui/visual/2026-01-02

  # Compare specific report files
  node diff_glm_reports.mjs old/glm_report.json new/glm_report.json
`)
    process.exit(args.includes('--help') ? 0 : 1)
  }
  
  let oldPath = args[0]
  let newPath = args[1]
  let outputPath = null
  
  for (let i = 2; i < args.length; i++) {
    if (args[i] === '--output' && args[i + 1]) {
      outputPath = args[++i]
    }
  }
  
  try {
    console.log('Loading reports...')
    const oldReport = loadGLMReport(oldPath)
    const newReport = loadGLMReport(newPath)
    
    console.log('Generating diff...')
    const diff = diffReports(oldReport, newReport)
    
    // Print to console
    printDiff(diff)
    
    // Write to file if requested
    if (outputPath) {
      fs.writeFileSync(outputPath, JSON.stringify(diff, null, 2))
      console.log(`Diff written to: ${outputPath}`)
    }
    
    // Exit code based on regression
    if (diff.summary.regressed > 0) {
      process.exit(1)
    }
    
    process.exit(0)
    
  } catch (error) {
    console.error('❌ Diff failed:', error.message)
    process.exit(1)
  }
}

main()
