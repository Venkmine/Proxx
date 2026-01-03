/**
 * E2E Test Helpers for Electron + Playwright
 * 
 * Provides utilities for:
 * - Launching Electron app in test mode
 * - Polling job status
 * - File system verification
 * - UI interaction helpers
 */

import { test as base, _electron as electron, ElectronApplication, Page } from '@playwright/test'
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

export interface ElectronFixtures {
  app: ElectronApplication
  page: Page
}

/**
 * Extended test fixture that launches Electron app with E2E_TEST=true
 */
export const test = base.extend<ElectronFixtures>({
  app: async ({}, use) => {
    const projectRoot = path.resolve(__dirname, '../..')
    const electronMain = path.join(projectRoot, 'frontend/dist-electron/main.mjs')
    
    // Ensure Electron build exists
    if (!fs.existsSync(electronMain)) {
      throw new Error(
        `Electron main not found at ${electronMain}\n` +
        `Run: cd frontend && pnpm run electron:build`
      )
    }

    // Use Electron from frontend/node_modules
    const electronPath = path.join(projectRoot, 'frontend/node_modules/.bin/electron')

    // Launch Electron with test mode enabled
    const app = await electron.launch({
      executablePath: electronPath,
      args: [electronMain],
      env: {
        ...process.env,
        E2E_TEST: 'true',
        NODE_ENV: 'test',
        // Don't launch actual backend/vite - app should handle missing services gracefully
      },
    })

    await use(app)

    // Cleanup
    await app.close()
  },

  page: async ({ app }, use) => {
    // Get the first window
    const page = await app.firstWindow()
    
    // Wait for app to be ready
    await page.waitForLoadState('domcontentloaded')
    
    await use(page)
  },
})

export { expect } from '@playwright/test'

/**
 * Poll for job status until it reaches expected state or times out
 */
export async function pollJobStatus(
  page: Page,
  jobId: string,
  expectedStatus: 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'FAILED',
  timeoutMs = 30_000
): Promise<void> {
  const startTime = Date.now()
  
  while (Date.now() - startTime < timeoutMs) {
    // Query the UI for job status
    const jobRow = page.locator(`[data-job-id="${jobId}"]`)
    
    if (await jobRow.count() > 0) {
      const statusCell = jobRow.locator('[data-testid="job-status"]')
      const currentStatus = await statusCell.textContent()
      
      if (currentStatus?.includes(expectedStatus)) {
        return // Success!
      }
    }
    
    // Wait before next poll
    await page.waitForTimeout(500)
  }
  
  throw new Error(
    `Job ${jobId} did not reach status ${expectedStatus} within ${timeoutMs}ms`
  )
}

/**
 * Wait for file to exist on disk
 */
export async function waitForFile(
  filePath: string,
  timeoutMs = 10_000
): Promise<void> {
  const startTime = Date.now()
  
  while (Date.now() - startTime < timeoutMs) {
    if (fs.existsSync(filePath)) {
      return // File exists!
    }
    
    await new Promise(resolve => setTimeout(resolve, 500))
  }
  
  throw new Error(`File ${filePath} did not appear within ${timeoutMs}ms`)
}

/**
 * Get test media path
 */
export function getTestMediaPath(filename: string): string {
  const projectRoot = path.resolve(__dirname, '../..')
  return path.join(projectRoot, 'test_media', filename)
}

/**
 * Get temporary output directory for tests
 */
export function getTempOutputDir(): string {
  const projectRoot = path.resolve(__dirname, '../..')
  const tempDir = path.join(projectRoot, 'qa/e2e/temp_output')
  
  // Ensure directory exists
  fs.mkdirSync(tempDir, { recursive: true })
  
  return tempDir
}

/**
 * Clean up temporary test files
 */
export function cleanupTempFiles(dir: string): void {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true })
  }
}

/**
 * RAW format detection utilities
 */

const RAW_EXTENSIONS = new Set([
  '.braw',
  '.r3d', '.R3D',
  '.ari', '.arri',
  '.dng',
  '.cri', '.crm', // Canon RAW
  '.cine', // Phantom
])

