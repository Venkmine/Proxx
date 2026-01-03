/**
 * Truth Surface E2E Test Helpers
 * 
 * Provides utilities for:
 * - Artifact collection (screenshots, DOM snapshots, logs)
 * - Backend mocking
 * - UI state verification
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
  artifactCollector: ArtifactCollector
}

export interface ArtifactCollector {
  saveArtifact: (scenario: string, step: string, type: 'screenshot' | 'dom' | 'console' | 'network', data: string | Buffer) => Promise<void>
  getArtifactPath: (scenario: string, step: string, filename: string) => string
}

/**
 * Extended test fixture with artifact collection
 */
export const test = base.extend<ElectronFixtures>({
  app: async ({}, use) => {
    const projectRoot = path.resolve(__dirname, '../../../..')
    const electronMain = path.join(projectRoot, 'frontend/dist-electron/main.mjs')
    
    // Ensure Electron build exists
    if (!fs.existsSync(electronMain)) {
      throw new Error(
        `Electron main not found at ${electronMain}\n` +
        `Run: cd frontend && pnpm run electron:build`
      )
    }

    const electronPath = path.join(projectRoot, 'frontend/node_modules/.bin/electron')

    // Launch Electron with test mode enabled (but NOT audit mode)
    const app = await electron.launch({
      executablePath: electronPath,
      args: [electronMain],
      env: {
        ...process.env,
        E2E_TEST: 'true',
        E2E_AUDIT_MODE: '0', // Explicitly disable audit mode
        NODE_ENV: 'test',
      },
    })

    await use(app)
    await app.close()
  },
  
  page: async ({ app }, use) => {
    const page = await app.firstWindow()
    await page.waitForLoadState('domcontentloaded', { timeout: 30000 })
    await use(page)
  },

  artifactCollector: async ({}, use) => {
    const projectRoot = path.resolve(__dirname, '../../../..')
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const artifactsBaseDir = path.join(projectRoot, 'artifacts/ui', timestamp)

    const collector: ArtifactCollector = {
      saveArtifact: async (scenario: string, step: string, type: 'screenshot' | 'dom' | 'console' | 'network', data: string | Buffer) => {
        const artifactDir = path.join(artifactsBaseDir, scenario, step)
        fs.mkdirSync(artifactDir, { recursive: true })

        let filename: string
        let content: Buffer | string

        switch (type) {
          case 'screenshot':
            filename = 'screenshot.png'
            content = data
            break
          case 'dom':
            filename = 'dom.html'
            content = data
            break
          case 'console':
            filename = 'console.log'
            content = data
            break
          case 'network':
            filename = 'network.log'
            content = data
            break
        }

        const filePath = path.join(artifactDir, filename)
        fs.writeFileSync(filePath, content)
      },

      getArtifactPath: (scenario: string, step: string, filename: string) => {
        return path.join(artifactsBaseDir, scenario, step, filename)
      }
    }

    await use(collector)
  }
})

export { expect } from '@playwright/test'

/**
 * Collect all artifacts for a test step
 */
export async function collectStepArtifacts(
  page: Page,
  artifactCollector: ArtifactCollector,
  scenario: string,
  step: string,
  consoleLogs: string[],
  networkLogs: string[]
) {
  // Screenshot
  const screenshot = await page.screenshot({ fullPage: true })
  await artifactCollector.saveArtifact(scenario, step, 'screenshot', screenshot)

  // DOM snapshot
  const dom = await page.content()
  await artifactCollector.saveArtifact(scenario, step, 'dom', dom)

  // Console logs
  const consoleContent = consoleLogs.join('\n')
  await artifactCollector.saveArtifact(scenario, step, 'console', consoleContent)

  // Network logs
  const networkContent = networkLogs.join('\n')
  await artifactCollector.saveArtifact(scenario, step, 'network', networkContent)
}
