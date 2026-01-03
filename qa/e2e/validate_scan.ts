/**
 * Quick validation script to test directory scanning logic
 * Run with: npx tsx validate_scan.ts
 */

import { scanRawDirectory } from './helpers'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const projectRoot = path.resolve(__dirname, '../..')
const rawSamplesDir = path.join(projectRoot, 'forge-tests/samples/RAW')

console.log(`\n🔍 Scanning: ${rawSamplesDir}`)
console.log(`Excluding: Image_SEQS\n`)

const testInputs = scanRawDirectory(rawSamplesDir, ['Image_SEQS'])

console.log(`\n📊 Results:`)
console.log(`Total inputs discovered: ${testInputs.length}`)
console.log(`  - Files: ${testInputs.filter(i => i.type === 'file').length}`)
console.log(`  - Folders: ${testInputs.filter(i => i.type === 'folder').length}`)
console.log(`  - RAW (Resolve): ${testInputs.filter(i => i.expectedEngine === 'resolve').length}`)
console.log(`  - Non-RAW (FFmpeg): ${testInputs.filter(i => i.expectedEngine === 'ffmpeg').length}`)

console.log(`\n📁 Sample inputs (first 10):`)
testInputs.slice(0, 10).forEach((input, idx) => {
  console.log(`  ${idx + 1}. ${input.name} (${input.type}, ${input.expectedEngine})`)
})

console.log(`\n✅ Scan validation complete!`)