// Folder patterns that indicate camera card-style RAW folders
const RAW_FOLDER_INDICATORS = [
  '.RDC', // RED camera clips folder
  '.RDM', // RED metadata
  '.R3D', // RED files inside
  '.braw', // Blackmagic files inside
]

const PRORES_RAW_INDICATORS = ['prores_raw', 'prores raw', 'Apple ProRes RAW', 'PRORES_RAW']

export function isRawFormat(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase()
  
  // Check known RAW extensions
  if (RAW_EXTENSIONS.has(ext)) {
    return true
  }
  
  // For .mov files, need to check if it's ProRes RAW
  // In E2E test context, we'll assume .mov in RAW folders are ProRes RAW
  if (ext === '.mov') {
    // Heuristic: if in a folder named "PRORES_RAW" or "ProRes", assume it's RAW
    if (filePath.includes('PRORES_RAW') || filePath.includes('ProRes')) {
      return true
    }
  }
  
  return false
}

export function determineExpectedEngine(filePath: string): 'resolve' | 'ffmpeg' {
  return isRawFormat(filePath) ? 'resolve' : 'ffmpeg'
}

/**
 * Recursively scan directory for test inputs
 * Returns both files and folders (for camera card-style folders)
 */
export interface TestInput {
  path: string
  type: 'file' | 'folder'
  name: string
  expectedEngine: 'resolve' | 'ffmpeg'
}

export function scanRawDirectory(baseDir: string, excludeDirs: string[] = []): TestInput[] {
  const inputs: TestInput[] = []
  
  function scanRecursive(dir: string) {
    if (!fs.existsSync(dir)) {
      return
    }
    
    const entries = fs.readdirSync(dir, { withFileTypes: true })
    
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name)
      
      // Skip excluded directories
      if (excludeDirs.some(excluded => fullPath.includes(excluded))) {
        continue
      }
      
      // Skip hidden files and DS_Store
      if (entry.name.startsWith('.')) {
        continue
      }
      
      if (entry.isDirectory()) {
        // Check if this is a camera card folder (contains RAW files or special folders like .RDC)
        let isRawFolder = false
        let hasVideoFiles = false
        
        try {
          const contents = fs.readdirSync(fullPath)
          
          // Check for RAW files
          hasVideoFiles = contents.some(file => {
            const ext = path.extname(file).toLowerCase()
            return RAW_EXTENSIONS.has(ext)
          })
          
          // Check for camera card indicators like .RDC folders
          isRawFolder = contents.some(file => {
            const ext = path.extname(file)
            return RAW_FOLDER_INDICATORS.some(indicator => ext === indicator || file.endsWith(indicator))
          })
          
          if (hasVideoFiles || isRawFolder) {
            // Add folder as a test input
            inputs.push({
              path: fullPath,
              type: 'folder',
              name: entry.name,
              expectedEngine: 'resolve' // Folders with RAW files need Resolve
            })
            // Don't scan subdirectories of RAW folders to avoid duplicates
            continue
          }
        } catch (err) {
          // Skip folders we can't read
          console.warn(`Cannot read directory ${fullPath}: ${err}`)
        }
        
        // Continue scanning subdirectories if not a RAW folder
        scanRecursive(fullPath)
      } else if (entry.isFile()) {
        // Only test video files
        const ext = path.extname(entry.name).toLowerCase()
        const videoExts = [
          '.braw', '.r3d', '.ari', '.arri', '.dng',
          '.mov', '.mp4', '.mxf', '.avi',
          '.cri', '.crm', // Canon RAW
          '.cine', // Phantom
          '.mkv', '.webm', // Additional formats
        ]
        
        if (videoExts.includes(ext)) {
          inputs.push({
            path: fullPath,
            type: 'file',
            name: entry.name,
            expectedEngine: determineExpectedEngine(fullPath)
          })
        }
      }
    }
  }
  
  scanRecursive(baseDir)
  return inputs
}
