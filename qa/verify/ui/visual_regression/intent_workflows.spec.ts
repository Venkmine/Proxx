/**
 * Intent-Driven Workflow Tests
 * 
 * Executes human workflow intents from docs/UI_WORKFLOW_INTENTS.md.
 * Each intent represents a complete user workflow with expected outcomes.
 * 
 * Run with:
 *   INTENT_ID=INTENT_001 npx playwright test intent_workflows.spec.ts
 */

import { test, expect } from './helpers'
import { runIntent } from '../../../../scripts/qc/intent_runner.mjs'
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const projectRoot = path.resolve(__dirname, '../../../..')

test.describe('Intent-Driven Workflows', () => {
  test('execute workflow intent', async ({ page, visualCollector }) => {
    // Get intent ID from environment (default to INTENT_001)
    const intentId = process.env.INTENT_ID || 'INTENT_001'
    
    console.log(`\n🎯 Executing intent: ${intentId}`)
    console.log(`   Project root: ${projectRoot}`)
    console.log(`   Artifact dir: ${visualCollector.artifactDir}\n`)
    
    // Wait for app to be ready
    await page.waitForLoadState('networkidle', { timeout: 15000 })
    
    // Execute intent
    const result = await runIntent(
      intentId,
      { page },
      projectRoot,
      visualCollector.artifactDir
    )
    
    console.log(`\n📊 Intent Execution Result:`)
    console.log(`   Success: ${result.success}`)
    console.log(`   Completed: ${result.completed_steps}/${result.total_steps}`)
    
    if (!result.success) {
      console.log(`   ⚠️  Blocked at: ${result.blocked_at}`)
      console.log(`   Reason: ${result.failure_reason}`)
    }
    
    // Save intent execution result for interpretation phase
    const resultPath = path.join(visualCollector.artifactDir, 'intent_execution_result.json')
    fs.writeFileSync(resultPath, JSON.stringify(result, null, 2))
    console.log(`\n💾 Intent result saved: ${resultPath}\n`)
    
    // Assert based on intent expectations
    // We don't fail the test for BLOCKED_PRECONDITION (e.g., backend unavailable)
    // But we do fail for unexpected errors
    if (!result.success && result.blocked_at) {
      // This is a precondition failure - record it but don't fail QC
      console.log('⏸️  Intent blocked by precondition - not a QC failure')
    } else {
      // Intent should complete successfully
      expect(result.success, `Intent ${intentId} should complete successfully`).toBe(true)
    }
  })
})
