#!/usr/bin/env node
/**
 * Manual Test for Finder Detection
 * 
 * This script verifies that the Finder detection utility works correctly.
 */

import { isFinderFrontmost, assertFinderNotOpen, FinderDialogError } from './finder_detection.mjs'

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
console.log('  FINDER DETECTION MANUAL TEST')
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
console.log('')

// Test 1: Check current frontmost app
console.log('Test 1: Checking current frontmost app...')
const isFinder = isFinderFrontmost()
console.log(`  Result: ${isFinder ? '🚨 FINDER IS FRONTMOST' : '✅ Finder is NOT frontmost'}`)
console.log('')

// Test 2: assertFinderNotOpen (should throw if Finder is open)
console.log('Test 2: Testing assertFinderNotOpen()...')
try {
  assertFinderNotOpen('test_action')
  console.log('  ✅ No Finder detected - test passed')
} catch (e) {
  if (e instanceof FinderDialogError) {
    console.log('  🚨 FinderDialogError thrown:')
    console.log(`     Message: ${e.message}`)
    console.log(`     Action: ${e.actionName}`)
    console.log(`     Timestamp: ${e.timestamp}`)
  } else {
    console.log(`  ❌ Unexpected error: ${e.message}`)
  }
}
console.log('')

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
console.log('  TEST COMPLETE')
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
