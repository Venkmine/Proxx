/**
 * Internal Audit E2E Test Helpers
 * 
 * Similar to truth surface helpers but runs with E2E_AUDIT_MODE=1
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
 * Extended test fixture with AUDIT MODE enabled
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

    // Launch Electron with AUDIT MODE enabled
    const app = await electron.launch({
      executablePath: electronPath,
      args: [electronMain],
      env: {
        ...process.env,
        E2E_TEST: 'true',
        E2E_AUDIT_MODE: '1', // Enable audit mode
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
})

export { expect } from '@playwright/test'
